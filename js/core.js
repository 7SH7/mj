'use strict';

// SLIP OUT: core layer
const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const ui = {
    menu: $('menu'), hud: $('hud'), playerHud: $('playerHud'), zone: $('zoneValue'),
    time: $('timeValue'), mode: $('modeValue'), objective: $('objective'),
    center: $('centerMessage'), toast: $('toast'), pause: $('pauseScreen'),
    results: $('resultScreen'), resultEyebrow: $('resultEyebrow'), resultTitle: $('resultTitle'),
    resultSummary: $('resultSummary'), score: $('scoreValue'), resultTime: $('resultTime'),
    resultDeaths: $('resultDeaths'), resultRescues: $('resultRescues'),
    resultMultiplier: $('resultMultiplier'), record: $('recordMessage'), sound: $('soundButton'),
    settings: $('settingsScreen'), keyBindings: $('keyBindings'), bindingHint: $('bindingHint'),
    rankings: $('rankings'), mobileControls: $('mobileControls'), joystick: $('joystick'),
    joystickKnob: $('joystickKnob'), rotateHint: document.querySelector('.rotate-hint'),
    reviveChoice: $('reviveChoiceOverlay'), reviveChoicePlayer: $('reviveChoicePlayer'),
    reviveChoiceCountdown: $('reviveChoiceCountdown'),
    mapValue: $('mapValue'), mapDifficulty: $('mapDifficulty'), mapDescription: $('mapDescription'),
    mapBriefName: $('mapBriefName'), mapBriefDescription: $('mapBriefDescription')
  };

  const TAU = Math.PI * 2;
  const WORLD = { width: 8600, height: 1600 };
  const PLAYER_COLORS = ['#58f7ff', '#ff5c8d', '#b4ff62', '#bc78ff'];
  const BASE_ZONE_NAMES = ['관성 입문', '타이밍 격벽', '구조 분기', '과속 커브', '붕괴 탈출'];
  const BASE_ZONE_OBJECTIVES = [
    '가속과 선회를 익혀 첫 안전 구역에 도달하세요',
    '회전봉과 개폐 주기를 읽고 통과하세요',
    '위험한 지름길과 안전한 우회로를 선택하세요',
    '가속 장판의 속도를 버리며 급커브를 통과하세요',
    '붕괴 지대를 건너 최종 탈출 장치를 활성화하세요'
  ];
  const DEFAULT_CONTROL_MAPS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', boost: 'ShiftLeft', brake: 'KeyE' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'Enter', boost: 'ShiftRight', brake: 'Slash' },
    { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', jump: 'KeyU', boost: 'KeyO', brake: 'KeyP' },
    { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', jump: 'Numpad7', boost: 'Numpad9', brake: 'Numpad0' }
  ];
  const CONTROL_ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'boost', 'brake'];
  const ACTION_LABELS = { up: '위 / 가속', down: '아래 / 감속', left: '왼쪽 조향', right: '오른쪽 조향', jump: '점프', boost: '부스터', brake: '브레이크' };
  function cloneDefaultControls() { return DEFAULT_CONTROL_MAPS.map(map => ({ ...map })); }
  function loadControlMaps() {
    try {
      const saved = JSON.parse(localStorage.getItem('slip-out-controls-v1'));
      if (!Array.isArray(saved) || saved.length !== 4) return cloneDefaultControls();
      return DEFAULT_CONTROL_MAPS.map((defaults, index) => {
        const candidate = saved[index] || {};
        return Object.fromEntries(CONTROL_ACTIONS.map(action => [action, typeof candidate[action] === 'string' ? candidate[action] : defaults[action]]));
      });
    } catch { return cloneDefaultControls(); }
  }
  let controlMaps = loadControlMaps();
  const isGameplayKey = (code) => code === 'Escape' || controlMaps.some(map => Object.values(map).includes(code));
  const exitDuration = () => 2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const length = (x, y) => Math.hypot(x, y);
  const normalize = (x, y) => {
    const n = Math.hypot(x, y);
    return n > 0.0001 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
  };
  const pointInRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const roundedRect = (x, y, w, h, radius = 16) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  };
  const rgba = (hex, alpha) => {
    const value = hex.replace('#', '');
    const n = parseInt(value.length === 3 ? value.split('').map(c => c + c).join('') : value, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  };

  let cssWidth = innerWidth;
  let cssHeight = innerHeight;
  let dpr = 1;
  function resize() {
    cssWidth = innerWidth;
    cssHeight = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }
  addEventListener('resize', resize);
  resize();

  class SoundEngine {
    constructor() { this.context = null; this.enabled = true; }
    init() {
      if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume();
    }
    tone(freq, duration = .1, type = 'sine', volume = .035, endFreq = freq) {
      if (!this.enabled) return;
      this.init();
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(this.context.destination);
      osc.start(now); osc.stop(now + duration);
    }
    noise(duration = .08, volume = .025) {
      if (!this.enabled) return;
      this.init();
      const count = Math.ceil(this.context.sampleRate * duration);
      const buffer = this.context.createBuffer(1, count, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) data[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = 'highpass'; filter.frequency.value = 500;
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
      source.buffer = buffer; source.connect(filter).connect(gain).connect(this.context.destination); source.start();
    }
    boost() { this.tone(180, .22, 'sawtooth', .035, 620); }
    jump() { this.tone(380, .1, 'sine', .025, 680); }
    brake() { this.noise(.18, .02); this.tone(150, .15, 'triangle', .018, 80); }
    hit() { this.noise(.1, .045); this.tone(100, .12, 'square', .025, 55); }
    down() { this.tone(280, .32, 'sawtooth', .035, 55); }
    rescue() { this.tone(350, .15, 'sine', .04, 820); setTimeout(() => this.tone(700, .16, 'sine', .03, 980), 70); }
    checkpoint() { [440, 600, 820].forEach((f, i) => setTimeout(() => this.tone(f, .2, 'sine', .025, f * 1.1), i * 80)); }
    win() { [330, 440, 550, 880].forEach((f, i) => setTimeout(() => this.tone(f, .35, 'triangle', .035, f * 1.06), i * 105)); }
  }
  const sound = new SoundEngine();

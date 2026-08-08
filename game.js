(() => {
  'use strict';

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
    resultMultiplier: $('resultMultiplier'), record: $('recordMessage'), sound: $('soundButton')
  };

  const TAU = Math.PI * 2;
  const WORLD = { width: 8600, height: 1600 };
  const PLAYER_COLORS = ['#58f7ff', '#ff5c8d', '#b4ff62', '#bc78ff'];
  const ZONE_NAMES = ['관성 입문', '타이밍 격벽', '구조 분기', '과속 커브', '붕괴 탈출'];
  const ZONE_OBJECTIVES = [
    '가속과 선회를 익혀 첫 안전 구역에 도달하세요',
    '회전봉과 개폐 주기를 읽고 통과하세요',
    '위험한 지름길과 안전한 우회로를 선택하세요',
    '가속 장판의 속도를 버리며 급커브를 통과하세요',
    '붕괴 지대를 건너 최종 탈출 장치를 활성화하세요'
  ];
  const CONTROL_MAPS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', boost: 'KeyQ', brake: 'KeyE' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'Enter', boost: 'ShiftRight', brake: 'Slash' },
    { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', jump: 'KeyU', boost: 'KeyO', brake: 'KeyP' },
    { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', jump: 'Numpad7', boost: 'Numpad9', brake: 'Numpad0' }
  ];
  const BLOCKED_KEYS = new Set(Object.values(CONTROL_MAPS).flatMap(Object.values).concat(['Escape']));

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

  const keys = new Set();
  addEventListener('keydown', (event) => {
    if (BLOCKED_KEYS.has(event.code) && (state === 'playing' || state === 'paused')) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Escape' && (state === 'playing' || state === 'paused')) togglePause();
    if (event.code === 'Enter' && state === 'menu') startGame();
    else if (event.code === 'Enter' && state === 'results') startGame();
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());

  function readInput(player) {
    const map = CONTROL_MAPS[player.id];
    let x = (keys.has(map.right) ? 1 : 0) - (keys.has(map.left) ? 1 : 0);
    let y = (keys.has(map.down) ? 1 : 0) - (keys.has(map.up) ? 1 : 0);
    let jump = keys.has(map.jump), boost = keys.has(map.boost), brake = keys.has(map.brake);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[player.id];
    if (pad) {
      const dead = .2;
      const ax = Math.abs(pad.axes[0] || 0) > dead ? pad.axes[0] : 0;
      const ay = Math.abs(pad.axes[1] || 0) > dead ? pad.axes[1] : 0;
      if (Math.hypot(ax, ay) > Math.hypot(x, y)) { x = ax; y = ay; }
      jump ||= !!pad.buttons[0]?.pressed;
      boost ||= !!pad.buttons[1]?.pressed;
      brake ||= !!pad.buttons[2]?.pressed || (pad.buttons[6]?.value || 0) > .4;
    }
    const n = Math.hypot(x, y);
    if (n > 1) { x /= n; y /= n; }
    const current = { x, y, jump, boost, brake };
    const previous = player.previousInput || {};
    current.jumpPressed = jump && !previous.jump;
    current.boostPressed = boost && !previous.boost;
    current.brakePressed = brake && !previous.brake;
    player.previousInput = { jump, boost, brake };
    return current;
  }

  const floors = [
    { x: 80, y: 300, w: 820, h: 1000, type: 'safe', zone: 0 },
    { x: 820, y: 235, w: 1440, h: 1130, type: 'ice', zone: 0 },
    { x: 2170, y: 445, w: 390, h: 710, type: 'safe', zone: 0 },
    { x: 2480, y: 275, w: 1470, h: 1050, type: 'ice', zone: 1 },
    { x: 3890, y: 420, w: 390, h: 760, type: 'safe', zone: 1 },
    { x: 4200, y: 500, w: 310, h: 600, type: 'ice', zone: 2 },
    { x: 4400, y: 155, w: 950, h: 570, type: 'ice', zone: 2 },
    { x: 4400, y: 875, w: 950, h: 570, type: 'ice', zone: 2 },
    { x: 5250, y: 500, w: 330, h: 600, type: 'ice', zone: 2 },
    { x: 5480, y: 385, w: 330, h: 830, type: 'safe', zone: 2 },
    { x: 5750, y: 575, w: 670, h: 450, type: 'ice', zone: 3 },
    { x: 6270, y: 330, w: 460, h: 695, type: 'ice', zone: 3 },
    { x: 6580, y: 330, w: 500, h: 450, type: 'black', zone: 3 },
    { x: 6990, y: 280, w: 340, h: 680, type: 'safe', zone: 3 },
    { x: 7270, y: 130, w: 1260, h: 1340, type: 'ice', zone: 4 },
  ];
  const holes = [
    { kind: 'circle', x: 1210, y: 920, r: 100 }, { kind: 'circle', x: 1590, y: 500, r: 82 },
    { kind: 'circle', x: 1910, y: 980, r: 115 }, { kind: 'rect', x: 2860, y: 275, w: 170, h: 250 },
    { kind: 'rect', x: 3290, y: 1075, w: 210, h: 250 },
    { kind: 'circle', x: 7700, y: 370, r: 110 }, { kind: 'circle', x: 7930, y: 1210, r: 100 }
  ];
  const boostPads = [
    { x: 5880, y: 665, w: 180, h: 270, dirX: 1, dirY: 0 },
    { x: 6140, y: 665, w: 170, h: 270, dirX: 1, dirY: -.1 },
    { x: 6410, y: 520, w: 190, h: 210, dirX: .72, dirY: -.68 }
  ];
  const slowPads = [{ x: 6820, y: 430, w: 180, h: 250 }];
  const checkpoints = [
    { x: 430, y: 800, zone: 0 }, { x: 2350, y: 800, zone: 1 },
    { x: 4070, y: 800, zone: 2 }, { x: 5630, y: 800, zone: 3 }, { x: 7150, y: 620, zone: 4 }
  ];
  const pillars = [
    { x: 1120, y: 500, r: 58 }, { x: 1430, y: 1120, r: 67 }, { x: 1770, y: 740, r: 58 },
    { x: 2090, y: 410, r: 46 }, { x: 2640, y: 480, r: 50 }, { x: 3680, y: 1110, r: 50 },
    { x: 4680, y: 430, r: 54 }, { x: 4890, y: 1170, r: 54 }, { x: 7500, y: 760, r: 62 },
    { x: 8050, y: 680, r: 52 }
  ];
  const rotors = [
    { x: 2850, y: 800, length: 390, width: 26, speed: 1.15, angle: .2 },
    { x: 3520, y: 720, length: 440, width: 28, speed: -1.42, angle: 1.1 },
    { x: 4720, y: 1140, length: 300, width: 24, speed: 1.25, angle: .4 },
    { x: 7830, y: 770, length: 390, width: 30, speed: -1.65, angle: .8 }
  ];
  const movers = [
    { baseX: 3170, baseY: 420, x: 3170, y: 420, w: 95, h: 270, axis: 'y', amp: 390, speed: 1.2, phase: 0 },
    { baseX: 3730, baseY: 560, x: 3730, y: 560, w: 85, h: 300, axis: 'y', amp: 260, speed: 1.55, phase: 2.2 },
    { baseX: 5020, baseY: 220, x: 5020, y: 220, w: 150, h: 105, axis: 'x', amp: 130, speed: 1.3, phase: .8 },
    { baseX: 5030, baseY: 1270, x: 5030, y: 1270, w: 150, h: 105, axis: 'x', amp: 140, speed: 1.45, phase: 2.4 },
    { baseX: 8110, baseY: 1000, x: 8110, y: 1000, w: 125, h: 200, axis: 'y', amp: 310, speed: 1.3, phase: 1.1 }
  ];
  const gates = [
    { x: 3830, y: 275, w: 48, h: 1050, period: 3.8, openFor: 1.55, phase: .3 },
    { x: 5280, y: 155, w: 46, h: 570, period: 3.2, openFor: 1.3, phase: 1.7 },
    { x: 5280, y: 875, w: 46, h: 570, period: 3.2, openFor: 1.3, phase: .1 }
  ];
  const launchers = [
    { x: 4350, y: 280, dirX: 0, dirY: 1, period: 1.8, last: 0 },
    { x: 5150, y: 760, dirX: -1, dirY: 0, period: 2.1, last: 0 },
    { x: 7420, y: 150, dirX: 0, dirY: 1, period: 1.55, last: 0 },
    { x: 8260, y: 1450, dirX: 0, dirY: -1, period: 1.7, last: 0 }
  ];
  const collapseTiles = [];
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 3; row++) {
      collapseTiles.push({ x: 7350 + col * 235, y: 520 + row * 225, w: 200, h: 190, state: 'idle', timer: 0, seed: col * 3 + row });
    }
  }
  const exit = { x: 8370, y: 800, r: 128 };

  function isHole(x, y) {
    for (const h of holes) {
      if (h.kind === 'circle' && dist(x, y, h.x, h.y) < h.r) return true;
      if (h.kind === 'rect' && pointInRect(x, y, h)) return true;
    }
    for (const tile of collapseTiles) {
      if (tile.state === 'gone' && pointInRect(x, y, tile)) return true;
    }
    return false;
  }

  function surfaceAt(x, y) {
    if (isHole(x, y)) return null;
    let surface = null;
    for (const floor of floors) if (pointInRect(x, y, floor)) surface = floor;
    if (!surface) return null;
    for (const pad of boostPads) if (pointInRect(x, y, pad)) return { ...surface, type: 'boost', pad };
    for (const pad of slowPads) if (pointInRect(x, y, pad)) return { ...surface, type: 'slow' };
    return surface;
  }

  let state = 'menu';
  let selectedPlayers = 1;
  let selectedMode = 'normal';
  let players = [];
  let particles = [];
  let projectiles = [];
  let enemies = [];
  let worldTime = 0;
  let runTime = 0;
  let deaths = 0;
  let rescues = 0;
  let checkpointIndex = 0;
  let startCountdown = 0;
  let wipeTimer = 0;
  let exitActive = false;
  let exitTimer = 15;
  let toastTimer = 0;
  let hudTimer = 0;
  let shake = 0;
  let lastTimestamp = performance.now();
  let resultData = null;
  const camera = { x: 620, y: 800, zoom: 1 };

  function createPlayer(id, spawn) {
    return {
      id, color: PLAYER_COLORS[id], x: spawn.x, y: spawn.y + (id - (selectedPlayers - 1) / 2) * 52,
      vx: 0, vy: 0, r: 19, z: 0, vz: 0, hp: 100, invulnerable: .8,
      brakeCharges: selectedMode === 'extreme' ? 0 : 2, brakeRegen: 0, brakeTimer: 0,
      boostCooldown: 0, padCooldown: 0, downed: false, escaped: false,
      coreX: 0, coreY: 0, lastGroundX: spawn.x, lastGroundY: spawn.y,
      trail: [], previousInput: {}, exitHold: 0, zone: 0
    };
  }

  function resetDynamics() {
    projectiles = [];
    enemies = [
      { x: 4790, y: 410, homeX: 4790, homeY: 410, vx: 0, vy: 0, r: 31, zone: 2 },
      { x: 5120, y: 1190, homeX: 5120, homeY: 1190, vx: 0, vy: 0, r: 31, zone: 2 },
      { x: 7680, y: 1060, homeX: 7680, homeY: 1060, vx: 0, vy: 0, r: 34, zone: 4 }
    ];
    launchers.forEach(l => l.last = worldTime + Math.random());
    collapseTiles.forEach(t => { t.state = 'idle'; t.timer = 0; });
  }

  function startGame() {
    sound.init();
    state = 'playing';
    worldTime = 0; runTime = 0; deaths = 0; rescues = 0; checkpointIndex = 0;
    wipeTimer = 0; exitActive = false; exitTimer = 15; particles = []; resultData = null;
    players = Array.from({ length: selectedPlayers }, (_, i) => createPlayer(i, checkpoints[0]));
    resetDynamics();
    camera.x = 560; camera.y = 800; camera.zoom = 1;
    startCountdown = 3.25;
    ui.menu.classList.remove('is-visible');
    ui.results.classList.remove('is-visible');
    ui.pause.classList.remove('is-visible');
    ui.hud.classList.add('is-visible');
    buildPlayerHud();
    showCenter('3', '관성을 느낄 준비를 하세요', .8);
  }

  function returnToMenu() {
    state = 'menu';
    ui.menu.classList.add('is-visible');
    ui.hud.classList.remove('is-visible');
    ui.pause.classList.remove('is-visible');
    ui.results.classList.remove('is-visible');
    camera.x = 800; camera.y = 800; camera.zoom = .9;
  }

  function togglePause() {
    if (state === 'playing') { state = 'paused'; ui.pause.classList.add('is-visible'); }
    else if (state === 'paused') { state = 'playing'; ui.pause.classList.remove('is-visible'); lastTimestamp = performance.now(); }
  }

  function buildPlayerHud() {
    ui.playerHud.innerHTML = players.map(p => `
      <div class="player-chip" id="playerChip${p.id}" style="--player:${p.color};--hp:100%">
        <div class="chip-top"><span>P${p.id + 1}</span><span class="chip-state">ACTIVE</span></div>
        <div class="hp"><i></i></div><div class="charges"><i class="on"></i><i class="on"></i></div>
      </div>`).join('');
  }

  function showCenter(title, subtitle = '', duration = 1.2, color = '#eaf9ff') {
    ui.center.style.color = color;
    ui.center.innerHTML = `${title}${subtitle ? `<small>${subtitle}</small>` : ''}`;
    ui.center.classList.add('show');
    clearTimeout(showCenter.timeout);
    showCenter.timeout = setTimeout(() => ui.center.classList.remove('show'), duration * 1000);
  }

  function showToast(message, duration = 2.2) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastTimer = duration;
  }

  function spawnParticles(x, y, color, count = 12, speed = 150) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = speed * (.35 + Math.random() * .75);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: .35 + Math.random() * .45, maxLife: .8, size: 2 + Math.random() * 5, color });
    }
  }

  function downPlayer(player, reason = '충돌') {
    if (player.downed || player.escaped) return;
    player.downed = true;
    player.coreX = player.lastGroundX;
    player.coreY = player.lastGroundY;
    player.vx = player.vy = 0;
    deaths++;
    shake = Math.max(shake, 15);
    spawnParticles(player.coreX, player.coreY, player.color, 28, 230);
    sound.down();
    showToast(`P${player.id + 1} 구조 신호 — 코어를 스치면 즉시 부활`);
    const active = players.filter(p => !p.downed && !p.escaped);
    const escaped = players.filter(p => p.escaped);
    if (!active.length) {
      if (escaped.length) finishRun(true);
      else { wipeTimer = 1.35; showCenter('TEAM WIPE', reason, 1.25, '#ff4d78'); }
    }
  }

  function revivePlayer(player, rescuer) {
    player.downed = false;
    player.x = player.coreX; player.y = player.coreY;
    player.lastGroundX = player.x; player.lastGroundY = player.y;
    player.vx = rescuer.vx * .12; player.vy = rescuer.vy * .12;
    player.hp = 100; player.z = 0; player.vz = 0;
    player.invulnerable = selectedMode === 'extreme' ? 0 : .18;
    rescues++;
    spawnParticles(player.x, player.y, player.color, 30, 200);
    sound.rescue();
    showCenter('RESCUE!', `P${rescuer.id + 1} → P${player.id + 1}`, .75, player.color);
  }

  function restartFromCheckpoint() {
    const resetIndex = selectedMode === 'extreme' ? 0 : checkpointIndex;
    checkpointIndex = resetIndex;
    const spawn = checkpoints[resetIndex];
    players.forEach((p, i) => {
      p.x = spawn.x - i * 36; p.y = spawn.y + (i - (players.length - 1) / 2) * 52;
      p.vx = p.vy = p.vz = p.z = 0; p.hp = 100; p.downed = false; p.escaped = false;
      p.invulnerable = 1; p.lastGroundX = p.x; p.lastGroundY = p.y; p.trail.length = 0;
      p.brakeCharges = selectedMode === 'extreme' ? 0 : 2; p.brakeRegen = 0; p.exitHold = 0;
    });
    wipeTimer = 0; exitActive = false; exitTimer = 15;
    resetDynamics();
    camera.x = spawn.x; camera.y = spawn.y;
    showCenter(selectedMode === 'extreme' ? 'HARD RESET' : 'CHECKPOINT', selectedMode === 'extreme' ? '출발 지점으로 복귀' : '팀 재정렬 완료', 1.1, '#54f5ff');
  }

  function setCheckpoint(index) {
    if (index <= checkpointIndex) return;
    checkpointIndex = index;
    sound.checkpoint();
    spawnParticles(checkpoints[index].x, checkpoints[index].y, '#54f5ff', 38, 170);
    showCenter(`SECTOR ${String(index + 1).padStart(2, '0')}`, ZONE_NAMES[index], 1.35, '#54f5ff');
  }

  function damagePlayer(player, amount, nx, ny, force = 210) {
    if (player.invulnerable > 0 || player.downed || player.escaped || player.z > 30) return;
    player.hp -= amount;
    player.invulnerable = .48;
    player.vx += nx * force; player.vy += ny * force;
    shake = Math.max(shake, 8);
    spawnParticles(player.x, player.y, '#ff5c7a', 10, 120);
    sound.hit();
    if (player.hp <= 0) downPlayer(player, '에너지 소진');
  }

  function resolveCircleRect(player, rect, damage = 18, force = 210) {
    const nearestX = clamp(player.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(player.y, rect.y, rect.y + rect.h);
    let dx = player.x - nearestX, dy = player.y - nearestY;
    let d = Math.hypot(dx, dy);
    if (d >= player.r || player.z > 30) return false;
    if (d < .001) {
      const sides = [
        { depth: Math.abs(player.x - rect.x), x: -1, y: 0 },
        { depth: Math.abs(rect.x + rect.w - player.x), x: 1, y: 0 },
        { depth: Math.abs(player.y - rect.y), x: 0, y: -1 },
        { depth: Math.abs(rect.y + rect.h - player.y), x: 0, y: 1 }
      ].sort((a, b) => a.depth - b.depth);
      dx = sides[0].x; dy = sides[0].y; d = 1;
    }
    const nx = dx / d, ny = dy / d;
    player.x += nx * (player.r - d + 1); player.y += ny * (player.r - d + 1);
    const dot = player.vx * nx + player.vy * ny;
    if (dot < 0) { player.vx -= 1.55 * dot * nx; player.vy -= 1.55 * dot * ny; }
    damagePlayer(player, damage, nx, ny, force);
    return true;
  }

  function collideCircle(player, obstacle, damage = 12, force = 180) {
    if (player.z > 30) return false;
    let dx = player.x - obstacle.x, dy = player.y - obstacle.y;
    let d = Math.hypot(dx, dy);
    const min = player.r + obstacle.r;
    if (d >= min) return false;
    if (d < .001) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    player.x += nx * (min - d + 1); player.y += ny * (min - d + 1);
    const dot = player.vx * nx + player.vy * ny;
    if (dot < 0) { player.vx -= 1.65 * dot * nx; player.vy -= 1.65 * dot * ny; }
    damagePlayer(player, damage, nx, ny, force);
    return true;
  }

  function collideRotor(player, rotor) {
    if (player.z > 34) return;
    const angle = rotor.angle + worldTime * rotor.speed;
    const dx = Math.cos(angle) * rotor.length / 2;
    const dy = Math.sin(angle) * rotor.length / 2;
    const ax = rotor.x - dx, ay = rotor.y - dy, bx = rotor.x + dx, by = rotor.y + dy;
    const abx = bx - ax, aby = by - ay;
    const t = clamp(((player.x - ax) * abx + (player.y - ay) * aby) / (abx * abx + aby * aby), 0, 1);
    const cx = ax + abx * t, cy = ay + aby * t;
    const ox = player.x - cx, oy = player.y - cy;
    const d = Math.hypot(ox, oy);
    const min = player.r + rotor.width / 2;
    if (d >= min) return;
    const n = d > .001 ? { x: ox / d, y: oy / d } : normalize(-dy, dx);
    player.x += n.x * (min - d + 1); player.y += n.y * (min - d + 1);
    const tangent = normalize(-dy, dx);
    const sweep = Math.sign(rotor.speed) * Math.abs(rotor.speed) * rotor.length * .42;
    player.vx += tangent.x * sweep; player.vy += tangent.y * sweep;
    damagePlayer(player, 34, n.x, n.y, 310);
  }

  function updatePlayer(player, dt) {
    if (player.downed || player.escaped) return;
    const input = readInput(player);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.boostCooldown = Math.max(0, player.boostCooldown - dt);
    player.padCooldown = Math.max(0, player.padCooldown - dt);
    const surface = surfaceAt(player.x, player.y);
    const speed = Math.hypot(player.vx, player.vy);

    if (input.jumpPressed && player.z <= .01) {
      player.vz = 285; player.z = .1; sound.jump();
      spawnParticles(player.x, player.y, player.color, 7, 75);
    }
    if (player.z > 0 || player.vz > 0) {
      player.vz -= 760 * dt;
      player.z += player.vz * dt;
      if (player.z <= 0) { player.z = 0; player.vz = 0; }
    }

    if (input.boostPressed && player.boostCooldown <= 0) {
      let dir = normalize(input.x, input.y);
      if (!dir.x && !dir.y) dir = normalize(player.vx, player.vy);
      if (!dir.x && !dir.y) dir = { x: 1, y: 0 };
      player.vx += dir.x * 275; player.vy += dir.y * 275;
      player.boostCooldown = 1.85;
      sound.boost(); shake = Math.max(shake, 4);
      spawnParticles(player.x - dir.x * 15, player.y - dir.y * 15, player.color, 14, 140);
    }

    if (selectedMode !== 'extreme' && input.brakePressed && player.brakeCharges > 0 && player.brakeTimer <= 0) {
      player.brakeCharges--; player.brakeTimer = .48; player.brakeRegen = 0;
      sound.brake(); spawnParticles(player.x, player.y, '#d8fbff', 12, 85);
    }
    player.brakeTimer = Math.max(0, player.brakeTimer - dt);
    if (selectedMode !== 'extreme' && player.brakeCharges < 2) {
      player.brakeRegen += dt;
      if (player.brakeRegen >= 4.5) { player.brakeCharges++; player.brakeRegen = 0; sound.tone(520, .08, 'sine', .015, 720); }
    }

    const inputLength = Math.hypot(input.x, input.y);
    if (inputLength > .05) {
      const velocityDir = speed > 1 ? { x: player.vx / speed, y: player.vy / speed } : { x: input.x, y: input.y };
      const dot = input.x * velocityDir.x + input.y * velocityDir.y;
      const parallelX = velocityDir.x * dot, parallelY = velocityDir.y * dot;
      const turnFactor = lerp(1, .42, clamp(speed / 470, 0, 1));
      const ax = parallelX + (input.x - parallelX) * turnFactor;
      const ay = parallelY + (input.y - parallelY) * turnFactor;
      const acceleration = surface?.type === 'safe' ? 580 : 690;
      player.vx += ax * acceleration * dt; player.vy += ay * acceleration * dt;
    }

    let friction = .2;
    if (surface?.type === 'safe') friction = 3.4;
    else if (surface?.type === 'slow') friction = 7.2;
    else if (surface?.type === 'black') friction = .07;
    if (player.brakeTimer > 0) friction = 8.8;
    const drag = Math.exp(-friction * dt);
    player.vx *= drag; player.vy *= drag;

    let maxSpeed = surface?.type === 'safe' ? 390 : 490;
    if (player.boostCooldown > 1.45) maxSpeed = 680;
    const newSpeed = Math.hypot(player.vx, player.vy);
    if (newSpeed > maxSpeed) {
      const excessDrag = 1 - Math.min(.8, dt * 1.7);
      const target = maxSpeed + (newSpeed - maxSpeed) * excessDrag;
      player.vx *= target / newSpeed; player.vy *= target / newSpeed;
    }

    if (surface?.type === 'boost' && player.padCooldown <= 0 && player.z < 20) {
      player.vx += surface.pad.dirX * 240; player.vy += surface.pad.dirY * 240;
      player.padCooldown = .65; sound.boost();
      spawnParticles(player.x, player.y, '#ffd85a', 15, 130);
    }

    player.x += player.vx * dt; player.y += player.vy * dt;
    if (surfaceAt(player.x, player.y) && player.z <= 4) {
      player.lastGroundX = player.x; player.lastGroundY = player.y;
    } else if (!surfaceAt(player.x, player.y) && player.z <= 0) {
      downPlayer(player, '경계 이탈');
      return;
    }

    for (const pillar of pillars) collideCircle(player, pillar, 12, 170);
    for (const mover of movers) resolveCircleRect(player, mover, 27, 280);
    for (const gate of gates) if (!gate.open) resolveCircleRect(player, gate, 22, 250);
    for (const rotor of rotors) collideRotor(player, rotor);
    for (const shot of projectiles) collideCircle(player, shot, 32, 260);
    for (const enemy of enemies) collideCircle(player, enemy, 24, 290);

    if (player.downed) return;
    for (const target of players) {
      if (!target.downed) continue;
      const rescueRadius = selectedMode === 'extreme' ? 34 : 41;
      if (dist(player.x, player.y, target.coreX, target.coreY) < player.r + rescueRadius) revivePlayer(target, player);
    }

    for (let i = 1; i < checkpoints.length; i++) {
      if (dist(player.x, player.y, checkpoints[i].x, checkpoints[i].y) < 155) setCheckpoint(i);
    }

    player.zone = getZone(player.x);
    const inExit = dist(player.x, player.y, exit.x, exit.y) < exit.r - 12;
    if (inExit && !exitActive) {
      exitActive = true; exitTimer = 15;
      sound.checkpoint();
      showCenter('EXIT OPEN', '15초 안에 장치로 집결하세요', 1.4, '#a6ff68');
    }
    if (inExit && exitActive) {
      player.exitHold += dt;
      if (player.exitHold >= 1.05) escapePlayer(player);
    } else player.exitHold = 0;

    player.trail.push({ x: player.x, y: player.y, life: 1, z: player.z });
    if (player.trail.length > 24) player.trail.shift();
  }

  function escapePlayer(player) {
    if (player.escaped) return;
    player.escaped = true; player.vx = player.vy = 0;
    spawnParticles(exit.x, exit.y, player.color, 45, 260);
    sound.rescue();
    showToast(`P${player.id + 1} 탈출 완료`);
    const unresolved = players.filter(p => !p.escaped);
    if (!unresolved.length) finishRun(true);
    else if (!unresolved.some(p => !p.downed)) finishRun(true);
  }

  function getZone(x) {
    if (x < 2450) return 0;
    if (x < 4200) return 1;
    if (x < 5750) return 2;
    if (x < 7270) return 3;
    return 4;
  }

  function updateObstacles(dt) {
    for (const mover of movers) {
      const offset = Math.sin(worldTime * mover.speed + mover.phase) * mover.amp;
      mover.x = mover.baseX + (mover.axis === 'x' ? offset : 0);
      mover.y = mover.baseY + (mover.axis === 'y' ? offset : 0);
    }
    for (const gate of gates) {
      const cycle = (worldTime + gate.phase) % gate.period;
      gate.open = cycle < gate.openFor;
      gate.warning = !gate.open && cycle > gate.period - .55;
    }
    for (const launcher of launchers) {
      const speedScale = selectedMode === 'extreme' ? 1.22 : 1;
      if (worldTime - launcher.last >= launcher.period / speedScale) {
        launcher.last = worldTime;
        const speed = 300 * speedScale;
        projectiles.push({ x: launcher.x, y: launcher.y, vx: launcher.dirX * speed, vy: launcher.dirY * speed, r: 14, life: 5 });
        sound.tone(95, .08, 'square', .012, 70);
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const shot = projectiles[i];
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.life <= 0 || !surfaceAt(shot.x, shot.y)) projectiles.splice(i, 1);
    }
    for (const enemy of enemies) {
      let target = null, best = 520;
      for (const player of players) {
        if (player.downed || player.escaped) continue;
        const d = dist(enemy.x, enemy.y, player.x, player.y);
        if (d < best) { best = d; target = player; }
      }
      const goalX = target ? target.x : enemy.homeX;
      const goalY = target ? target.y : enemy.homeY;
      const dir = normalize(goalX - enemy.x, goalY - enemy.y);
      enemy.vx += dir.x * 260 * dt; enemy.vy += dir.y * 260 * dt;
      const max = target ? 235 : 115;
      const speed = Math.hypot(enemy.vx, enemy.vy);
      if (speed > max) { enemy.vx *= max / speed; enemy.vy *= max / speed; }
      enemy.vx *= Math.exp(-1.4 * dt); enemy.vy *= Math.exp(-1.4 * dt);
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      if (!surfaceAt(enemy.x, enemy.y)) { enemy.x = enemy.homeX; enemy.y = enemy.homeY; enemy.vx = enemy.vy = 0; }
    }
    for (const tile of collapseTiles) {
      if (tile.state === 'idle') {
        for (const p of players) if (!p.downed && !p.escaped && p.z < 10 && pointInRect(p.x, p.y, tile)) {
          tile.state = 'warning'; tile.timer = selectedMode === 'extreme' ? .42 : .7; break;
        }
      } else {
        tile.timer -= dt;
        if (tile.state === 'warning' && tile.timer <= 0) { tile.state = 'gone'; tile.timer = 2.4; sound.noise(.22, .025); }
        else if (tile.state === 'gone' && tile.timer <= 0) { tile.state = 'idle'; tile.timer = 0; }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-2.3 * dt); p.vy *= Math.exp(-2.3 * dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (const p of players) for (const t of p.trail) t.life -= dt * 1.65;
  }

  function updateGame(dt) {
    worldTime += dt;
    updateObstacles(dt);
    updateParticles(dt);
    shake *= Math.exp(-7 * dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove('show');
    }
    if (startCountdown > 0) {
      const before = Math.ceil(startCountdown);
      startCountdown -= dt;
      const after = Math.ceil(startCountdown);
      if (after !== before) {
        if (after > 0) { showCenter(String(after), '관성을 느낄 준비를 하세요', .72); sound.tone(320 + after * 50, .08, 'square', .018); }
        else { showCenter('SLIP!', '끝까지 함께 탈출하세요', .9, '#54f5ff'); sound.tone(650, .2, 'sawtooth', .03, 980); }
      }
      updateCamera(dt);
      return;
    }
    runTime += dt;
    if (wipeTimer > 0) {
      wipeTimer -= dt;
      if (wipeTimer <= 0) restartFromCheckpoint();
      updateCamera(dt); updateHud(dt); return;
    }
    for (const player of players) updatePlayer(player, dt);
    if (exitActive) {
      exitTimer -= dt;
      if (exitTimer <= 0) {
        if (players.some(p => p.escaped)) finishRun(true);
        else {
          exitActive = false; exitTimer = 15;
          showCenter('EXIT FAILED', '최종 안전 구역에서 재정렬', 1.2, '#ff4d78');
          checkpointIndex = Math.max(checkpointIndex, 4);
          players.forEach(p => { if (!p.escaped) { p.downed = true; } });
          wipeTimer = 1.25;
        }
      }
    }
    updateCamera(dt);
    updateHud(dt);
  }

  function updateCamera(dt) {
    const targets = [];
    for (const p of players) {
      if (!p.escaped && !p.downed) targets.push({ x: p.x, y: p.y });
      else if (p.downed) targets.push({ x: p.coreX, y: p.coreY });
    }
    if (!targets.length) targets.push({ x: exit.x, y: exit.y });
    const avgX = targets.reduce((s, p) => s + p.x, 0) / targets.length;
    const avgY = targets.reduce((s, p) => s + p.y, 0) / targets.length;
    const maxX = Math.max(...targets.map(p => Math.abs(p.x - avgX)), 0);
    const maxY = Math.max(...targets.map(p => Math.abs(p.y - avgY)), 0);
    const desiredZoom = clamp(Math.min(cssWidth / (maxX * 2 + 760), cssHeight / (maxY * 2 + 570)), .58, 1.06);
    const follow = 1 - Math.exp(-3.4 * dt);
    camera.x = lerp(camera.x, avgX + 100, follow);
    camera.y = lerp(camera.y, avgY, follow);
    camera.zoom = lerp(camera.zoom, desiredZoom, 1 - Math.exp(-2.2 * dt));
    const halfW = cssWidth / camera.zoom / 2, halfH = cssHeight / camera.zoom / 2;
    camera.x = clamp(camera.x, halfW - 70, WORLD.width - halfW + 70);
    camera.y = clamp(camera.y, halfH - 80, WORLD.height - halfH + 80);
  }

  function updateHud(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = .08;
    const leader = players.filter(p => !p.downed && !p.escaped).reduce((best, p) => !best || p.x > best.x ? p : best, null);
    const zone = leader ? getZone(leader.x) : 4;
    ui.zone.textContent = `${String(zone + 1).padStart(2, '0')} / 05`;
    ui.time.textContent = formatTime(runTime);
    ui.mode.textContent = selectedMode === 'extreme' ? 'EXTREME ×1.87' : 'NORMAL';
    const objectiveText = exitActive ? `탈출 장치 폐쇄까지 ${Math.max(0, exitTimer).toFixed(1)}초` : ZONE_OBJECTIVES[zone];
    ui.objective.querySelector('b').textContent = objectiveText;
    players.forEach(p => {
      const chip = $(`playerChip${p.id}`);
      if (!chip) return;
      chip.style.setProperty('--hp', `${clamp(p.hp, 0, 100)}%`);
      const stateLabel = p.escaped ? 'ESCAPED' : p.downed ? 'SIGNAL LOST' : p.invulnerable > 0 ? 'SYNCING' : 'ACTIVE';
      chip.querySelector('.chip-state').textContent = stateLabel;
      const chargeEls = chip.querySelectorAll('.charges i');
      chargeEls.forEach((el, i) => el.classList.toggle('on', i < p.brakeCharges));
      chip.style.opacity = p.escaped ? '.45' : '1';
    });
  }

  function formatTime(value) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    const hundredths = Math.floor((value % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  function finishRun(success) {
    if (state !== 'playing') return;
    state = 'results';
    const escaped = players.filter(p => p.escaped).length;
    const full = escaped === players.length;
    const multiplier = selectedMode === 'extreme' ? 1.87 : 1;
    const base = Math.max(1000, 100000 - Math.floor(runTime * 85) - deaths * 1200 + rescues * 1800 + (full ? 15000 : 0));
    const score = Math.round(base * multiplier);
    const key = `slip-out-best-${selectedMode}-${selectedPlayers}`;
    const oldBest = Number(localStorage.getItem(key)) || 0;
    const isRecord = score > oldBest;
    if (isRecord) localStorage.setItem(key, String(score));
    resultData = { success, escaped, full, multiplier, score };
    ui.resultEyebrow.textContent = full ? 'PERFECT EXTRACTION' : 'RUN COMPLETE';
    ui.resultTitle.textContent = full ? '전원 탈출' : '탈출 성공';
    ui.resultSummary.textContent = full ? '누구도 버리지 않았습니다. 완벽한 팀 런입니다.' : `${players.length}명 중 ${escaped}명이 탈출했습니다. 다음에는 모두 함께 나가세요.`;
    ui.score.textContent = score.toLocaleString('ko-KR');
    ui.resultTime.textContent = formatTime(runTime);
    ui.resultDeaths.textContent = String(deaths);
    ui.resultRescues.textContent = String(rescues);
    ui.resultMultiplier.textContent = `×${multiplier.toFixed(2)}`;
    ui.record.textContent = isRecord ? 'NEW TEAM RECORD' : `BEST ${oldBest.toLocaleString('ko-KR')}`;
    ui.hud.classList.remove('is-visible');
    ui.results.classList.add('is-visible');
    sound.win();
  }

  function drawBackground() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gradient = ctx.createRadialGradient(cssWidth * .55, cssHeight * .45, 0, cssWidth * .5, cssHeight * .5, Math.max(cssWidth, cssHeight));
    gradient.addColorStop(0, '#0d1d2c'); gradient.addColorStop(.5, '#070d18'); gradient.addColorStop(1, '#03060c');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.globalAlpha = .22;
    ctx.strokeStyle = '#23425a'; ctx.lineWidth = 1;
    const grid = 54;
    const ox = (-camera.x * .08) % grid, oy = (-camera.y * .08) % grid;
    ctx.beginPath();
    for (let x = ox; x < cssWidth; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, cssHeight); }
    for (let y = oy; y < cssHeight; y += grid) { ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function beginWorldTransform() {
    const sx = (Math.random() - .5) * shake;
    const sy = (Math.random() - .5) * shake;
    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom,
      dpr * (cssWidth / 2 - camera.x * camera.zoom + sx),
      dpr * (cssHeight / 2 - camera.y * camera.zoom + sy));
  }

  function drawFloor(floor) {
    const colors = {
      safe: ['#16303a', '#204b52', '#56f4ff'],
      ice: ['#102a3b', '#17425a', '#52bde2'],
      black: ['#15182d', '#24234a', '#805cff']
    }[floor.type];
    const g = ctx.createLinearGradient(floor.x, floor.y, floor.x, floor.y + floor.h);
    g.addColorStop(0, colors[1]); g.addColorStop(1, colors[0]);
    roundedRect(floor.x, floor.y, floor.w, floor.h, 22);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba(colors[2], floor.type === 'safe' ? .55 : .28); ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); roundedRect(floor.x + 4, floor.y + 4, floor.w - 8, floor.h - 8, 19); ctx.clip();
    ctx.globalAlpha = floor.type === 'black' ? .2 : .13;
    ctx.strokeStyle = colors[2]; ctx.lineWidth = 1;
    const spacing = floor.type === 'safe' ? 70 : 105;
    ctx.beginPath();
    for (let x = floor.x - floor.h; x < floor.x + floor.w; x += spacing) {
      ctx.moveTo(x, floor.y); ctx.lineTo(x + floor.h, floor.y + floor.h);
    }
    ctx.stroke();
    if (floor.type === 'safe') {
      ctx.globalAlpha = .22; ctx.beginPath();
      for (let y = floor.y + 55; y < floor.y + floor.h; y += 100) { ctx.moveTo(floor.x, y); ctx.lineTo(floor.x + floor.w, y); }
      ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawHole(hole) {
    ctx.save();
    ctx.shadowColor = '#000'; ctx.shadowBlur = 30;
    const g = ctx.createRadialGradient(hole.x || hole.x + hole.w / 2, hole.y || hole.y + hole.h / 2, 0, hole.x || 0, hole.y || 0, hole.r || Math.max(hole.w, hole.h));
    g.addColorStop(0, '#00020a'); g.addColorStop(1, '#060914');
    ctx.fillStyle = g;
    if (hole.kind === 'circle') { ctx.beginPath(); ctx.arc(hole.x, hole.y, hole.r, 0, TAU); }
    else roundedRect(hole.x, hole.y, hole.w, hole.h, 10);
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,77,120,.28)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
  }

  function drawPads() {
    for (const pad of boostPads) {
      roundedRect(pad.x, pad.y, pad.w, pad.h, 12);
      ctx.fillStyle = 'rgba(255,208,72,.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,221,92,.65)'; ctx.lineWidth = 3; ctx.stroke();
      const angle = Math.atan2(pad.dirY, pad.dirX);
      ctx.save(); ctx.translate(pad.x + pad.w / 2, pad.y + pad.h / 2); ctx.rotate(angle);
      ctx.strokeStyle = '#ffdf66'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(-35 + i * 32, -28); ctx.lineTo(-5 + i * 32, 0); ctx.lineTo(-35 + i * 32, 28); ctx.stroke();
      }
      ctx.restore();
    }
    for (const pad of slowPads) {
      roundedRect(pad.x, pad.y, pad.w, pad.h, 12);
      ctx.fillStyle = 'rgba(166,255,104,.13)'; ctx.fill();
      ctx.strokeStyle = 'rgba(166,255,104,.5)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(166,255,104,.35)';
      for (let y = pad.y + 26; y < pad.y + pad.h; y += 36) ctx.fillRect(pad.x + 14, y, pad.w - 28, 5);
    }
  }

  function drawCheckpoints() {
    checkpoints.forEach((cp, i) => {
      const active = i <= checkpointIndex;
      const pulse = .5 + Math.sin(worldTime * 3 + i) * .2;
      ctx.save(); ctx.translate(cp.x, cp.y);
      ctx.strokeStyle = active ? rgba('#54f5ff', .5 + pulse * .3) : 'rgba(100,130,150,.18)';
      ctx.lineWidth = active ? 5 : 3;
      ctx.beginPath(); ctx.arc(0, 0, 105 + pulse * 8, 0, TAU); ctx.stroke();
      ctx.setLineDash([13, 12]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 78, -worldTime, TAU - worldTime); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = active ? '#bdfbff' : '#6b8190';
      ctx.font = '600 17px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i === 0 ? 'START' : `CP-${i}`, 0, 0);
      ctx.restore();
    });
  }

  function drawPillar(pillar) {
    ctx.save(); ctx.translate(pillar.x, pillar.y);
    ctx.fillStyle = '#0a1522'; ctx.strokeStyle = '#54748a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, pillar.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, pillar.r - 11, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffcb57';
    for (let a = 0; a < TAU; a += Math.PI / 3) { ctx.save(); ctx.rotate(a); ctx.fillRect(pillar.r - 10, -5, 10, 10); ctx.restore(); }
    ctx.restore();
  }

  function drawRotor(rotor) {
    const angle = rotor.angle + worldTime * rotor.speed;
    ctx.save(); ctx.translate(rotor.x, rotor.y); ctx.rotate(angle);
    ctx.shadowColor = '#ff4d78'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff416d'; roundedRect(-rotor.length / 2, -rotor.width / 2, rotor.length, rotor.width, rotor.width / 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.65)';
    for (let x = -rotor.length / 2 + 26; x < rotor.length / 2; x += 55) ctx.fillRect(x, -3, 22, 6);
    ctx.restore();
    ctx.fillStyle = '#111a26'; ctx.strokeStyle = '#ff6b8d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(rotor.x, rotor.y, 28, 0, TAU); ctx.fill(); ctx.stroke();
  }

  function drawMover(mover) {
    ctx.save();
    ctx.shadowColor = '#ff7048'; ctx.shadowBlur = 12;
    roundedRect(mover.x, mover.y, mover.w, mover.h, 8);
    ctx.fillStyle = '#40251e'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff7a4c'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,184,115,.35)'; ctx.lineWidth = 7;
    for (let y = mover.y + 24; y < mover.y + mover.h - 10; y += 38) { ctx.beginPath(); ctx.moveTo(mover.x + 10, y); ctx.lineTo(mover.x + mover.w - 10, y - 18); ctx.stroke(); }
    ctx.restore();
  }

  function drawGate(gate) {
    if (gate.open) {
      ctx.fillStyle = 'rgba(84,245,255,.17)';
      ctx.fillRect(gate.x - 5, gate.y, 8, gate.h); ctx.fillRect(gate.x + gate.w - 3, gate.y, 8, gate.h);
      return;
    }
    ctx.save();
    ctx.fillStyle = gate.warning && Math.floor(worldTime * 10) % 2 ? '#ffbf55' : '#ff4d78';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 15;
    ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(3,8,16,.65)';
    for (let y = gate.y + 15; y < gate.y + gate.h; y += 48) ctx.fillRect(gate.x, y, gate.w, 19);
    ctx.restore();
  }

  function drawLauncher(l) {
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(Math.atan2(l.dirY, l.dirX));
    ctx.fillStyle = '#151c2c'; ctx.strokeStyle = '#ff9d54'; ctx.lineWidth = 4;
    roundedRect(-26, -25, 52, 50, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff754f'; ctx.fillRect(12, -10, 32, 20);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const pulse = Math.sin(worldTime * 5 + enemy.x) * 3;
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = '#ff4d78'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#23101d'; ctx.strokeStyle = '#ff4d78'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, enemy.r + pulse, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
    ctx.fillStyle = '#ff9bb3'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCollapseTiles() {
    for (const tile of collapseTiles) {
      if (tile.state === 'gone') {
        ctx.fillStyle = '#01030a'; roundedRect(tile.x, tile.y, tile.w, tile.h, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,77,120,.32)'; ctx.lineWidth = 4; ctx.stroke();
        continue;
      }
      const warning = tile.state === 'warning';
      roundedRect(tile.x, tile.y, tile.w, tile.h, 10);
      ctx.fillStyle = warning && Math.floor(worldTime * 12) % 2 ? 'rgba(255,77,120,.35)' : 'rgba(56,113,135,.28)'; ctx.fill();
      ctx.strokeStyle = warning ? '#ff4d78' : 'rgba(104,208,235,.35)'; ctx.lineWidth = warning ? 5 : 2; ctx.stroke();
      if (warning) {
        ctx.strokeStyle = 'rgba(255,185,198,.55)'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(tile.x + 25, tile.y + 25); ctx.lineTo(tile.x + tile.w * .52, tile.y + tile.h * .48); ctx.lineTo(tile.x + tile.w - 28, tile.y + 40);
        ctx.moveTo(tile.x + tile.w * .52, tile.y + tile.h * .48); ctx.lineTo(tile.x + tile.w * .38, tile.y + tile.h - 22); ctx.stroke();
      }
    }
  }

  function drawExit() {
    const active = exitActive;
    const pulse = Math.sin(worldTime * 4) * 8;
    ctx.save(); ctx.translate(exit.x, exit.y);
    ctx.fillStyle = active ? 'rgba(166,255,104,.16)' : 'rgba(84,245,255,.1)';
    ctx.strokeStyle = active ? '#a6ff68' : '#54f5ff';
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = active ? 30 : 14;
    ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, exit.r + pulse, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.setLineDash([20, 14]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, exit.r - 25, worldTime, worldTime + TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = active ? '#dfffca' : '#d8fbff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 19px "IBM Plex Mono", monospace'; ctx.fillText(active ? `${Math.max(0, exitTimer).toFixed(1)}s` : 'ACTIVATE', 0, 0);
    ctx.restore();
  }

  function drawTrajectory(player) {
    const surface = surfaceAt(player.x, player.y);
    if (selectedMode === 'extreme' || surface?.type === 'black' || player.downed || player.escaped) return;
    let x = player.x, y = player.y, vx = player.vx, vy = player.vy;
    ctx.save(); ctx.fillStyle = rgba(player.color, .28);
    for (let i = 0; i < 9; i++) {
      x += vx * .11; y += vy * .11; vx *= .985; vy *= .985;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, 5 - i * .35), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(player) {
    if (player.downed || player.escaped) return;
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i]; if (t.life <= 0) continue;
      ctx.globalAlpha = t.life * .22;
      ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(t.x, t.y, player.r * (.35 + t.life * .4), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const renderY = player.y - player.z * .42;
    ctx.fillStyle = `rgba(0,0,0,${.28 - Math.min(.18, player.z / 700)})`;
    ctx.beginPath(); ctx.ellipse(player.x, player.y + 9, player.r * 1.15, player.r * .62, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(player.x, renderY);
    if (player.invulnerable > 0 && Math.floor(worldTime * 18) % 2) ctx.globalAlpha = .45;
    ctx.shadowColor = player.color; ctx.shadowBlur = 20;
    const body = ctx.createRadialGradient(-7, -9, 2, 0, 0, player.r * 1.3);
    body.addColorStop(0, '#f8feff'); body.addColorStop(.28, player.color); body.addColorStop(1, '#0a1d27');
    ctx.fillStyle = body; ctx.strokeStyle = player.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, player.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    const direction = normalize(player.vx, player.vy);
    ctx.rotate(Math.atan2(direction.y, direction.x));
    ctx.fillStyle = '#031118'; roundedRect(1, -7, 15, 14, 5); ctx.fill();
    ctx.fillStyle = '#efffff'; ctx.fillRect(8, -4, 5, 3); ctx.fillRect(8, 2, 5, 3);
    if (player.boostCooldown > 1.45) {
      ctx.fillStyle = '#fff36f'; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-42 - Math.random() * 15, 0); ctx.lineTo(-18, 8); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = player.color; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`P${player.id + 1}`, player.x, renderY - 31);
  }

  function drawCore(player) {
    if (!player.downed) return;
    const pulse = Math.sin(worldTime * 5 + player.id) * 7;
    ctx.save(); ctx.translate(player.coreX, player.coreY);
    ctx.strokeStyle = player.color; ctx.shadowColor = player.color; ctx.shadowBlur = 25;
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 31 + pulse, 0, TAU); ctx.stroke();
    ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 48 + pulse * .3, -worldTime * 2, TAU - worldTime * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(player.color, .72); ctx.rotate(worldTime * 1.8); ctx.fillRect(-12, -12, 24, 24);
    ctx.shadowBlur = 0; ctx.rotate(-worldTime * 1.8);
    const beam = ctx.createLinearGradient(0, -40, 0, -180); beam.addColorStop(0, rgba(player.color, .32)); beam.addColorStop(1, rgba(player.color, 0));
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-9, -25); ctx.lineTo(-3, -180); ctx.lineTo(3, -180); ctx.lineTo(9, -25); ctx.fill();
    ctx.fillStyle = player.color; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(`RESCUE P${player.id + 1}`, 0, -62);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawWorldLabels() {
    const positions = [600, 3150, 4800, 6400, 7750];
    ctx.save(); ctx.textAlign = 'center';
    positions.forEach((x, i) => {
      ctx.fillStyle = 'rgba(166,224,241,.1)'; ctx.font = '600 72px "IBM Plex Mono", monospace';
      ctx.fillText(String(i + 1).padStart(2, '0'), x, 90);
      ctx.fillStyle = 'rgba(166,224,241,.22)'; ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.fillText(ZONE_NAMES[i].toUpperCase(), x, 115);
    });
    ctx.restore();
  }

  function render() {
    drawBackground();
    if (state === 'menu') {
      camera.x = 950 + Math.sin(performance.now() * .00012) * 220;
      camera.y = 800 + Math.sin(performance.now() * .00018) * 80;
      camera.zoom = .82;
    }
    beginWorldTransform();
    drawWorldLabels();
    for (const floor of floors) drawFloor(floor);
    for (const hole of holes) drawHole(hole);
    drawCollapseTiles();
    drawPads(); drawCheckpoints(); drawExit();
    for (const launcher of launchers) drawLauncher(launcher);
    for (const pillar of pillars) drawPillar(pillar);
    for (const mover of movers) drawMover(mover);
    for (const gate of gates) drawGate(gate);
    for (const rotor of rotors) drawRotor(rotor);
    for (const shot of projectiles) {
      ctx.save(); ctx.shadowColor = '#ff8c57'; ctx.shadowBlur = 18; ctx.fillStyle = '#ffd176';
      ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.r, 0, TAU); ctx.fill(); ctx.restore();
    }
    for (const enemy of enemies) drawEnemy(enemy);
    for (const player of players) drawTrajectory(player);
    for (const player of players) drawCore(player);
    for (const player of players) drawPlayer(player);
    drawParticles();
  }

  function loop(timestamp) {
    const dt = Math.min(.033, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    if (state === 'playing') updateGame(dt);
    else if (state === 'menu') {
      worldTime += dt * .28;
      updateObstacles(dt * .28);
      updateParticles(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  document.querySelectorAll('[data-players]').forEach(button => button.addEventListener('click', () => {
    selectedPlayers = Number(button.dataset.players);
    document.querySelectorAll('[data-players]').forEach(b => b.classList.toggle('selected', b === button));
    sound.tone(440 + selectedPlayers * 40, .06, 'sine', .014);
  }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    selectedMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('selected', b === button));
    sound.tone(selectedMode === 'extreme' ? 140 : 520, .12, 'triangle', .018, selectedMode === 'extreme' ? 75 : 680);
  }));
  $('startButton').addEventListener('click', startGame);
  $('resumeButton').addEventListener('click', togglePause);
  $('restartButton').addEventListener('click', startGame);
  $('menuButton').addEventListener('click', returnToMenu);
  $('againButton').addEventListener('click', startGame);
  $('resultMenuButton').addEventListener('click', returnToMenu);
  ui.sound.addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    ui.sound.textContent = sound.enabled ? 'SOUND ON' : 'SOUND OFF';
    if (sound.enabled) sound.tone(600, .08, 'sine', .02, 800);
  });

  // Read-only diagnostics used by the included browser smoke test.
  Object.defineProperty(window, '__SLIP_OUT_DEBUG__', {
    value: {
      snapshot: () => ({
        state, selectedPlayers, selectedMode, runTime, checkpointIndex, exitActive,
        players: players.map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, hp: p.hp, downed: p.downed, escaped: p.escaped }))
      })
    },
    enumerable: false
  });

  resetDynamics();
  requestAnimationFrame(loop);
})();

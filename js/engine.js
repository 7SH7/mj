'use strict';

// SLIP OUT: engine layer
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
  let selectedMap = 0;
  let players = [];
  let particles = [];
  let projectiles = [];
  let enemies = [];
  let worldTime = 0;
  let runTime = 0;
  let deaths = 0;
  let rescues = 0;
  let reviveChoiceSequence = 0;
  let checkpointIndex = 0;
  let startCountdown = 0;
  let wipeTimer = 0;
  let exitActive = false;
  let exitTimer = 2;
  let escapeOrder = [];
  let toastTimer = 0;
  let hudTimer = 0;
  let shake = 0;
  let lastTimestamp = performance.now();
  let resultData = null;
  let activeRunId = '';
  const camera = { x: 620, y: 800, zoom: 1 };

  function createPlayer(id, spawn) {
    return {
      id, color: PLAYER_COLORS[id], x: spawn.x, y: spawn.y + (id - (selectedPlayers - 1) / 2) * 52,
      vx: 0, vy: 0, r: 19, z: 0, vz: 0, hp: 100, invulnerable: .8,
      brakeCharges: selectedMode === 'extreme' ? 0 : 2, brakeRegen: 0, brakeTimer: 0,
      jumpCooldown: 0, jumpCooldownMax: 2, boostCooldown: 0, boostCooldownMax: 5,
      padCooldown: 0, downed: false, escaped: false, finishPlace: null, finishTime: null,
      deathCount: 0,
      awaitingReviveChoice: false, reviveRescuerId: null, reviveQueuedAt: null, reviveChoice: null,
      coreX: 0, coreY: 0, lastGroundX: spawn.x, lastGroundY: spawn.y,
      trail: [], previousInput: {}, exitHold: 0, zone: 0
    };
  }

  function resetDynamics() {
    projectiles = [];
    enemies = currentCourse.enemies.filter(enemy => !isCheckpointSafe(enemy.x, enemy.y)).map((enemy, index) => ({
      ...enemy, homeX: enemy.x, homeY: enemy.y, vx: 0, vy: 0,
      r: 30 + Math.min(6, Math.floor(selectedMap / 2) + (index % 2)), zone: getZone(enemy.x)
    }));
    launchers.forEach(l => l.last = worldTime + Math.random());
    collapseTiles.forEach(t => { t.state = 'idle'; t.timer = 0; });
  }

  function startGame() {
    sound.init();
    configureSelectedCourse();
    state = 'playing';
    activeRunId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    worldTime = 0; runTime = 0; deaths = 0; rescues = 0; reviveChoiceSequence = 0; checkpointIndex = 0;
    wipeTimer = 0; exitActive = false; exitTimer = exitDuration(); escapeOrder = []; particles = []; resultData = null;
    players = Array.from({ length: selectedPlayers }, (_, i) => createPlayer(i, checkpoints[0]));
    resetDynamics();
    camera.x = 560; camera.y = 800; camera.zoom = 1;
    startCountdown = 3.25;
    ui.menu.classList.remove('is-visible');
    ui.results.classList.remove('is-visible');
    ui.pause.classList.remove('is-visible');
    ui.settings.classList.remove('is-visible');
    ui.hud.classList.add('is-visible');
    buildPlayerHud();
    updateMobileVisibility();
    showCenter('3', `${currentCourse.name} · 관성을 느낄 준비를 하세요`, .8);
  }

  function returnToMenu() {
    state = 'menu';
    ui.menu.classList.add('is-visible');
    ui.hud.classList.remove('is-visible');
    ui.pause.classList.remove('is-visible');
    ui.results.classList.remove('is-visible');
    ui.settings.classList.remove('is-visible');
    updateMobileVisibility();
    camera.x = 800; camera.y = 800; camera.zoom = .9;
  }

  function togglePause() {
    if (window.OnlineSession?.isOnlineRun()) {
      showToast('온라인 런에서는 일시정지를 사용할 수 없습니다.');
      return;
    }
    if (state === 'playing') { state = 'paused'; ui.pause.classList.add('is-visible'); }
    else if (state === 'paused') { state = 'playing'; ui.pause.classList.remove('is-visible'); lastTimestamp = performance.now(); }
    updateMobileVisibility();
  }

  function buildPlayerHud() {
    ui.playerHud.innerHTML = players.map(p => `
      <div class="player-chip" id="playerChip${p.id}" style="--player:${p.color}">
        <div class="chip-top"><span>P${p.id + 1}</span><span class="chip-state">ACTIVE</span></div>
        <div class="hp">${'<i class="on"></i>'.repeat(5)}</div>
        <div class="chip-bottom">
          <div class="charges"><i class="on"></i><i class="on"></i></div>
          <div class="ability-cooldowns">
            <div class="ability jump-cd" style="--ready:100%"><span><b>JUMP</b><em>READY</em></span></div>
            <div class="ability boost-cd" style="--ready:100%"><span><b>BOOST</b><em>READY</em></span></div>
          </div>
        </div>
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
    player.awaitingReviveChoice = false;
    player.reviveRescuerId = null;
    player.reviveQueuedAt = null;
    player.reviveChoice = null;
    player.coreX = player.lastGroundX;
    player.coreY = player.lastGroundY;
    player.vx = player.vy = 0;
    deaths++;
    player.deathCount++;
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

  function pendingRevivePlayers() {
    return players
      .filter(player => player.downed && player.awaitingReviveChoice)
      .sort((a, b) => a.reviveQueuedAt - b.reviveQueuedAt || a.id - b.id);
  }

  function promptReviveChoice(player) {
    showCenter('REVIVE CHOICE', `P${player.id + 1} · I 체크포인트 / O 쓰러진 위치`, 4.5, player.color);
    showToast(`P${player.id + 1} 부활 위치 선택: I = 최신 체크포인트 · O = 쓰러진 위치`, 4.5);
  }

  function beginReviveChoice(player, rescuer) {
    if (!player.downed || player.escaped || player.awaitingReviveChoice) return;
    if (selectedMode === 'extreme') {
      revivePlayer(player, rescuer, 'start');
      return;
    }
    const hadPendingChoice = pendingRevivePlayers().length > 0;
    player.awaitingReviveChoice = true;
    player.reviveRescuerId = rescuer.id;
    player.reviveQueuedAt = ++reviveChoiceSequence;
    player.reviveChoice = null;
    prepareReviveChoiceInput();
    sound.tone(440, .08, 'sine', .018, 660);
    if (!hadPendingChoice) promptReviveChoice(player);
  }

  function consumeReviveChoiceKey(code) {
    if (state !== 'playing' || selectedMode === 'extreme' || (code !== 'KeyI' && code !== 'KeyO')) return false;
    if (window.OnlineSession?.isGuestPlaying()) return window.OnlineSession.sendReviveChoice(code);
    const player = window.OnlineSession?.isHostPlaying() ? players[0]?.awaitingReviveChoice && players[0] : pendingRevivePlayers()[0];
    if (!player) return false;
    const rescuer = players.find(candidate => candidate.id === player.reviveRescuerId);
    revivePlayer(player, rescuer, code === 'KeyI' ? 'checkpoint' : 'core');
    return true;
  }

  function revivePlayer(player, rescuer, choice = 'core') {
    const resolvedChoice = selectedMode === 'extreme' ? 'start' : choice;
    const spawn = resolvedChoice === 'start'
      ? checkpoints[0]
      : resolvedChoice === 'checkpoint'
        ? checkpoints[checkpointIndex]
        : { x: player.coreX, y: player.coreY };
    player.downed = false;
    player.awaitingReviveChoice = false;
    player.reviveChoice = resolvedChoice;
    player.x = spawn.x;
    player.y = spawn.y + (resolvedChoice === 'core' ? 0 : (player.id - (players.length - 1) / 2) * 34);
    player.lastGroundX = player.x; player.lastGroundY = player.y;
    player.vx = resolvedChoice === 'core' ? (rescuer?.vx || 0) * .12 : 0;
    player.vy = resolvedChoice === 'core' ? (rescuer?.vy || 0) * .12 : 0;
    player.hp = 100; player.z = 0; player.vz = 0;
    player.invulnerable = selectedMode === 'extreme' ? 0 : .18;
    player.reviveRescuerId = null;
    player.reviveQueuedAt = null;
    player.previousInput = {};
    wipeTimer = 0;
    rescues++;
    spawnParticles(player.x, player.y, player.color, 30, 200);
    sound.rescue();
    const locationLabel = resolvedChoice === 'start' ? '출발 지점' : resolvedChoice === 'checkpoint' ? '최신 체크포인트' : '쓰러진 위치';
    showCenter(selectedMode === 'extreme' ? 'HARD REVIVE' : 'RESCUE!', `P${player.id + 1} · ${locationLabel}`, 1.1, player.color);
    showToast(`P${player.id + 1} ${locationLabel}에서 부활`, 1.3);
    const next = pendingRevivePlayers()[0];
    if (next) setTimeout(() => {
      if (state === 'playing' && next.downed && next.awaitingReviveChoice) promptReviveChoice(next);
    }, 1150);
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
      p.jumpCooldown = p.boostCooldown = 0; p.finishPlace = p.finishTime = null; p.previousInput = {};
      p.awaitingReviveChoice = false; p.reviveRescuerId = null; p.reviveQueuedAt = null; p.reviveChoice = null;
    });
    escapeOrder = [];
    wipeTimer = 0; exitActive = false; exitTimer = exitDuration();
    resetDynamics();
    camera.x = spawn.x; camera.y = spawn.y;
    showCenter(selectedMode === 'extreme' ? 'HARD RESET' : 'CHECKPOINT', selectedMode === 'extreme' ? '출발 지점으로 복귀' : '팀 재정렬 완료', 1.1, '#54f5ff');
  }

  function setCheckpoint(index) {
    if (index <= checkpointIndex) return;
    checkpointIndex = index;
    sound.checkpoint();
    spawnParticles(checkpoints[index].x, checkpoints[index].y, '#54f5ff', 38, 170);
    showCenter(`SECTOR ${String(index + 1).padStart(2, '0')}`, currentCourse.zoneNames[index], 1.35, currentCourse.accent);
  }

  function isCheckpointSafe(x, y) {
    return checkpoints.some(point => dist(x, y, point.x, point.y) <= 170);
  }

  function damagePlayer(player, amount, nx, ny, force = 210) {
    if (player.invulnerable > 0 || player.downed || player.escaped || player.z > 30 || isCheckpointSafe(player.x, player.y)) return;
    player.hp = Math.max(0, player.hp - 20);
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

  function collideLaser(player, laser) {
    if (!laser.active || player.z > 42) return;
    const abx = laser.x2 - laser.x1, aby = laser.y2 - laser.y1;
    const lengthSquared = abx * abx + aby * aby;
    const t = clamp(((player.x - laser.x1) * abx + (player.y - laser.y1) * aby) / lengthSquared, 0, 1);
    const cx = laser.x1 + abx * t, cy = laser.y1 + aby * t;
    const dx = player.x - cx, dy = player.y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > player.r + 8) return;
    const normal = distance > .001 ? { x: dx / distance, y: dy / distance } : normalize(-aby, abx);
    damagePlayer(player, 38 + selectedMap * 2, normal.x, normal.y, 330 + selectedMap * 20);
  }

  function collideShockwave(player, emitter) {
    if (player.z > 34) return;
    const progress = ((worldTime + emitter.phase) % emitter.period) / emitter.period;
    const radius = progress * emitter.maxRadius;
    const dx = player.x - emitter.x, dy = player.y - emitter.y;
    const distance = Math.hypot(dx, dy);
    if (Math.abs(distance - radius) > player.r + emitter.width) return;
    const normal = distance > .001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
    damagePlayer(player, 22 + selectedMap * 2, normal.x, normal.y, 290 + selectedMap * 24);
  }

  function updatePlayer(player, dt) {
    if (player.downed || player.escaped) return;
    const input = readInput(player);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.jumpCooldown = Math.max(0, player.jumpCooldown - dt);
    player.boostCooldown = Math.max(0, player.boostCooldown - dt);
    player.padCooldown = Math.max(0, player.padCooldown - dt);
    const surface = surfaceAt(player.x, player.y);
    const speed = Math.hypot(player.vx, player.vy);

    if (input.jumpPressed && player.z <= .01 && player.jumpCooldown <= 0) {
      player.vz = 285; player.z = .1; sound.jump();
      player.jumpCooldown = player.jumpCooldownMax;
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
      player.boostCooldown = player.boostCooldownMax;
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

    for (const wind of winds) if (player.z < 35 && pointInRect(player.x, player.y, wind)) {
      const pulse = .78 + Math.sin(worldTime * 3.4 + wind.x * .01) * .22;
      player.vx += wind.dirX * wind.strength * pulse * dt;
      player.vy += wind.dirY * wind.strength * pulse * dt;
    }

    let friction = .2;
    if (surface?.type === 'safe') friction = 3.4;
    else if (surface?.type === 'slow') friction = 7.2;
    else if (surface?.type === 'black') friction = .07;
    if (player.brakeTimer > 0) friction = 8.8;
    const drag = Math.exp(-friction * dt);
    player.vx *= drag; player.vy *= drag;

    let maxSpeed = surface?.type === 'safe' ? 390 : 490;
    if (player.boostCooldown > player.boostCooldownMax - .4) maxSpeed = 680;
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
    for (const bumper of bumpers) collideCircle(player, bumper, 10 + selectedMap, 470 + selectedMap * 35);
    for (const mover of movers) resolveCircleRect(player, mover, 27, 280);
    for (const gate of gates) if (!gate.open) resolveCircleRect(player, gate, 22, 250);
    for (const rotor of rotors) collideRotor(player, rotor);
    for (const laser of lasers) collideLaser(player, laser);
    for (const emitter of shockwaves) collideShockwave(player, emitter);
    for (const shot of projectiles) collideCircle(player, shot, 32, 260);
    for (const enemy of enemies) collideCircle(player, enemy, 24, 290);

    if (player.downed) return;
    for (const target of players) {
      if (!target.downed) continue;
      const rescueRadius = selectedMode === 'extreme' ? 34 : 41;
      if (dist(player.x, player.y, target.coreX, target.coreY) < player.r + rescueRadius) beginReviveChoice(target, player);
    }

    for (let i = 1; i < checkpoints.length; i++) {
      if (dist(player.x, player.y, checkpoints[i].x, checkpoints[i].y) < 155) setCheckpoint(i);
    }

    player.zone = getZone(player.x);
    const inExit = dist(player.x, player.y, exit.x, exit.y) < exit.r - 12;
    if (inExit && !exitActive) {
      exitActive = true; exitTimer = exitDuration();
      sound.checkpoint();
      showCenter('EXIT SYNC', `장치 위에서 ${exitDuration()}초 유지하세요`, 1.4, '#a6ff68');
    }
    if (inExit && exitActive) {
      player.exitHold += dt;
      exitTimer = Math.max(0, exitDuration() - player.exitHold);
      if (player.exitHold >= exitDuration()) escapePlayer(player);
    } else player.exitHold = 0;

    player.trail.push({ x: player.x, y: player.y, life: 1, z: player.z });
    if (player.trail.length > 24) player.trail.shift();
  }

  function escapePlayer(player) {
    if (player.escaped) return;
    player.escaped = true; player.vx = player.vy = 0;
    player.finishPlace = escapeOrder.length + 1;
    player.finishTime = runTime;
    escapeOrder.push(player.id);
    spawnParticles(exit.x, exit.y, player.color, 45, 260);
    sound.rescue();
    showToast(`P${player.id + 1} · ${player.finishPlace}위 탈출`);
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
      const adjustedPeriod = gate.period / (1 + selectedMap * .045);
      const cycle = (worldTime + gate.phase) % adjustedPeriod;
      gate.open = cycle < gate.openFor;
      gate.warning = !gate.open && cycle > adjustedPeriod - .55;
    }
    for (const laser of lasers) {
      const cycle = (worldTime + laser.phase) % laser.period;
      laser.active = cycle < laser.onFor;
      laser.warning = !laser.active && cycle > laser.period - .34;
    }
    for (const launcher of launchers) {
      const speedScale = (selectedMode === 'extreme' ? 1.22 : 1) * (1 + selectedMap * .065);
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
        if (player.downed || player.escaped || isCheckpointSafe(player.x, player.y)) continue;
        const d = dist(enemy.x, enemy.y, player.x, player.y);
        if (d < best) { best = d; target = player; }
      }
      const goalX = target ? target.x : enemy.homeX;
      const goalY = target ? target.y : enemy.homeY;
      const dir = normalize(goalX - enemy.x, goalY - enemy.y);
      const aggression = 1 + selectedMap * .08;
      enemy.vx += dir.x * 260 * aggression * dt; enemy.vy += dir.y * 260 * aggression * dt;
      const max = (target ? 235 : 115) * aggression;
      const speed = Math.hypot(enemy.vx, enemy.vy);
      if (speed > max) { enemy.vx *= max / speed; enemy.vy *= max / speed; }
      enemy.vx *= Math.exp(-1.4 * dt); enemy.vy *= Math.exp(-1.4 * dt);
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      if (!surfaceAt(enemy.x, enemy.y) || isCheckpointSafe(enemy.x, enemy.y)) {
        enemy.x = enemy.homeX; enemy.y = enemy.homeY; enemy.vx = enemy.vy = 0;
      }
    }
    for (const tile of collapseTiles) {
      if (tile.state === 'idle') {
        for (const p of players) if (!p.downed && !p.escaped && p.z < 10 && pointInRect(p.x, p.y, tile)) {
          tile.state = 'warning'; tile.timer = (selectedMode === 'extreme' ? .42 : .7) / (1 + selectedMap * .09); break;
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
    ui.mapValue.textContent = selectedCustomMap ? 'CM' : String(selectedMap + 1).padStart(2, '0');
    ui.time.textContent = formatTime(runTime);
    ui.mode.textContent = selectedMode === 'extreme' ? 'EXTREME ×1.87' : 'NORMAL';
    const syncingPlayer = players.find(player => !player.downed && !player.escaped && player.exitHold > 0);
    const objectiveText = syncingPlayer
      ? `P${syncingPlayer.id + 1} 탈출 동기화 ${Math.max(0, exitDuration() - syncingPlayer.exitHold).toFixed(1)}초`
      : exitActive ? `최종 장치 위에서 ${exitDuration()}초 유지하세요` : currentCourse.objectives[zone];
    ui.objective.querySelector('b').textContent = objectiveText;
    players.forEach(p => {
      const chip = $(`playerChip${p.id}`);
      if (!chip) return;
      chip.querySelectorAll('.hp i').forEach((segment, index) => {
        const fill = clamp((p.hp - index * 20) / 20, 0, 1);
        segment.classList.toggle('on', fill >= .999);
        segment.classList.toggle('partial', fill > 0 && fill < .999);
        segment.style.setProperty('--fill', `${fill * 100}%`);
      });
      const stateLabel = p.escaped ? `#${p.finishPlace} FINISH` : p.awaitingReviveChoice ? 'I:CHECK / O:CORE' : p.downed ? 'SIGNAL LOST' : p.invulnerable > 0 ? 'SYNCING' : 'ACTIVE';
      chip.querySelector('.chip-state').textContent = stateLabel;
      const chargeEls = chip.querySelectorAll('.charges i');
      chargeEls.forEach((el, i) => el.classList.toggle('on', i < p.brakeCharges));
      const cooldowns = [
        [chip.querySelector('.jump-cd'), p.jumpCooldown, p.jumpCooldownMax],
        [chip.querySelector('.boost-cd'), p.boostCooldown, p.boostCooldownMax]
      ];
      cooldowns.forEach(([element, remaining, maximum]) => {
        const ready = remaining <= .01;
        element.style.setProperty('--ready', `${(1 - remaining / maximum) * 100}%`);
        element.classList.toggle('ready', ready);
        element.querySelector('em').textContent = ready ? 'READY' : remaining.toFixed(1);
      });
      chip.style.opacity = p.escaped ? '.45' : '1';
    });
    const p1 = players[window.OnlineSession?.isGuestPlaying() ? window.OnlineSession.localSlot() : 0];
    if (p1) {
      const mobileCooldowns = [
        [$('mobileJump'), p1.jumpCooldown, p1.jumpCooldownMax],
        [$('mobileBoost'), p1.boostCooldown, p1.boostCooldownMax]
      ];
      mobileCooldowns.forEach(([button, remaining, maximum]) => {
        button.style.setProperty('--cooldown', `${clamp(remaining / maximum, 0, 1) * 100}%`);
        button.classList.toggle('disabled', remaining > .01);
        button.querySelector('small').textContent = remaining > .01 ? `${remaining.toFixed(1)}초` : button === $('mobileJump') ? '점프' : '부스터';
      });
      $('mobileBrake').classList.toggle('disabled', selectedMode === 'extreme' || p1.brakeCharges <= 0);
      $('mobileBrake').querySelector('small').textContent = selectedMode === 'extreme' ? '사용 불가' : `${p1.brakeCharges}/2`;
    }
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
    const key = `slip-out-best-${selectedMap}-${selectedMode}-${selectedPlayers}`;
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
    const ranked = [...players].sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99) || a.id - b.id);
    ui.rankings.innerHTML = ranked.map(player => `
      <div class="rank-row" style="--rank-color:${player.finishPlace ? '#dfff73' : '#718899'};--player-color:${player.color}">
        <span class="place">${player.finishPlace ? `#${player.finishPlace}` : '—'}</span>
        <span class="racer">P${player.id + 1}</span>
        <span class="rank-deaths">사망 ${player.deathCount}회</span>
        <span>${player.finishTime == null ? '미도착' : formatTime(player.finishTime)}</span>
      </div>`).join('');
    ui.record.textContent = isRecord ? 'NEW TEAM RECORD' : `BEST ${oldBest.toLocaleString('ko-KR')}`;
    ui.hud.classList.remove('is-visible');
    ui.results.classList.add('is-visible');
    updateMobileVisibility();
    sound.win();
    if (full && !selectedCustomMap) window.OnlineSession?.recordFullClear(activeRunId);
    window.OnlineSession?.onRunFinished(resultData);
  }

  function reviveDebugSnapshot() {
    return {
      checkpointIndex,
      pendingOrder: pendingRevivePlayers().map(player => player.id),
      players: players.map(player => ({
        playerId: player.id,
        awaitingChoice: player.awaitingReviveChoice,
        rescuerId: player.reviveRescuerId,
        queuedAt: player.reviveQueuedAt,
        choice: player.reviveChoice,
        deathPosition: { x: player.coreX, y: player.coreY }
      }))
    };
  }

  // main.js installs the base diagnostic object later in the same page load.
  setTimeout(() => {
    const debug = window.__SLIP_OUT_DEBUG__;
    if (!debug?.snapshot || debug.reviveChoiceWrapped) return;
    const baseSnapshot = debug.snapshot;
    debug.snapshot = () => ({ ...baseSnapshot(), reviveChoices: reviveDebugSnapshot() });
    debug.reviveChoiceWrapped = true;
  }, 0);

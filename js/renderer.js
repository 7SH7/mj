'use strict';

// SLIP OUT: renderer layer
function drawBackground() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gradient = ctx.createRadialGradient(cssWidth * .55, cssHeight * .45, 0, cssWidth * .5, cssHeight * .5, Math.max(cssWidth, cssHeight));
    gradient.addColorStop(0, currentCourse.background[0]); gradient.addColorStop(.5, currentCourse.background[1]); gradient.addColorStop(1, currentCourse.background[2]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.globalAlpha = .22;
    ctx.strokeStyle = currentCourse.background[3]; ctx.lineWidth = 1;
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

  function drawWind(wind) {
    ctx.save();
    roundedRect(wind.x, wind.y, wind.w, wind.h, 18);
    ctx.fillStyle = 'rgba(100,255,190,.055)'; ctx.fill();
    ctx.strokeStyle = 'rgba(123,232,165,.28)'; ctx.lineWidth = 3; ctx.stroke();
    roundedRect(wind.x + 4, wind.y + 4, wind.w - 8, wind.h - 8, 15); ctx.clip();
    const angle = Math.atan2(wind.dirY, wind.dirX);
    const spacing = 120;
    const offset = (worldTime * wind.strength * .22) % spacing;
    ctx.strokeStyle = 'rgba(148,255,205,.34)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let y = wind.y - spacing; y < wind.y + wind.h + spacing; y += spacing) {
      for (let x = wind.x - spacing; x < wind.x + wind.w + spacing; x += spacing) {
        const px = x + wind.dirX * offset, py = y + wind.dirY * offset;
        ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(-22, -11); ctx.lineTo(0, 0); ctx.lineTo(-22, 11); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawBumper(bumper) {
    const pulse = 1 + Math.sin(worldTime * 5 + bumper.x * .01) * .08;
    ctx.save(); ctx.translate(bumper.x, bumper.y); ctx.scale(pulse, pulse);
    ctx.shadowColor = '#7be8a5'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#10291f'; ctx.strokeStyle = '#7be8a5'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, bumper.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(220,255,232,.65)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, bumper.r * .55, 0, TAU); ctx.stroke();
    for (let angle = 0; angle < TAU; angle += Math.PI / 4) {
      ctx.save(); ctx.rotate(angle); ctx.fillStyle = '#d9ffe5'; ctx.fillRect(bumper.r * .72, -3, bumper.r * .22, 6); ctx.restore();
    }
    ctx.restore();
  }

  function drawShockwave(emitter) {
    const progress = ((worldTime + emitter.phase) % emitter.period) / emitter.period;
    const radius = progress * emitter.maxRadius;
    ctx.save(); ctx.translate(emitter.x, emitter.y);
    ctx.strokeStyle = `rgba(255,212,92,${.72 * (1 - progress)})`; ctx.lineWidth = emitter.width;
    ctx.shadowColor = '#ffd45c'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#2a210c'; ctx.strokeStyle = '#ffd45c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 34 + Math.sin(worldTime * 6) * 3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff0aa'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawLaser(laser) {
    ctx.save();
    ctx.lineCap = 'round';
    if (laser.active) {
      ctx.shadowColor = '#e567ff'; ctx.shadowBlur = 24;
      ctx.strokeStyle = 'rgba(224,103,255,.95)'; ctx.lineWidth = 10;
    } else {
      ctx.setLineDash([14, 18]);
      ctx.strokeStyle = laser.warning ? 'rgba(255,190,90,.72)' : 'rgba(188,120,255,.16)';
      ctx.lineWidth = 4;
    }
    ctx.beginPath(); ctx.moveTo(laser.x1, laser.y1); ctx.lineTo(laser.x2, laser.y2); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    for (const point of [[laser.x1, laser.y1], [laser.x2, laser.y2]]) {
      ctx.fillStyle = '#171021'; ctx.strokeStyle = laser.active ? '#e567ff' : '#76508d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(point[0], point[1], 18, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
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
    if (player.disconnected || selectedMode === 'extreme' || surface?.type === 'black' || player.downed || player.escaped) return;
    let x = player.x, y = player.y, vx = player.vx, vy = player.vy;
    ctx.save(); ctx.fillStyle = rgba(player.color, .28);
    for (let i = 0; i < 9; i++) {
      x += vx * .11; y += vy * .11; vx *= .985; vy *= .985;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, 5 - i * .35), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(player) {
    if (player.disconnected || player.downed || player.escaped) return;
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
    if (player.boostCooldown > player.boostCooldownMax - .4) {
      ctx.fillStyle = '#fff36f'; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-42 - Math.random() * 15, 0); ctx.lineTo(-18, 8); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = player.color; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`P${player.id + 1}`, player.x, renderY - 31);
  }

  function drawCore(player) {
    if (player.disconnected || !player.downed) return;
    const pulse = Math.sin(worldTime * 5 + player.id) * 7;
    const linked = player.awaitingReviveChoice;
    const coreColor = linked ? '#b4ff62' : player.color;
    ctx.save(); ctx.translate(player.coreX, player.coreY);
    ctx.strokeStyle = coreColor; ctx.shadowColor = coreColor; ctx.shadowBlur = linked ? 42 : 25;
    ctx.lineWidth = linked ? 8 : 5; ctx.beginPath(); ctx.arc(0, 0, 31 + pulse, 0, TAU); ctx.stroke();
    ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 48 + pulse * .3, -worldTime * 2, TAU - worldTime * 2); ctx.stroke(); ctx.setLineDash([]);
    const coreAngle = worldTime * (linked ? 3.2 : 1.8);
    ctx.fillStyle = rgba(coreColor, linked ? .95 : .72); ctx.rotate(coreAngle); ctx.fillRect(-12, -12, 24, 24);
    ctx.shadowBlur = 0; ctx.rotate(-coreAngle);
    const beam = ctx.createLinearGradient(0, -40, 0, -180); beam.addColorStop(0, rgba(coreColor, linked ? .55 : .32)); beam.addColorStop(1, rgba(coreColor, 0));
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-9, -25); ctx.lineTo(-3, -180); ctx.lineTo(3, -180); ctx.lineTo(9, -25); ctx.fill();
    ctx.fillStyle = coreColor; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(linked ? `LINKED · ${Math.max(0, player.reviveChoiceRemaining || 0).toFixed(1)}s` : `RESCUE P${player.id + 1}`, 0, -62);
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
    const positions = tutorialSession.active
      ? [430, 820, 1170, 1530, 1940]
      : selectedCustomMap
      ? Array.from({ length: 5 }, (_, index) => lerp(selectedCustomMap.layout.spawn.x, selectedCustomMap.layout.exit.x, index / 4))
      : [600, 3150, 4800, 6400, 7750];
    ctx.save(); ctx.textAlign = 'center';
    positions.forEach((x, i) => {
      ctx.fillStyle = 'rgba(166,224,241,.1)'; ctx.font = '600 72px "IBM Plex Mono", monospace';
      ctx.fillText(String(i + 1).padStart(2, '0'), x, 90);
      ctx.fillStyle = 'rgba(166,224,241,.22)'; ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.fillText(currentCourse.zoneNames[i].toUpperCase(), x, 115);
    });
    ctx.restore();
  }

  function drawTutorialFloorGuide() {
    if (!tutorialSession.active) return;
    const controls = controlMaps[0];
    const guides = [
      { x: 430, y: 650, title: `${keyLabel(controls.up)} ${keyLabel(controls.left)} ${keyLabel(controls.down)} ${keyLabel(controls.right)}`, body: '이동 · 조향', done: tutorialSession.progress.move },
      { x: 820, y: 950, title: keyLabel(controls.jump), body: '점프', done: tutorialSession.progress.jump },
      { x: 1170, y: 650, title: keyLabel(controls.boost), body: '부스터', done: tutorialSession.progress.boost },
      { x: 1530, y: 950, title: keyLabel(controls.brake), body: '브레이크', done: tutorialSession.progress.brake }
    ];
    ctx.save(); ctx.textAlign = 'center';
    for (const guide of guides) {
      ctx.strokeStyle = guide.done ? 'rgba(180,255,98,.8)' : 'rgba(84,245,255,.55)';
      ctx.fillStyle = guide.done ? 'rgba(180,255,98,.12)' : 'rgba(2,14,23,.56)';
      ctx.lineWidth = 4; roundedRect(guide.x - 145, guide.y - 74, 290, 148, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = guide.done ? '#b4ff62' : '#e8fcff';
      ctx.font = '800 26px "IBM Plex Mono", monospace'; ctx.fillText(guide.done ? '✓ COMPLETE' : guide.title, guide.x, guide.y - 8);
      ctx.fillStyle = guide.done ? 'rgba(180,255,98,.72)' : 'rgba(166,224,241,.78)';
      ctx.font = '700 15px "IBM Plex Mono", monospace'; ctx.fillText(guide.body, guide.x, guide.y + 30);
    }
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
    drawTutorialFloorGuide();
    for (const hole of holes) drawHole(hole);
    drawCollapseTiles();
    drawPads();
    for (const wind of winds) drawWind(wind);
    for (const emitter of shockwaves) drawShockwave(emitter);
    for (const laser of lasers) drawLaser(laser);
    for (const bumper of bumpers) drawBumper(bumper);
    drawCheckpoints(); drawExit();
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

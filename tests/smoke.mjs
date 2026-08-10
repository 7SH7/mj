const endpoint = 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const pages = await fetch(`${endpoint}/json`).then(response => response.json());
      const page = pages.find(item => item.type === 'page' && item.url.includes('index.html'));
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge DevTools endpoint did not become ready.');
}

const page = await waitForPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text);
});
socket.addEventListener('close', () => {
  for (const { reject } of pending.values()) reject(new Error('DevTools socket closed.'));
  pending.clear();
});

function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools call timed out: ${method}`));
    }, 4000);
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); }
    });
  });
}

async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await call('Runtime.enable');
  await call('Log.enable');
  await evaluate(`new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))`);
  assert(await evaluate(`typeof window.__SLIP_OUT_DEBUG__ === 'object'`), 'Debug snapshot API was not initialized.');
  assert(await evaluate(`document.getElementById('menu').classList.contains('is-visible')`), 'Main menu is not visible.');
  assert(await evaluate(`JSON.stringify([...document.scripts].map(script => script.getAttribute('src')).filter(Boolean)) === JSON.stringify(['js/core.js','js/input.js','js/courses.js','js/custom-maps.js','js/engine.js','js/renderer.js','vendor/trystero-0.25.3.js','js/online.js','js/main.js'])`), 'Feature scripts were not loaded in the expected dependency order.');
  assert(await evaluate(`document.querySelectorAll('[data-map]').length === 5`), 'Five-map selector was not rendered.');
  assert(await evaluate(`document.querySelectorAll('[data-players]').length === 0 && !!document.getElementById('channelButton')`), 'Legacy multiplayer count selector was not replaced by the channel entry.');
  assert(await evaluate(`!!document.getElementById('publicRoomList') && !!document.getElementById('createRoomForm') && !!document.getElementById('findRoomForm')`), 'Online channel browser UI is incomplete.');
  assert(await evaluate(`!!document.getElementById('roomCourse')`), 'Room course selector is missing.');
  await evaluate(`OnlineSession.openCreateForm(); document.getElementById('roomCourse').value='3'; document.getElementById('roomCourse').dispatchEvent(new Event('change'))`);
  assert(await evaluate(`document.getElementById('createMapLabel').textContent.includes('04') && document.getElementById('createMapLabel').textContent.includes('레이저')`), 'Room course selector did not update the round settings.');
  await evaluate(`document.querySelector('[data-channel-back]').click()`);

  await evaluate(`localStorage.removeItem('slip-out-tutorial-complete-v1'); initializeTutorial()`);
  assert(await evaluate(`document.getElementById('tutorialScreen').classList.contains('is-visible')`), 'First-run tutorial did not open.');
  await evaluate(`document.getElementById('startTutorialButton').click(); startCountdown=0; ['KeyD','Space','ShiftLeft','KeyE'].forEach(code => dispatchEvent(new KeyboardEvent('keydown',{code})))`);
  await sleep(180);
  await evaluate(`['KeyD','Space','ShiftLeft','KeyE'].forEach(code => dispatchEvent(new KeyboardEvent('keyup',{code})))`);
  assert(await evaluate(`Object.values(window.__SLIP_OUT_DEBUG__.snapshot().tutorial.progress).every(Boolean)`), 'Tutorial did not recognize all four controls.');
  assert(await evaluate(`document.querySelectorAll('#tutorialCoach [data-tutorial-step].is-done').length === 4`), 'Tutorial checklist did not complete.');
  await sleep(1350);
  assert(await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot().tutorial.completed && !window.__SLIP_OUT_DEBUG__.snapshot().tutorial.active`), 'Tutorial completion was not saved.');
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'})); dispatchEvent(new KeyboardEvent('keyup', {code:'Escape'})); document.getElementById('menuButton').click()`);

  const mapProfiles = [];
  for (let mapIndex = 0; mapIndex < 5; mapIndex++) {
    await evaluate(`document.querySelector('[data-map="${mapIndex}"]').click()`);
    const profile = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
    assert(profile.selectedMap === mapIndex, `Map ${mapIndex + 1} selection failed.`);
    assert(profile.courseValidation.checkpoints.every(Boolean) && profile.courseValidation.exit, `Map ${mapIndex + 1} has an invalid checkpoint or exit surface.`);
    mapProfiles.push(profile.obstacleCounts);
    await evaluate(`document.getElementById('startButton').click()`);
    await sleep(140);
    const initialized = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
    assert(initialized.state === 'playing' && initialized.players.length === 1, `Map ${mapIndex + 1} did not initialize a playable run.`);
    await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'})); dispatchEvent(new KeyboardEvent('keyup', {code:'Escape'})); document.getElementById('menuButton').click()`);
  }
  assert(mapProfiles[1].winds >= 5 && mapProfiles[1].bumpers >= 6, 'Wind-course obstacles are missing.');
  assert(mapProfiles[2].shockwaves >= 5, 'Pulse-course shockwaves are missing.');
  assert(mapProfiles[3].lasers >= 6, 'Laser-course hazards are missing.');
  assert(mapProfiles[4].winds > 0 && mapProfiles[4].shockwaves > 0 && mapProfiles[4].lasers > 0 && mapProfiles[4].bumpers > 0, 'Final course does not combine all new obstacle types.');
  await evaluate(`document.querySelector('[data-map="0"]').click()`);

  await evaluate(`document.getElementById('settingsButton').click()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'settings', 'Key settings did not open.');
  await evaluate(`document.querySelector('[data-key-action="boost"]').click(); dispatchEvent(new KeyboardEvent('keydown', {code:'KeyR'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).controls[0].boost === 'KeyR', 'Key remapping did not update the input map.');
  assert(await evaluate(`document.getElementById('guideBoost').textContent === 'R'`), 'Remapped control label did not refresh.');
  await evaluate(`document.getElementById('resetKeysButton').click(); document.getElementById('closeSettingsButton').click()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).controls[0].boost === 'ShiftLeft', 'Default key reset failed.');

  await evaluate(`CustomMapStore.recordFullClear('smoke-clear-1'); CustomMapStore.recordFullClear('smoke-clear-2'); CustomMapStore.recordFullClear('smoke-clear-3'); OnlineSession.refreshCustomUi()`);
  assert((await evaluate(`CustomMapStore.getStatus()`)).unlocked, 'Custom maps did not unlock after three full clears.');
  const mapCountBeforeTest = await evaluate(`CustomMapStore.list().length`);
  await evaluate(`(() => {
    document.getElementById('customMapsButton').click(); document.getElementById('showCustomCreatorButton').click();
    document.getElementById('customMapName').value='SMOKE LAB'; document.getElementById('customMapDifficulty').value='3';
    const canvas=document.getElementById('customMapEditor'); const rect=canvas.getBoundingClientRect();
    const place=(tool,x,y)=>{ document.querySelector('[data-editor-tool="'+tool+'"]').click(); canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:rect.left+x/8600*rect.width,clientY:rect.top+y/1600*rect.height,button:0,bubbles:true})); };
    place('spawn',400,800); place('exit',8200,800); place('floor-safe',2800,800); place('pillar',1800,500); place('rotor',3600,1000); place('laser',5900,800);
    document.getElementById('customMapForm').requestSubmit();
  })()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'playing', 'Authored custom map did not enter creator test play.');
  assert(await evaluate(`CustomMapStore.list().length === ${mapCountBeforeTest}`), 'Uncleared custom map was registered before creator validation.');
  assert(await evaluate(`selectedCustomMap && selectedCustomMap.verified === false`), 'Creator test did not use an unverified draft.');
  assert(await evaluate(`selectedCustomMap.layout.floors.length === 1 && floors.length === 2 && surfaceAt(2800,800).type === 'safe'`), 'Custom floor patch was not generated with its selected surface type.');
  await evaluate(`startCountdown=0; players[0].x=exit.x; players[0].y=exit.y; players[0].exitHold=exitDuration(); escapePlayer(players[0])`);
  assert(await evaluate(`CustomMapStore.list().length === ${mapCountBeforeTest + 1}`), 'Creator-cleared custom map was not registered.');
  assert(await evaluate(`document.getElementById('resultTitle').textContent === '커스텀 맵 등록 완료'`), 'Custom-map verification result was not shown.');
  const customValidation = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot().courseValidation`);
  assert(customValidation.checkpoints.every(Boolean) && customValidation.exit, 'Authored custom map has an invalid checkpoint or exit surface.');
  await evaluate(`document.getElementById('againButton').click(); startCountdown=0; players[0].x=exit.x; players[0].y=exit.y; players[0].exitHold=exitDuration(); escapePlayer(players[0])`);
  assert(await evaluate(`!document.getElementById('customReviewForm').classList.contains('is-hidden')`), 'Custom-map review prompt was not shown after a verified run.');
  await evaluate(`document.querySelector('[data-review-rating="5"]').click(); document.getElementById('customReviewText').value='바닥 변화가 재미있어요'; document.getElementById('customReviewForm').requestSubmit()`);
  assert(await evaluate(`CustomMapStore.getRating(selectedCustomMap).average === 5 && CustomMapStore.getRating(selectedCustomMap).count >= 1`), 'Custom-map rating and review were not stored.');
  await evaluate(`document.getElementById('resultMenuButton').click(); document.querySelector('[data-map="0"]').click()`);

  await evaluate(`document.getElementById('startButton').click()`);
  await sleep(3650);
  const before = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(before.state === 'playing', 'Game did not enter playing state.');
  assert(before.players.length === 1, 'Default single-player run was not created.');
  assert(before.exitTimer === 2, 'Goal hold duration was not changed to 2 seconds.');
  assert(await evaluate(`document.querySelectorAll('#playerChip0 .hp i').length === 5`), 'Health HUD is not segmented into five stacks.');
  assert(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#playerChip0 .hp')).height) >= 10`), 'Health gauge is too small to read.');
  assert(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#playerChip0 .ability')).height) >= 24`), 'Ability gauge is too small to read.');
  assert(await evaluate(`document.getElementById('mobileControls').classList.contains('is-visible')`), 'Mobile control layer was not activated.');

  await call('Emulation.setDeviceMetricsOverride', { width: 780, height: 450, deviceScaleFactor: 1, mobile: true });
  await sleep(100);
  assert(await evaluate(`getComputedStyle(document.getElementById('mobileControls')).display === 'block'`), 'Responsive mobile controls are not visible.');
  assert(await evaluate(`document.getElementById('mobileJump').getBoundingClientRect().width >= 100 && document.getElementById('mobileBoost').getBoundingClientRect().width >= 88`), 'Mobile jump or boost gauge button is too small to read.');
  assert(await evaluate(`getComputedStyle(document.querySelector('#playerChip0 .ability-cooldowns')).display !== 'none'`), 'Mobile ability gauges are hidden.');
  const joystick = await evaluate(`(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, radius:r.width*.25}; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: joystick.x + joystick.radius, y: joystick.y, button: 'left', clickCount: 1 });
  await sleep(120);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).mobileInput.x > .4, 'Mobile joystick input was not registered.');
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: joystick.x + joystick.radius, y: joystick.y, button: 'left', clickCount: 1 });
  await call('Emulation.clearDeviceMetricsOverride');
  await sleep(100);

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'KeyD'}))`);
  await sleep(900);
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Space'})); dispatchEvent(new KeyboardEvent('keydown', {code:'ShiftLeft'}))`);
  await sleep(350);
  await evaluate(`dispatchEvent(new KeyboardEvent('keyup', {code:'Space'})); dispatchEvent(new KeyboardEvent('keyup', {code:'ShiftLeft'})); dispatchEvent(new KeyboardEvent('keyup', {code:'KeyD'}))`);
  await sleep(150);
  const after = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(after.players[0].x > before.players[0].x + 40, 'Inertia movement did not advance the player.');
  assert(after.runTime > before.runTime, 'Run timer did not advance.');
  assert(after.players[0].jumpCooldown > 0, 'Jump cooldown did not activate.');
  assert(after.players[0].boostCooldown > 0, 'Boost cooldown did not activate.');
  assert(after.players[0].jumpCooldownMax === 2, 'Jump cooldown was not set to 2 seconds.');
  assert(after.players[0].boostCooldownMax === 5, 'Boost cooldown was not set to 5 seconds.');
  assert(after.players[0].hp > 0 && !after.players[0].downed, 'Player unexpectedly failed in the start area.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'paused', 'Pause input failed.');
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'playing', 'Resume input failed.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'})); document.getElementById('menuButton').click()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'menu', 'Return-to-menu action failed.');
  await evaluate(`document.querySelector('[data-map="4"]').click(); document.querySelector('[data-mode="extreme"]').click(); selectedPlayers=4; startGame()`);
  await sleep(3450);
  const coopBefore = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(coopBefore.players.length === 4, 'Four-player run was not created.');
  assert(coopBefore.selectedMode === 'extreme', 'Extreme preset was not selected.');
  assert(coopBefore.selectedMap === 4, 'Final course was not selected for the hard-mode test.');
  assert(coopBefore.exitTimer === 2, 'Extreme goal hold duration was not fixed to 2 seconds.');
  await evaluate(`startCountdown=0; ['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keydown', {code})))`);
  await sleep(500);
  await evaluate(`['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keyup', {code})))`);
  const coopAfter = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  coopAfter.players.forEach((player, index) => assert(player.x > coopBefore.players[index].x + 2, `P${index + 1} keyboard input failed (${coopBefore.players[index].x.toFixed(1)} -> ${player.x.toFixed(1)}).`));

  await evaluate(`returnToMenu(); selectedMode='normal'; selectedPlayers=2; configureCourse(0); startGame(); startCountdown=0; players[1].lastGroundX=1333; players[1].lastGroundY=777; downPlayer(players[1], 'smoke'); beginReviveChoice(players[1], players[0]); dispatchEvent(new KeyboardEvent('keydown', {code:'KeyI'})); dispatchEvent(new KeyboardEvent('keyup', {code:'KeyI'}))`);
  const checkpointRevive = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(!checkpointRevive.players[1].downed && checkpointRevive.players[1].reviveChoice === 'checkpoint', 'I checkpoint revive choice failed.');
  await evaluate(`selectedMode='extreme'; players[1].lastGroundX=1444; players[1].lastGroundY=666; downPlayer(players[1], 'smoke'); beginReviveChoice(players[1], players[0])`);
  const extremeRevive = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(!extremeRevive.players[1].downed && extremeRevive.players[1].reviveChoice === 'start', 'Extreme-mode revive was not fixed to the start point.');
  assert(extremeRevive.players[1].deathCount === 2, 'Per-player death counter did not track both deaths.');
  const healthSafety = await evaluate(`(() => {
    selectedMode='normal'; const p=players[0]; p.downed=false; p.escaped=false; p.hp=100; p.invulnerable=0;
    p.x=1000; p.y=800; damagePlayer(p, 37, 1, 0); const afterHit=p.hp;
    p.invulnerable=0; p.x=checkpoints[0].x; p.y=checkpoints[0].y; damagePlayer(p, 99, 1, 0);
    return {afterHit, afterSafeHit:p.hp, safe:isCheckpointSafe(p.x,p.y)};
  })()`);
  assert(healthSafety.afterHit === 80, 'Damage was not quantized to one 20 HP stack.');
  assert(healthSafety.safe && healthSafety.afterSafeHit === 80, 'Checkpoint safe zone did not block damage.');
  assert(runtimeErrors.length === 0, `Browser errors: ${runtimeErrors.join(' | ')}`);

  console.log(JSON.stringify({ ok: true, maps: 5, mapInitialization: '5/5', customMaps: true, onlineChannelUi: true, reviveChoices: ['checkpoint','core','extreme-start'], newHazards: ['wind','shockwave','laser','bumper'], soloMovement: Math.round(after.players[0].x - before.players[0].x), keyRemapping: true, healthStacks: 5, tripleCooldowns: true, mobileControls: true, localCoopPlayers: coopAfter.players.length, extremeMode: coopAfter.selectedMode, browserErrors: 0 }));
} finally {
  try { await call('Browser.close'); } catch {}
  socket.close();
}

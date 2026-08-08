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
  assert(await evaluate(`document.querySelectorAll('[data-map]').length === 5`), 'Five-map selector was not rendered.');

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

  await evaluate(`document.getElementById('startButton').click()`);
  await sleep(3650);
  const before = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(before.state === 'playing', 'Game did not enter playing state.');
  assert(before.players.length === 1, 'Default single-player run was not created.');
  assert(before.exitTimer === 10, 'Normal goal timer was not shortened to 10 seconds.');
  assert(await evaluate(`document.querySelectorAll('#playerChip0 .hp i').length === 5`), 'Health HUD is not segmented into five stacks.');
  assert(await evaluate(`document.getElementById('mobileControls').classList.contains('is-visible')`), 'Mobile control layer was not activated.');

  await call('Emulation.setDeviceMetricsOverride', { width: 780, height: 450, deviceScaleFactor: 1, mobile: true });
  await sleep(100);
  assert(await evaluate(`getComputedStyle(document.getElementById('mobileControls')).display === 'block'`), 'Responsive mobile controls are not visible.');
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
  assert(after.players[0].jumpCooldownMax === 2.16, 'Jump cooldown was not increased to triple duration.');
  assert(after.players[0].boostCooldownMax === 5.55, 'Boost cooldown was not increased to triple duration.');
  assert(after.players[0].hp > 0 && !after.players[0].downed, 'Player unexpectedly failed in the start area.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'paused', 'Pause input failed.');
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'playing', 'Resume input failed.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'})); document.getElementById('menuButton').click()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'menu', 'Return-to-menu action failed.');
  await evaluate(`document.querySelector('[data-map="4"]').click(); document.querySelector('[data-players="4"]').click(); document.querySelector('[data-mode="extreme"]').click(); document.getElementById('startButton').click()`);
  await sleep(3450);
  const coopBefore = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(coopBefore.players.length === 4, 'Four-player run was not created.');
  assert(coopBefore.selectedMode === 'extreme', 'Extreme preset was not selected.');
  assert(coopBefore.selectedMap === 4, 'Final course was not selected for the hard-mode test.');
  assert(coopBefore.exitTimer === 8, 'Extreme goal timer was not shortened to 8 seconds.');
  await evaluate(`['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keydown', {code})))`);
  await sleep(500);
  await evaluate(`['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keyup', {code})))`);
  const coopAfter = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  coopAfter.players.forEach((player, index) => assert(player.x > coopBefore.players[index].x + 10, `P${index + 1} keyboard input failed.`));
  assert(runtimeErrors.length === 0, `Browser errors: ${runtimeErrors.join(' | ')}`);

  console.log(JSON.stringify({ ok: true, maps: 5, mapInitialization: '5/5', newHazards: ['wind','shockwave','laser','bumper'], soloMovement: Math.round(after.players[0].x - before.players[0].x), keyRemapping: true, healthStacks: 5, tripleCooldowns: true, mobileControls: true, localCoopPlayers: coopAfter.players.length, extremeMode: coopAfter.selectedMode, browserErrors: 0 }));
} finally {
  try { await call('Browser.close'); } catch {}
  socket.close();
}

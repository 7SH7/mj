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

  await evaluate(`document.getElementById('startButton').click()`);
  await sleep(3650);
  const before = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(before.state === 'playing', 'Game did not enter playing state.');
  assert(before.players.length === 1, 'Default single-player run was not created.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'KeyD'}))`);
  await sleep(900);
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'KeyQ'}))`);
  await sleep(350);
  await evaluate(`dispatchEvent(new KeyboardEvent('keyup', {code:'KeyQ'})); dispatchEvent(new KeyboardEvent('keyup', {code:'KeyD'}))`);
  await sleep(150);
  const after = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(after.players[0].x > before.players[0].x + 40, 'Inertia movement did not advance the player.');
  assert(after.runTime > before.runTime, 'Run timer did not advance.');
  assert(after.players[0].hp > 0 && !after.players[0].downed, 'Player unexpectedly failed in the start area.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'paused', 'Pause input failed.');
  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'playing', 'Resume input failed.');

  await evaluate(`dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'})); document.getElementById('menuButton').click()`);
  assert((await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`)).state === 'menu', 'Return-to-menu action failed.');
  await evaluate(`document.querySelector('[data-players="4"]').click(); document.querySelector('[data-mode="extreme"]').click(); document.getElementById('startButton').click()`);
  await sleep(3450);
  const coopBefore = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  assert(coopBefore.players.length === 4, 'Four-player run was not created.');
  assert(coopBefore.selectedMode === 'extreme', 'Extreme preset was not selected.');
  await evaluate(`['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keydown', {code})))`);
  await sleep(500);
  await evaluate(`['KeyD','ArrowRight','KeyL','Numpad6'].forEach(code => dispatchEvent(new KeyboardEvent('keyup', {code})))`);
  const coopAfter = await evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  coopAfter.players.forEach((player, index) => assert(player.x > coopBefore.players[index].x + 10, `P${index + 1} keyboard input failed.`));
  assert(runtimeErrors.length === 0, `Browser errors: ${runtimeErrors.join(' | ')}`);

  console.log(JSON.stringify({ ok: true, soloMovement: Math.round(after.players[0].x - before.players[0].x), localCoopPlayers: coopAfter.players.length, extremeMode: coopAfter.selectedMode, browserErrors: 0 }));
} finally {
  try { await call('Browser.close'); } catch {}
  socket.close();
}

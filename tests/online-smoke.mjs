const endpoint = 'http://127.0.0.1:9224';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const installTransportMock = `(() => {
  const mockSelfId = 'mock-' + crypto.getRandomValues(new Uint32Array(2)).join('-');
  window.TrysteroP2P = {
    selfId: mockSelfId,
    joinRoom(_config, roomId) {
      const channel = new BroadcastChannel('slip-out-test-' + roomId);
      const peers = new Set();
      const actionHandlers = new Map();
      const room = {
        onPeerJoin: null, onPeerLeave: null,
        getPeers: () => Object.fromEntries([...peers].map(id => [id, {}])),
        makeAction(name) {
          const action = {
            onMessage: null,
            send(data, options) {
              channel.postMessage({ kind: 'action', from: mockSelfId, name, data, target: options?.target || null });
              return Promise.resolve();
            }
          };
          actionHandlers.set(name, action);
          return action;
        },
        leave() {
          channel.postMessage({ kind: 'leave', from: mockSelfId });
          setTimeout(() => channel.close(), 20);
        }
      };
      const addPeer = peerId => {
        if (peerId === mockSelfId || peers.has(peerId)) return;
        peers.add(peerId);
        setTimeout(() => room.onPeerJoin?.(peerId), 0);
      };
      channel.onmessage = event => {
        const message = event.data;
        if (!message || message.from === mockSelfId) return;
        if (message.kind === 'join') {
          addPeer(message.from);
          channel.postMessage({ kind: 'ack', from: mockSelfId, target: message.from });
        } else if (message.kind === 'ack' && message.target === mockSelfId) addPeer(message.from);
        else if (message.kind === 'leave') {
          if (peers.delete(message.from)) room.onPeerLeave?.(message.from);
        } else if (message.kind === 'action') {
          const targets = Array.isArray(message.target) ? message.target : message.target ? [message.target] : [];
          if (targets.length && !targets.includes(mockSelfId)) return;
          actionHandlers.get(message.name)?.onMessage?.(message.data, { peerId: message.from });
        }
      };
      setTimeout(() => channel.postMessage({ kind: 'join', from: mockSelfId }), 0);
      return room;
    }
  };
  return mockSelfId;
})()`;

async function connect(endpoint, excludedIds = new Set()) {
  let page;
  for (let attempt = 0; attempt < 60 && !page; attempt++) {
    try {
      const pages = await fetch(`${endpoint}/json`).then(response => response.json());
      page = pages.find(item => item.type === 'page' && item.url.includes('index.html') && !excludedIds.has(item.id));
    } catch {}
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`DevTools page unavailable: ${endpoint}`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const call = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`DevTools call timed out: ${method}`));
      }, 10000);
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); }
      });
    });
  };
  const evaluate = async expression => {
    let response;
    try { response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); }
    catch (error) { throw new Error(`${error.message} · expression: ${expression.slice(0, 180)}`); }
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  await call('Runtime.enable');
  await evaluate(`new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))`);
  return { pageId: page.id, call, evaluate, errors, close: () => socket.close() };
}

async function waitFor(client, expression, timeout = 30000, label = expression) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await client.evaluate(expression)) return;
    await sleep(300);
  }
  throw new Error(`Timed out: ${label}`);
}

const host = await connect(endpoint);
await fetch(`${endpoint}/json/new?${encodeURIComponent('http://127.0.0.1:8765/index.html')}`, { method: 'PUT' });
const guest = await connect(endpoint, new Set([host.pageId]));
try {
  await Promise.all([host.evaluate(installTransportMock), guest.evaluate(installTransportMock)]);
  await host.evaluate(`(() => {
    CustomMapStore.recordFullClear('online-unlock-1'); CustomMapStore.recordFullClear('online-unlock-2'); CustomMapStore.recordFullClear('online-unlock-3');
    const draft=CustomMapStore.createDraft({name:'ONLINE GRID',difficulty:3,layout:{spawn:{x:400,y:800},exit:{x:8200,y:800,r:118},objects:[{type:'pillar',x:1900,y:500},{type:'rotor',x:3900,y:1000},{type:'laser',x:6100,y:800}]}});
    window.testOnlineCustomMap=CustomMapStore.registerVerified(draft,{fullClear:true,creatorTest:true,runId:'online-map-proof'});
  })()`);
  await Promise.all([
    host.evaluate(`OnlineSession.openChannel(); true`),
    guest.evaluate(`OnlineSession.openChannel(); true`)
  ]);
  await waitFor(host, `document.getElementById('networkStatusText').textContent.includes('연결')`, 25000, 'host online module');
  await waitFor(guest, `document.getElementById('networkStatusText').textContent.includes('연결')`, 25000, 'guest online module');

  await host.evaluate(`document.getElementById('createRoomButton').click(); document.getElementById('roomCapacity').value='2'; document.getElementById('roomCourse').value='3'; document.getElementById('roomCourse').dispatchEvent(new Event('change')); document.querySelector('input[name="roomVisibility"][value="public"]').click(); document.getElementById('createRoomForm').requestSubmit()`);
  await waitFor(host, `OnlineSession.debug().role === 'host' && OnlineSession.debug().roomCode.length === 4`, 15000, 'host room creation');
  const code = await host.evaluate(`OnlineSession.debug().roomCode`);
  await guest.evaluate(`document.getElementById('findRoomButton').click(); document.getElementById('roomCodeInput').value='${code}'; document.getElementById('findRoomForm').requestSubmit()`);
  try {
    await waitFor(guest, `OnlineSession.debug().role === 'guest' && OnlineSession.debug().roster.length === 2`, 45000, 'guest room join');
  } catch (error) {
    const diagnostics = await Promise.all([
      host.evaluate(`({online:OnlineSession.debug(),status:document.getElementById('networkStatusText').textContent})`),
      guest.evaluate(`({online:OnlineSession.debug(),status:document.getElementById('networkStatusText').textContent})`)
    ]);
    throw new Error(`${error.message} · ${JSON.stringify(diagnostics)} · browser=${[...host.errors, ...guest.errors].join(' | ')}`);
  }
  await waitFor(host, `OnlineSession.debug().roster.length === 2`, 15000, 'host roster update');

  await host.evaluate(`document.getElementById('hostStartButton').click()`);
  await waitFor(host, `window.__SLIP_OUT_DEBUG__.snapshot().state === 'playing'`, 12000, 'host game start');
  await waitFor(guest, `window.__SLIP_OUT_DEBUG__.snapshot().state === 'playing'`, 20000, 'guest game start');
  const guestRound = await guest.evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  if (guestRound.selectedMap !== 3 || guestRound.courseName !== '레이저 격납고' || guestRound.obstacleCounts.lasers < 6 || !guestRound.courseValidation.exit) throw new Error(`Selected room round was not synchronized (${JSON.stringify({map:guestRound.selectedMap,name:guestRound.courseName,obstacles:guestRound.obstacleCounts})}).`);
  await host.evaluate(`startCountdown=0`);
  await guest.evaluate(`dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'})); OnlineSession.tick(.04)`);
  await waitFor(host, `OnlineSession.debug().remoteInputs.some(item => item[0] === 1 && item[1].x > .9)`, 6000, 'remote input delivery');
  await host.evaluate(`for(let i=0;i<18;i++) updateGame(1/30)`);
  await guest.evaluate(`dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'})); OnlineSession.tick(.04)`);
  const hostSnapshot = await host.evaluate(`window.__SLIP_OUT_DEBUG__.snapshot()`);
  if (hostSnapshot.players[1].x <= 432) throw new Error(`Remote input was not simulated by host (${hostSnapshot.players[1].x}).`);

  await host.evaluate(`players[1].lastGroundX=1333; players[1].lastGroundY=777; downPlayer(players[1],'online-smoke'); beginReviveChoice(players[1],players[0]); OnlineSession.tick(.07)`);
  await waitFor(guest, `window.__SLIP_OUT_DEBUG__.snapshot().players[1].downed && window.__SLIP_OUT_DEBUG__.snapshot().players[1].awaitingReviveChoice && document.getElementById('reviveChoiceOverlay').classList.contains('show') && document.getElementById('playerChip1').classList.contains('revive-contact')`, 12000, 'guest revive prompt');
  const revivePrompt = await guest.evaluate(`({visible:document.getElementById('reviveChoiceOverlay').classList.contains('show'),countdown:Number(document.getElementById('reviveChoiceCountdown').textContent),contact:document.getElementById('playerChip1').classList.contains('revive-contact')})`);
  if (!revivePrompt.visible || !revivePrompt.contact || revivePrompt.countdown <= 0 || revivePrompt.countdown > 5) throw new Error(`Revive contact feedback is incomplete (${JSON.stringify(revivePrompt)}).`);
  await guest.evaluate(`document.querySelector('[data-revive-choice="KeyI"]').click()`);
  await waitFor(host, `!window.__SLIP_OUT_DEBUG__.snapshot().players[1].downed`, 12000, 'player-owned revive choice');
  const revive = await host.evaluate(`window.__SLIP_OUT_DEBUG__.snapshot().players[1].reviveChoice`);
  if (revive !== 'checkpoint') throw new Error(`Guest revive choice was not authoritative (${revive}).`);
  await host.evaluate(`players[1].lastGroundX=1500; players[1].lastGroundY=800; downPlayer(players[1],'online-timeout'); beginReviveChoice(players[1],players[0]); players[1].reviveChoiceRemaining=.02; updateGame(.03)`);
  const timeoutRevive = await host.evaluate(`window.__SLIP_OUT_DEBUG__.snapshot().players[1]`);
  if (timeoutRevive.downed || timeoutRevive.reviveChoice !== 'checkpoint') throw new Error(`Revive timeout did not choose the safe checkpoint (${JSON.stringify(timeoutRevive)}).`);
  await guest.evaluate(`OnlineSession.leaveRoom(false)`);
  await waitFor(host, `window.__SLIP_OUT_DEBUG__.snapshot().players[1].disconnected && !document.getElementById('playerChip1') && OnlineSession.debug().roster.length === 1`, 12000, 'departed player removal');
  const departureToast = await host.evaluate(`document.getElementById('toast').textContent`);
  if (!departureToast.includes('P2') || !departureToast.includes('나갔습니다')) throw new Error(`Player departure notice was not shown (${departureToast}).`);

  await host.evaluate(`OnlineSession.leaveToMenu()`);
  await guest.evaluate(`returnToMenu()`);
  await Promise.all([
    host.evaluate(`OnlineSession.openChannel(window.testOnlineCustomMap)`),
    guest.evaluate(`OnlineSession.openChannel()`)
  ]);
  await host.evaluate(`document.getElementById('createRoomButton').click(); document.getElementById('roomCapacity').value='2'; document.getElementById('createRoomForm').requestSubmit()`);
  await waitFor(host, `OnlineSession.debug().role === 'host' && OnlineSession.debug().roomCode.length === 4`, 15000, 'custom host room creation');
  const customCode = await host.evaluate(`OnlineSession.debug().roomCode`);
  await guest.evaluate(`document.getElementById('findRoomButton').click(); document.getElementById('roomCodeInput').value='${customCode}'; document.getElementById('findRoomForm').requestSubmit()`);
  await waitFor(guest, `OnlineSession.debug().role === 'guest' && OnlineSession.debug().roster.length === 2`, 15000, 'custom guest room join');
  await waitFor(host, `OnlineSession.debug().roster.length === 2`, 15000, 'custom host roster');
  const hostReviewCount = await host.evaluate(`CustomMapStore.getRating(window.testOnlineCustomMap).count`);
  await host.evaluate(`document.getElementById('hostStartButton').click()`);
  await waitFor(guest, `window.__SLIP_OUT_DEBUG__.snapshot().state === 'playing' && window.__SLIP_OUT_DEBUG__.snapshot().courseName === 'ONLINE GRID'`, 15000, 'custom map synchronization');
  await host.evaluate(`startCountdown=0; players.forEach((player,index)=>{ player.escaped=true; player.finishPlace=index+1; player.finishTime=runTime; }); escapeOrder=players.map(player=>player.id); finishRun(true)`);
  await waitFor(guest, `window.__SLIP_OUT_DEBUG__.snapshot().state === 'results' && !document.getElementById('customReviewForm').classList.contains('is-hidden')`, 12000, 'guest custom review prompt');
  await guest.evaluate(`document.querySelector('[data-review-rating="4"]').click(); document.getElementById('customReviewText').value='멀티 평가 전달'; document.getElementById('customReviewForm').requestSubmit()`);
  await waitFor(host, `CustomMapStore.getRating(window.testOnlineCustomMap).count > ${hostReviewCount}`, 12000, 'P2P custom review delivery');
  if (host.errors.length || guest.errors.length) throw new Error(`Browser errors: ${[...host.errors, ...guest.errors].join(' | ')}`);

  console.log(JSON.stringify({ ok: true, transport: 'deterministic-browser-mock', codeLength: code.length, peers: 2, selectedRoomRound: guestRound.selectedMap + 1, remoteInput: true, hostAuthoritative: true, reviveContactFeedback: true, reviveCountdown: 5, playerOwnedRevive: revive, timeoutFallback: timeoutRevive.reviveChoice, departedPlayerRemoved: true, authoredCustomMapSynced: true, p2pReviewDelivered: true }));
} finally {
  await Promise.race([host.call('Browser.close').catch(() => {}), sleep(3000)]);
  host.close(); guest.close();
}

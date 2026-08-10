'use strict';

// SLIP OUT: serverless WebRTC rooms, public lobby and custom-map UI.
// Trystero is loaded only when online play is opened so offline play stays independent.
const OnlineSession = (() => {
  const APP_CONFIG = { appId: 'slip-out-games-v1' };
  const LOBBY_ID = 'slip-out-public-lobby-v1';
  const ROOM_PREFIX = 'slip-game-';
  const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ADVERT_TTL = 11000;
  const INPUT_RATE = 1 / 30;
  const SNAPSHOT_RATE = 1 / 16;
  const uiOnline = {
    screen: $('channelScreen'), close: $('closeChannelButton'), browser: $('channelBrowser'),
    createForm: $('createRoomForm'), findForm: $('findRoomForm'), lobby: $('roomLobby'),
    publicList: $('publicRoomList'), status: $('networkStatusText'), statusDot: $('networkStatusDot'),
    createButton: $('createRoomButton'), findButton: $('findRoomButton'), refresh: $('refreshRoomsButton'),
    newCode: $('newRoomCode'), capacity: $('roomCapacity'), course: $('roomCourse'), codeInput: $('roomCodeInput'),
    createMapLabel: $('createMapLabel'), copyCode: $('copyRoomCodeButton'),
    visibility: $('roomVisibilityLabel'), lobbyMap: $('lobbyMapName'), players: $('lobbyPlayers'),
    hint: $('lobbyHint'), hostStart: $('hostStartButton'), leave: $('leaveRoomButton')
  };
  const uiCustom = {
    screen: $('customMapsScreen'), close: $('closeCustomMapsButton'), locked: $('customLocked'),
    unlocked: $('customUnlocked'), progress: $('customClearProgress'), unlockLabel: $('customUnlockLabel'),
    menuButton: $('customMapsButton'), showCreator: $('showCustomCreatorButton'), form: $('customMapForm'),
    cancelCreator: $('cancelCustomCreatorButton'), name: $('customMapName'), difficulty: $('customMapDifficulty'),
    list: $('customMapList'), editor: $('customMapEditor'), editorTools: $('customEditorTools'),
    editorStatus: $('customEditorStatus'), undo: $('undoCustomEditButton'), clear: $('clearCustomEditButton')
  };
  const uiReview = {
    form: $('customReviewForm'), name: $('customReviewMapName'), stars: $('customReviewStars'),
    submit: $('submitCustomReviewButton'), thanks: $('customReviewThanks')
  };
  const uiValidation = {
    actions: $('customValidationActions'), edit: $('editCustomMapButton'), publish: $('publishCustomMapButton')
  };

  let trystero = null;
  let lobbyRoom = null;
  let lobbyActions = null;
  let gameRoom = null;
  let actions = null;
  let role = 'offline';
  let phase = 'idle';
  let selfId = '';
  let hostId = '';
  let roomCode = '';
  let capacity = 4;
  let isPublic = true;
  let roomSettings = null;
  let pendingMap = null;
  let assignedSlot = 0;
  let roster = [];
  let peerSlots = new Map();
  let remoteInputs = new Map();
  let adverts = new Map();
  let inputClock = 0;
  let snapshotClock = 0;
  let announceClock = 0;
  let lastSnapshotSeq = 0;
  let sequence = 0;
  let localProbe = { id: 0, previousInput: {} };
  let browserRefreshTimer = 0;
  let connectingTimer = 0;
  let validationDraft = null;
  let validationProof = null;
  let validationRegistered = null;
  let activeReviewMap = null;
  let activeReviewRating = 0;
  let communityMaps = [];
  let communityLoading = false;
  const MIGRATED_MAPS_KEY = 'slip-out-community-migrated-v1';

  function communityClientId() {
    const key = 'slip-out-community-client-v1';
    try {
      let value = localStorage.getItem(key);
      if (!value) { value = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(key, value); }
      return value;
    } catch { return `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
  }

  async function communityRequest(body = null) {
    const response = await fetch('/api/maps', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '공유 맵 서버 요청에 실패했습니다.');
    return data;
  }

  function migratedMapCodes() {
    try { return new Set(JSON.parse(localStorage.getItem(MIGRATED_MAPS_KEY) || '[]')); }
    catch { return new Set(); }
  }

  function rememberMigratedMap(code) {
    try {
      const codes = migratedMapCodes();
      codes.add(code);
      localStorage.setItem(MIGRATED_MAPS_KEY, JSON.stringify([...codes].slice(-100)));
    } catch {}
  }

  const cleanCode = value => String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
  const mapLabel = settings => settings?.mapType === 'custom'
    ? `CUSTOM · ${settings.customName || settings.customCode}`
    : `${String((settings?.mapIndex ?? selectedMap) + 1).padStart(2, '0')} · ${COURSE_PRESETS[settings?.mapIndex ?? selectedMap].name}`;

  function randomCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return [...bytes].map(value => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
  }

  function setNetworkStatus(text, kind = '') {
    uiOnline.status.textContent = text;
    const wrapper = uiOnline.status.parentElement;
    wrapper.classList.toggle('is-online', kind === 'online');
    wrapper.classList.toggle('is-error', kind === 'error');
  }

  async function ensureLibrary() {
    if (trystero) return trystero;
    setNetworkStatus('P2P 온라인 모듈을 불러오는 중…');
    try {
      trystero = window.TrysteroP2P;
      if (!trystero?.joinRoom || !trystero?.selfId) throw new Error('Trystero bundle unavailable');
      selfId = trystero.selfId;
      setNetworkStatus('온라인 연결 준비 완료', 'online');
      return trystero;
    } catch (error) {
      console.error('Trystero load failed', error);
      setNetworkStatus('온라인 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도하세요.', 'error');
      throw error;
    }
  }

  function showChannelView(view) {
    [uiOnline.browser, uiOnline.createForm, uiOnline.findForm, uiOnline.lobby].forEach(item => item.classList.toggle('is-hidden', item !== view));
  }

  function currentSettings(map = pendingMap, mapIndex = selectedMap) {
    if (map) {
      return {
        mode: selectedMode, mapType: 'custom', mapIndex: clamp(map.difficulty - 1, 0, 4),
        customCode: CustomMapStore.serialize(map), customName: map.name, customMap: map
      };
    }
    return { mode: selectedMode, mapType: 'preset', mapIndex: clamp(Number(mapIndex) || 0, 0, 4) };
  }

  function applySettings(settings) {
    selectedMode = settings.mode === 'extreme' ? 'extreme' : 'normal';
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('selected', button.dataset.mode === selectedMode));
    if (settings.mapType === 'custom') {
      const decoded = CustomMapStore.validateMap(settings.customMap) ? settings.customMap : CustomMapStore.deserialize(settings.customCode);
      if (!decoded) throw new Error('커스텀 맵 코드를 해석할 수 없습니다.');
      decoded.name = settings.customName || decoded.name;
      configureCustomCourse(decoded);
    } else {
      configureCourse(clamp(Number(settings.mapIndex) || 0, 0, 4));
      document.querySelectorAll('[data-map]').forEach(button => button.classList.toggle('selected', Number(button.dataset.map) === selectedMap));
    }
    resetDynamics();
  }

  async function openLobbyConnection() {
    await ensureLibrary();
    if (lobbyRoom) return;
    lobbyRoom = trystero.joinRoom(APP_CONFIG, LOBBY_ID, {
      onJoinError: ({ error }) => setNetworkStatus(`공개방 로비 연결 실패: ${error?.message || '연결 오류'}`, 'error')
    });
    const announce = lobbyRoom.makeAction('announce');
    const query = lobbyRoom.makeAction('query');
    lobbyActions = { announce, query };
    announce.onMessage = (info) => {
      if (!info || cleanCode(info.code).length !== 4 || info.public !== true) return;
      adverts.set(info.code, { ...info, expiresAt: Date.now() + ADVERT_TTL });
      renderPublicRooms();
    };
    query.onMessage = (_, { peerId }) => {
      if (role === 'host' && isPublic && gameRoom) sendAdvert(peerId);
    };
    lobbyRoom.onPeerJoin = peerId => {
      if (role === 'host' && isPublic && gameRoom) sendAdvert(peerId);
      else query.send({ at: Date.now() }, { target: peerId });
    };
    query.send({ at: Date.now() });
    setNetworkStatus('공개 채널 로비 연결됨', 'online');
  }

  function closeLobbyConnection() {
    if (lobbyRoom) lobbyRoom.leave();
    lobbyRoom = null;
    lobbyActions = null;
    if (role !== 'host') adverts.clear();
  }

  function sendAdvert(target = null) {
    if (!lobbyActions || !isPublic || role !== 'host') return;
    const info = {
      code: roomCode, public: true, max: capacity, players: roster.length,
      map: mapLabel(roomSettings), mode: roomSettings.mode, updatedAt: Date.now()
    };
    lobbyActions.announce.send(info, target ? { target } : undefined);
  }

  function renderPublicRooms() {
    const now = Date.now();
    for (const [code, info] of adverts) if (info.expiresAt <= now) adverts.delete(code);
    const list = [...adverts.values()].filter(info => info.players < info.max).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!list.length) {
      uiOnline.publicList.innerHTML = '<p class="empty-room-list">열려 있는 공개방이 없습니다.<br>새 방을 만들거나 4자리 코드로 찾아보세요.</p>';
      return;
    }
    uiOnline.publicList.innerHTML = list.map(info => `
      <button class="room-row" type="button" data-join-room="${info.code}">
        <span class="room-code">${info.code}</span>
        <span><b>${escapeHtml(info.map || 'SLIP OUT')}</b><small>${info.mode === 'extreme' ? 'EXTREME' : 'NORMAL'} · PUBLIC</small></span>
        <em>${info.players} / ${info.max}</em>
      </button>`).join('');
    uiOnline.publicList.querySelectorAll('[data-join-room]').forEach(button => button.addEventListener('click', () => joinRoom(button.dataset.joinRoom)));
  }

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value);
    return element.innerHTML;
  }

  async function openChannel(map = null) {
    if (state !== 'menu' && state !== 'channel' && state !== 'custom') return;
    pendingMap = map;
    state = 'channel';
    uiCustom.screen.classList.remove('is-visible');
    uiOnline.screen.classList.add('is-visible');
    showChannelView(uiOnline.browser);
    uiOnline.createMapLabel.textContent = mapLabel(currentSettings());
    try { await openLobbyConnection(); } catch { renderPublicRooms(); }
    clearInterval(browserRefreshTimer);
    browserRefreshTimer = setInterval(renderPublicRooms, 1500);
  }

  function closeChannel() {
    if (gameRoom) leaveRoom(false);
    closeLobbyConnection();
    clearInterval(browserRefreshTimer);
    clearTimeout(connectingTimer);
    uiOnline.screen.classList.remove('is-visible');
    if (state === 'channel') state = 'menu';
    pendingMap = null;
  }

  function openCreateForm(map = pendingMap) {
    pendingMap = map;
    roomCode = randomCode();
    uiOnline.newCode.textContent = roomCode;
    uiOnline.course.disabled = !!map;
    uiOnline.course.value = String(map ? clamp(map.difficulty - 1, 0, 4) : selectedMap);
    uiOnline.createMapLabel.textContent = mapLabel(currentSettings(map, uiOnline.course.value));
    showChannelView(uiOnline.createForm);
  }

  function renderLobby() {
    uiOnline.copyCode.textContent = roomCode || '----';
    uiOnline.visibility.textContent = isPublic ? 'PUBLIC' : 'PRIVATE';
    uiOnline.lobbyMap.textContent = mapLabel(roomSettings);
    uiOnline.players.innerHTML = Array.from({ length: capacity }, (_, slot) => {
      const member = roster.find(item => item.slot === slot);
      const label = member ? (slot === 0 ? 'HOST' : `P${slot + 1}`) : 'WAITING';
      return `<div class="lobby-player${member ? ' is-filled' : ''}" style="--player-color:${PLAYER_COLORS[slot]}"><i></i><b>${label}</b></div>`;
    }).join('');
    uiOnline.hostStart.classList.toggle('is-hidden', role !== 'host');
    uiOnline.hostStart.disabled = role !== 'host' || roster.length < 2;
    uiOnline.hint.textContent = role === 'host'
      ? (roster.length < 2 ? '최소 2명이 모이면 시작할 수 있습니다.' : `${roster.length}명 연결됨 · 방장이 시작할 수 있습니다.`)
      : '방장이 게임을 시작하기를 기다리는 중입니다.';
  }

  function broadcastRoster() {
    if (role !== 'host' || !actions) return;
    actions.control.send({ type: 'roster', roster, capacity });
    renderLobby();
    sendAdvert();
  }

  function compactLobbySlots() {
    if (role !== 'host' || phase === 'playing') return;
    const peers = roster.filter(member => member.slot !== 0).sort((a, b) => a.slot - b.slot);
    peerSlots.clear();
    roster = [{ peerId: selfId, slot: 0 }, ...peers.map((member, index) => ({ peerId: member.peerId, slot: index + 1 }))];
    for (const member of roster.slice(1)) {
      peerSlots.set(member.peerId, member.slot);
      actions?.control.send({
        type: 'welcome', hostId: selfId, slot: member.slot, settings: roomSettings,
        capacity, public: isPublic, roster
      }, { target: member.peerId });
    }
  }

  function acceptPeer(peerId) {
    if (role !== 'host' || peerSlots.has(peerId)) return;
    const used = new Set(roster.map(item => item.slot));
    const slot = Array.from({ length: capacity - 1 }, (_, index) => index + 1).find(index => !used.has(index));
    if (slot == null || phase === 'playing') {
      actions.control.send({ type: 'reject', reason: phase === 'playing' ? '이미 게임이 진행 중입니다.' : '방이 가득 찼습니다.' }, { target: peerId });
      return;
    }
    peerSlots.set(peerId, slot);
    roster.push({ peerId, slot });
    actions.control.send({ type: 'welcome', hostId: selfId, slot, settings: roomSettings, capacity, public: isPublic, roster }, { target: peerId });
    broadcastRoster();
  }

  function bindGameRoomHandlers() {
    actions = {
      control: gameRoom.makeAction('control'),
      input: gameRoom.makeAction('input'),
      snapshot: gameRoom.makeAction('snapshot')
    };
    gameRoom.onPeerJoin = peerId => {
      if (role === 'host') acceptPeer(peerId);
      else actions.control.send({ type: 'hello' }, { target: peerId });
    };
    gameRoom.onPeerLeave = peerId => {
      if (role === 'host') {
        const slot = peerSlots.get(peerId);
        peerSlots.delete(peerId);
        remoteInputs.delete(slot);
        roster = roster.filter(item => item.peerId !== peerId);
        if (phase === 'playing' && slot != null) {
          removePlayerFromRun(slot);
          actions?.control.send({ type: 'playerLeft', slot });
          showToast(`P${slot + 1}님이 게임에서 나갔습니다.`, 3);
        } else compactLobbySlots();
        broadcastRoster();
      } else if (peerId === hostId) {
        leaveRoom(false);
        returnToMenu();
        showToast('방장 연결이 종료되어 채널에서 나왔습니다.');
      }
    };
    actions.control.onMessage = (message, { peerId }) => handleControl(message, peerId);
    actions.input.onMessage = (input, { peerId }) => {
      if (role !== 'host') return;
      const slot = peerSlots.get(peerId);
      if (slot == null || !input) return;
      remoteInputs.set(slot, sanitizeInput(input));
    };
    actions.snapshot.onMessage = (snapshot, { peerId }) => {
      if (role !== 'guest' || peerId !== hostId || !snapshot || snapshot.seq <= lastSnapshotSeq) return;
      lastSnapshotSeq = snapshot.seq;
      applySnapshot(snapshot);
    };
  }

  async function hostRoom(options) {
    await ensureLibrary();
    leaveRoom(false);
    role = 'host';
    phase = 'lobby';
    roomCode = cleanCode(options.code) || randomCode();
    capacity = clamp(Number(options.capacity) || 4, 2, 4);
    isPublic = options.public !== false;
    roomSettings = options.settings || currentSettings(options.map || pendingMap);
    assignedSlot = 0;
    hostId = selfId;
    roster = [{ peerId: selfId, slot: 0 }];
    peerSlots = new Map();
    remoteInputs = new Map();
    gameRoom = trystero.joinRoom(APP_CONFIG, ROOM_PREFIX + roomCode, {
      onJoinError: ({ error }) => setNetworkStatus(`방 연결 실패: ${error?.message || '연결 오류'}`, 'error')
    });
    bindGameRoomHandlers();
    if (isPublic) await openLobbyConnection(); else closeLobbyConnection();
    setNetworkStatus('방이 열렸습니다 · P2P 연결 대기 중', 'online');
    showChannelView(uiOnline.lobby);
    renderLobby();
    sendAdvert();
  }

  async function joinRoom(code) {
    const normalized = cleanCode(code);
    if (normalized.length !== 4) { showToast('4자리 방 코드를 입력하세요.'); return; }
    try {
      await ensureLibrary();
      leaveRoom(false);
      closeLobbyConnection();
      role = 'guest';
      phase = 'lobby';
      roomCode = normalized;
      assignedSlot = 0;
      roster = [];
      hostId = '';
      gameRoom = trystero.joinRoom(APP_CONFIG, ROOM_PREFIX + roomCode, {
        onJoinError: ({ error }) => {
          setNetworkStatus(`방 입장 실패: ${error?.message || '연결 오류'}`, 'error');
          showToast('방에 연결하지 못했습니다. 코드와 네트워크를 확인하세요.');
        }
      });
      bindGameRoomHandlers();
      showChannelView(uiOnline.lobby);
      uiOnline.copyCode.textContent = roomCode;
      uiOnline.visibility.textContent = 'CONNECTING';
      uiOnline.lobbyMap.textContent = '채널 정보를 받는 중…';
      uiOnline.players.innerHTML = '';
      uiOnline.hostStart.classList.add('is-hidden');
      uiOnline.hint.textContent = '방장을 찾고 있습니다…';
      setNetworkStatus(`${roomCode} 채널에 연결 중…`);
      connectingTimer = setTimeout(() => {
        if (role === 'guest' && !hostId) {
          setNetworkStatus('방장을 찾지 못했습니다. 코드가 맞는지 확인하세요.', 'error');
          uiOnline.hint.textContent = '방이 없거나 방장이 오프라인입니다. 나간 뒤 다시 시도하세요.';
        }
      }, 9000);
    } catch { /* status already shown */ }
  }

  function handleControl(message, peerId) {
    if (!message || typeof message.type !== 'string') return;
    if (role === 'host') {
      if (message.type === 'hello') acceptPeer(peerId);
      else if (message.type === 'reviveChoice') {
        const slot = peerSlots.get(peerId);
        const player = players[slot];
        if (!player?.downed || !player.awaitingReviveChoice) return;
        const rescuer = players.find(candidate => candidate.id === player.reviveRescuerId);
        revivePlayer(player, rescuer, message.choice === 'checkpoint' ? 'checkpoint' : 'core');
      } else if (message.type === 'customReview' && selectedCustomMap?.verified) {
        const slot = peerSlots.get(peerId);
        const expectedCode = CustomMapStore.serialize(selectedCustomMap);
        if (slot == null || message.mapCode !== expectedCode) return;
        try {
          CustomMapStore.addReview(selectedCustomMap, {
            rating: Number(message.rating), text: String(message.text || ''),
            runId: `${peerId}:${String(message.runId || '').slice(0, 60)}`
          });
          refreshCustomUi();
          showToast(`P${slot + 1}의 커스텀 맵 평가가 도착했습니다.`, 2.5);
        } catch { /* malformed peer reviews are ignored */ }
      }
      return;
    }
    if (message.type === 'welcome') {
      clearTimeout(connectingTimer);
      hostId = message.hostId || peerId;
      assignedSlot = message.slot;
      capacity = message.capacity;
      isPublic = message.public;
      roomSettings = message.settings;
      roster = message.roster || [];
      setNetworkStatus(`${roomCode} 채널 연결됨 · P${assignedSlot + 1}`, 'online');
      renderLobby();
    } else if (message.type === 'roster' && peerId === hostId) {
      roster = message.roster || roster;
      capacity = message.capacity || capacity;
      renderLobby();
    } else if (message.type === 'playerLeft' && peerId === hostId) {
      const slot = clamp(Number(message.slot) || 0, 0, 3);
      removePlayerFromRun(slot);
      showToast(`P${slot + 1}님이 게임에서 나갔습니다.`, 3);
    } else if (message.type === 'start' && peerId === hostId) {
      startGuestRun(message.settings, message.playerCount);
    } else if (message.type === 'result' && peerId === hostId) {
      if (message.snapshot) applySnapshot(message.snapshot, true);
      if (state !== 'results') { state = 'playing'; finishRun(true); }
    } else if (message.type === 'reject') {
      showToast(message.reason || '방에 입장할 수 없습니다.');
      leaveRoom(false);
      showChannelView(uiOnline.browser);
      openLobbyConnection().catch(() => {});
    }
  }

  function startHostRun() {
    if (role !== 'host' || roster.length < 2) return;
    phase = 'playing';
    selectedPlayers = roster.length;
    applySettings(roomSettings);
    actions.control.send({ type: 'start', settings: roomSettings, playerCount: selectedPlayers });
    startGame();
    uiOnline.screen.classList.remove('is-visible');
    setNetworkStatus('온라인 런 진행 중', 'online');
  }

  function startGuestRun(settings, playerCount) {
    phase = 'playing';
    selectedPlayers = clamp(Number(playerCount) || roster.length || 2, 2, 4);
    applySettings(settings);
    startGame();
    uiOnline.screen.classList.remove('is-visible');
    lastSnapshotSeq = 0;
    localProbe.previousInput = {};
    showToast(`P${assignedSlot + 1}로 온라인 런에 참가했습니다.`);
  }

  function sanitizeInput(input) {
    let x = clamp(Number(input.x) || 0, -1, 1), y = clamp(Number(input.y) || 0, -1, 1);
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    return { x, y, jump: !!input.jump, boost: !!input.boost, brake: !!input.brake, reviveChoice: input.reviveChoice || null };
  }

  function getRemoteInput(slot) {
    return role === 'host' && phase === 'playing' && slot > 0
      ? (remoteInputs.get(slot) || { x: 0, y: 0, jump: false, boost: false, brake: false })
      : null;
  }

  function sendReviveChoice(code) {
    if (role !== 'guest' || phase !== 'playing' || !hostId || !actions) return false;
    const player = players[assignedSlot];
    if (!player?.downed || !player.awaitingReviveChoice) return false;
    actions.control.send({ type: 'reviveChoice', choice: code === 'KeyI' ? 'checkpoint' : 'core' }, { target: hostId });
    player.awaitingReviveChoice = false;
    player.reviveChoiceRemaining = 0;
    showToast(code === 'KeyI' ? '최신 체크포인트 부활을 선택했습니다.' : '쓰러진 위치 부활을 선택했습니다.');
    return true;
  }

  function captureSnapshot() {
    return {
      seq: ++sequence, worldTime, runTime, deaths, rescues, checkpointIndex, startCountdown,
      exitActive, exitTimer, wipeTimer, escapeOrder: [...escapeOrder], state,
      players: players.map(player => ({
        id: player.id, color: player.color, x: player.x, y: player.y, vx: player.vx, vy: player.vy,
        r: player.r, z: player.z, vz: player.vz, hp: player.hp, invulnerable: player.invulnerable,
        brakeCharges: player.brakeCharges, brakeRegen: player.brakeRegen, brakeTimer: player.brakeTimer,
        jumpCooldown: player.jumpCooldown, jumpCooldownMax: player.jumpCooldownMax,
        boostCooldown: player.boostCooldown, boostCooldownMax: player.boostCooldownMax,
        padCooldown: player.padCooldown, downed: player.downed, escaped: player.escaped, disconnected: !!player.disconnected,
        finishPlace: player.finishPlace, finishTime: player.finishTime, coreX: player.coreX, coreY: player.coreY,
        lastGroundX: player.lastGroundX, lastGroundY: player.lastGroundY, exitHold: player.exitHold,
        zone: player.zone, awaitingReviveChoice: player.awaitingReviveChoice,
        reviveRescuerId: player.reviveRescuerId, reviveChoice: player.reviveChoice, reviveChoiceRemaining: player.reviveChoiceRemaining,
        deathCount: player.deathCount
      })),
      enemies: enemies.map(enemy => ({ x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy })),
      projectiles: projectiles.map(shot => ({ x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, r: shot.r, life: shot.life })),
      rotors: rotors.map(item => item.angle),
      movers: movers.map(item => [item.x, item.y]),
      gates: gates.map(item => [!!item.open, !!item.warning]),
      lasers: lasers.map(item => [!!item.active, !!item.warning]),
      collapse: collapseTiles.map(item => [item.state, item.timer])
    };
  }

  function applySnapshot(snapshot, immediate = false) {
    worldTime = Number(snapshot.worldTime) || 0;
    runTime = Number(snapshot.runTime) || 0;
    deaths = Number(snapshot.deaths) || 0;
    rescues = Number(snapshot.rescues) || 0;
    checkpointIndex = Number(snapshot.checkpointIndex) || 0;
    startCountdown = Number(snapshot.startCountdown) || 0;
    exitActive = !!snapshot.exitActive;
    exitTimer = Number(snapshot.exitTimer) || 0;
    wipeTimer = Number(snapshot.wipeTimer) || 0;
    escapeOrder = Array.isArray(snapshot.escapeOrder) ? [...snapshot.escapeOrder] : [];
    if (Array.isArray(snapshot.players)) {
      snapshot.players.forEach((incoming, index) => {
        if (!players[index]) players[index] = createPlayer(index, checkpoints[0]);
        const player = players[index];
        const oldX = player.x, oldY = player.y;
        const wasAwaitingRevive = player.awaitingReviveChoice;
        const wasDisconnected = !!player.disconnected;
        Object.assign(player, incoming);
        if (!wasDisconnected && player.disconnected) buildPlayerHud();
        if (!wasAwaitingRevive && player.awaitingReviveChoice) {
          showToast(`P${player.id + 1} 코어 접촉 완료 · 부활 위치 선택 대기`, 2.2);
          sound.tone(440, .12, 'sine', .018, 880);
        }
        if (!immediate && Number.isFinite(oldX)) {
          player.x = lerp(oldX, incoming.x, .76);
          player.y = lerp(oldY, incoming.y, .76);
        }
        if (!player.trail) player.trail = [];
        player.trail.unshift({ x: player.x, y: player.y, life: .22 });
        player.trail = player.trail.slice(0, 8);
      });
    }
    if (Array.isArray(snapshot.enemies)) snapshot.enemies.forEach((incoming, index) => enemies[index] && Object.assign(enemies[index], incoming));
    if (Array.isArray(snapshot.projectiles)) projectiles = snapshot.projectiles.map(item => ({ ...item }));
    if (Array.isArray(snapshot.rotors)) snapshot.rotors.forEach((angle, index) => { if (rotors[index]) rotors[index].angle = angle; });
    if (Array.isArray(snapshot.movers)) snapshot.movers.forEach((position, index) => { if (movers[index]) [movers[index].x, movers[index].y] = position; });
    if (Array.isArray(snapshot.gates)) snapshot.gates.forEach((value, index) => { if (gates[index]) [gates[index].open, gates[index].warning] = value; });
    if (Array.isArray(snapshot.lasers)) snapshot.lasers.forEach((value, index) => { if (lasers[index]) [lasers[index].active, lasers[index].warning] = value; });
    if (Array.isArray(snapshot.collapse)) snapshot.collapse.forEach((value, index) => { if (collapseTiles[index]) [collapseTiles[index].state, collapseTiles[index].timer] = value; });
  }

  function tick(dt) {
    if (role === 'host' && isPublic && phase === 'lobby') {
      announceClock += dt;
      if (announceClock >= 3) { announceClock = 0; sendAdvert(); }
    }
    if (phase !== 'playing' || !actions) return;
    if (role === 'guest') {
      inputClock += dt;
      if (inputClock >= INPUT_RATE && hostId) {
        inputClock %= INPUT_RATE;
        const input = readInput(localProbe);
        actions.input.send(sanitizeInput(input), { target: hostId });
      }
      updateParticles(dt);
      updateCamera(dt);
      updateHud(dt);
      updateReviveChoiceUi();
    } else if (role === 'host') {
      snapshotClock += dt;
      if (snapshotClock >= SNAPSHOT_RATE) {
        snapshotClock %= SNAPSHOT_RATE;
        actions.snapshot.send(captureSnapshot());
      }
    }
  }

  function onRunFinished(result) {
    const wasCreatorValidation = !!(validationDraft && selectedCustomMap?.id === validationDraft.id && role === 'offline');
    uiReview.form.classList.add('is-hidden');
    uiValidation.actions.classList.add('is-hidden');
    if (wasCreatorValidation) {
      if (result?.full) {
        validationProof = { fullClear: true, creatorTest: true, runId: activeRunId };
        validationRegistered = null;
        ui.resultEyebrow.textContent = 'CREATOR TEST CLEARED';
        ui.resultTitle.textContent = '테스트 클리어';
        ui.resultSummary.textContent = '아직 맵은 등록되지 않았습니다. 배치를 수정하거나 현재 상태로 공유 등록하세요.';
        ui.record.textContent = 'CHOOSE EDIT OR PUBLISH';
        uiValidation.actions.classList.remove('is-hidden');
        uiValidation.publish.disabled = false;
      } else {
        ui.resultEyebrow.textContent = 'TEST NOT CLEARED';
        ui.resultTitle.textContent = '아직 등록되지 않았습니다';
        ui.resultSummary.textContent = '맵은 임시 테스트 상태입니다. 다시 도전해 직접 클리어하면 등록됩니다.';
        ui.record.textContent = 'CREATOR CLEAR REQUIRED';
        uiValidation.actions.classList.remove('is-hidden');
        uiValidation.publish.disabled = true;
      }
    }
    if (!wasCreatorValidation && selectedCustomMap?.verified) prepareCustomReview(selectedCustomMap);
    if (role !== 'host' || !actions) return;
    phase = 'results';
    actions.control.send({ type: 'result', snapshot: captureSnapshot() });
  }

  function prepareCustomReview(map) {
    activeReviewMap = map;
    activeReviewRating = 0;
    uiReview.name.textContent = `${map.name}은(는) 어땠나요?`;
    uiReview.thanks.textContent = '';
    uiReview.submit.disabled = true;
    uiReview.stars.querySelectorAll('[data-review-rating]').forEach(button => { button.classList.remove('is-selected'); button.textContent = '☆'; });
    uiReview.form.classList.remove('is-hidden');
  }

  function selectReviewRating(rating) {
    activeReviewRating = clamp(Number(rating) || 0, 0, 5);
    uiReview.stars.querySelectorAll('[data-review-rating]').forEach(button => {
      button.classList.toggle('is-selected', Number(button.dataset.reviewRating) <= activeReviewRating);
      button.textContent = Number(button.dataset.reviewRating) <= activeReviewRating ? '★' : '☆';
    });
    uiReview.submit.disabled = activeReviewRating < 1;
  }

  function resumeCustomEditor() {
    if (!validationDraft) return;
    state = 'custom';
    ui.results.classList.remove('is-visible');
    ui.hud.classList.remove('is-visible');
    uiValidation.actions.classList.add('is-hidden');
    uiCustom.screen.classList.add('is-visible');
    uiCustom.unlocked.classList.remove('is-hidden');
    uiCustom.form.classList.remove('is-hidden');
    uiCustom.name.value = validationDraft.name;
    uiCustom.difficulty.value = String(validationDraft.difficulty);
    editorLayout = JSON.parse(JSON.stringify(validationDraft.layout));
    editorHistory = [];
    validationProof = null;
    validationRegistered = null;
    renderCustomEditor();
    updateMobileVisibility();
  }

  async function publishValidatedMap() {
    if (!validationDraft || !validationProof) return;
    uiValidation.publish.disabled = true;
    try {
      const registered = validationRegistered || CustomMapStore.registerVerified(validationDraft, validationProof);
      validationRegistered = registered;
      const code = CustomMapStore.serialize(registered);
      await communityRequest({ action: 'publish', code, map: registered });
      rememberMigratedMap(code);
      validationDraft = null; validationProof = null; validationRegistered = null;
      configureCustomCourse(registered);
      await loadCommunityMaps();
      ui.resultEyebrow.textContent = 'MAP PUBLISHED';
      ui.resultTitle.textContent = '공유 맵 등록 완료';
      ui.resultSummary.textContent = '모든 이용자가 이 맵을 목록에서 플레이하고 별점이나 신고를 남길 수 있습니다.';
      ui.record.textContent = `PUBLISHED · ${code}`;
      uiValidation.actions.classList.add('is-hidden');
      showToast('커스텀 맵이 공유 서버에 등록되었습니다.', 3);
    } catch (error) {
      uiValidation.publish.disabled = false;
      showToast(error.message, 3.5);
    }
  }

  function leaveRoom(resetState = true) {
    if (gameRoom) gameRoom.leave();
    gameRoom = null;
    actions = null;
    role = 'offline'; phase = 'idle'; hostId = ''; roomCode = '';
    roster = []; peerSlots.clear(); remoteInputs.clear();
    clearTimeout(connectingTimer);
    if (resetState && state !== 'menu') returnToMenu();
  }

  function restartOrWait() {
    if (role === 'host') { phase = 'lobby'; startHostRun(); }
    else if (role === 'guest') showToast('방장이 다음 런을 시작하기를 기다려 주세요.');
    else startGame();
  }

  function leaveToMenu() {
    leaveRoom(false);
    closeLobbyConnection();
    returnToMenu();
  }

  const editorColors = {
    checkpoint: '#54f5ff', pillar: '#98b8c6', bumper: '#ffb95a', rotor: '#ff5c8d',
    shockwave: '#c889ff', laser: '#ff4d78', gate: '#ff8458', boost: '#ffd85a', hole: '#172733', enemy: '#ff4d78',
    safe: '#65e6b7', ice: '#54f5ff', black: '#3d485c'
  };
  let editorTool = 'spawn';
  let editorLayout = { spawn: null, exit: null, floors: [], objects: [] };
  let editorHistory = [];

  const copyEditorLayout = () => JSON.parse(JSON.stringify(editorLayout));
  const snapEditor = value => Math.round(value / 100) * 100;

  function resetCustomEditor() {
    editorTool = 'spawn';
    editorLayout = { spawn: null, exit: null, floors: [], objects: [] };
    editorHistory = [];
    selectEditorTool('spawn');
    renderCustomEditor();
  }

  function selectEditorTool(tool) {
    editorTool = tool;
    uiCustom.editorTools.querySelectorAll('[data-editor-tool]').forEach(button => button.classList.toggle('selected', button.dataset.editorTool === tool));
  }

  function pushEditorHistory() {
    editorHistory.push(copyEditorLayout());
    if (editorHistory.length > 60) editorHistory.shift();
  }

  function editorPoint(event) {
    const rect = uiCustom.editor.getBoundingClientRect();
    const x = snapEditor(((event.clientX - rect.left) / rect.width) * WORLD.width);
    const y = snapEditor(((event.clientY - rect.top) / rect.height) * WORLD.height);
    const bounds = CustomMapStore.WORLD_BOUNDS;
    return { x: clamp(x, bounds.minX, bounds.maxX), y: clamp(y, bounds.minY, bounds.maxY) };
  }

  function eraseEditorPoint(position) {
    const candidates = [
      ...(editorLayout.spawn ? [{ kind: 'spawn', value: editorLayout.spawn }] : []),
      ...(editorLayout.exit ? [{ kind: 'exit', value: editorLayout.exit }] : []),
      ...editorLayout.floors.map((value, index) => ({ kind: 'floor', value: { x: value.x + value.w / 2, y: value.y + value.h / 2 }, index })),
      ...editorLayout.objects.map((value, index) => ({ kind: 'object', value, index }))
    ];
    const nearest = candidates.reduce((best, item) => {
      const distance = Math.hypot(item.value.x - position.x, item.value.y - position.y);
      return !best || distance < best.distance ? { ...item, distance } : best;
    }, null);
    if (!nearest || nearest.distance > (nearest.kind === 'floor' ? 460 : 230)) return false;
    if (nearest.kind === 'spawn') editorLayout.spawn = null;
    else if (nearest.kind === 'exit') editorLayout.exit = null;
    else if (nearest.kind === 'floor') editorLayout.floors.splice(nearest.index, 1);
    else editorLayout.objects.splice(nearest.index, 1);
    return true;
  }

  function placeEditorObject(position, erase = false) {
    pushEditorHistory();
    if (erase || editorTool === 'erase') {
      if (!eraseEditorPoint(position)) editorHistory.pop();
    } else if (editorTool === 'spawn') editorLayout.spawn = position;
    else if (editorTool === 'exit') editorLayout.exit = { ...position, r: 118 };
    else if (editorTool.startsWith('floor-')) {
      if (editorLayout.floors.length >= CustomMapStore.MAX_FLOORS) {
        editorHistory.pop(); showToast(`바닥 패치는 최대 ${CustomMapStore.MAX_FLOORS}개입니다.`);
      } else {
        editorLayout.floors.push({
          x: clamp(position.x - 400, 80, 7720), y: clamp(position.y - 200, 180, 1020),
          w: 800, h: 400, type: editorTool.slice(6), zone: 0
        });
      }
    }
    else if (editorLayout.objects.length < CustomMapStore.MAX_OBJECTS) editorLayout.objects.push({ type: editorTool, ...position });
    else { editorHistory.pop(); showToast(`배치 요소는 최대 ${CustomMapStore.MAX_OBJECTS}개입니다.`); }
    renderCustomEditor();
  }

  function drawEditorMarker(context, item) {
    const x = item.x / WORLD.width * uiCustom.editor.width;
    const y = item.y / WORLD.height * uiCustom.editor.height;
    const sx = uiCustom.editor.width / WORLD.width;
    context.save(); context.translate(x, y);
    if (item.type === 'spawn') {
      context.fillStyle = '#54f5ff'; context.shadowColor = '#54f5ff'; context.shadowBlur = 10;
      context.beginPath(); context.arc(0, 0, 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#dfffff'; context.font = '700 8px monospace'; context.fillText('START', 12, -7);
    } else if (item.type === 'exit') {
      context.strokeStyle = '#b4ff62'; context.shadowColor = '#b4ff62'; context.shadowBlur = 12; context.lineWidth = 3;
      context.beginPath(); context.arc(0, 0, Math.max(7, item.r * sx), 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#eaffda'; context.font = '700 8px monospace'; context.fillText('EXIT', 12, -7);
    } else if (item.type === 'checkpoint') {
      context.strokeStyle = editorColors.checkpoint; context.lineWidth = 2; context.rotate(Math.PI / 4); context.strokeRect(-6, -6, 12, 12);
    } else if (item.type === 'rotor') {
      context.strokeStyle = editorColors.rotor; context.lineWidth = 5; context.beginPath(); context.moveTo(-17, 0); context.lineTo(17, 0); context.stroke();
      context.fillStyle = '#fff'; context.beginPath(); context.arc(0, 0, 3, 0, Math.PI * 2); context.fill();
    } else if (item.type === 'laser' || item.type === 'gate') {
      context.strokeStyle = editorColors[item.type]; context.shadowColor = editorColors[item.type]; context.shadowBlur = 6; context.lineWidth = item.type === 'laser' ? 2 : 5;
      context.beginPath(); context.moveTo(0, -22); context.lineTo(0, 22); context.stroke();
    } else if (item.type === 'boost') {
      context.fillStyle = editorColors.boost; context.transform(1, 0, -.25, 1, 0, 0); context.fillRect(-11, -7, 22, 14);
      context.fillStyle = '#14202a'; context.beginPath(); context.moveTo(-5, -4); context.lineTo(7, 0); context.lineTo(-5, 4); context.fill();
    } else {
      const radius = item.type === 'hole' ? 10 : item.type === 'shockwave' ? 9 : 7;
      context.fillStyle = item.type === 'hole' ? '#01050a' : `${editorColors[item.type]}55`;
      context.strokeStyle = editorColors[item.type]; context.lineWidth = item.type === 'shockwave' ? 3 : 2;
      context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill(); context.stroke();
      if (item.type === 'shockwave') { context.beginPath(); context.arc(0, 0, 14, 0, Math.PI * 2); context.stroke(); }
    }
    context.restore();
  }

  function renderCustomEditor() {
    const context = uiCustom.editor.getContext('2d');
    const width = uiCustom.editor.width, height = uiCustom.editor.height;
    context.clearRect(0, 0, width, height);
    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#071521'); background.addColorStop(1, '#02070d');
    context.fillStyle = background; context.fillRect(0, 0, width, height);
    context.fillStyle = '#030811'; context.strokeStyle = 'rgba(84,245,255,.28)'; context.lineWidth = 2;
    context.beginPath(); context.roundRect(8, 36, width - 16, height - 72, 10); context.fill(); context.stroke();
    context.save(); context.beginPath(); context.roundRect(8, 36, width - 16, height - 72, 10); context.clip();
    for (const floor of editorLayout.floors) {
      const x = floor.x / WORLD.width * width, y = floor.y / WORLD.height * height;
      const w = floor.w / WORLD.width * width, h = floor.h / WORLD.height * height;
      context.fillStyle = `${editorColors[floor.type]}55`;
      context.strokeStyle = `${editorColors[floor.type]}bb`;
      context.lineWidth = 1.5; context.fillRect(x, y, w, h); context.strokeRect(x, y, w, h);
      context.fillStyle = editorColors[floor.type]; context.font = '700 7px monospace';
      context.fillText(floor.type.toUpperCase(), x + 4, y + 10);
    }
    context.strokeStyle = 'rgba(84,245,255,.08)'; context.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 500) { const px = x / WORLD.width * width; context.beginPath(); context.moveTo(px, 36); context.lineTo(px, height - 36); context.stroke(); }
    for (let y = 300; y <= 1300; y += 200) { const py = y / WORLD.height * height; context.beginPath(); context.moveTo(8, py); context.lineTo(width - 8, py); context.stroke(); }
    context.restore();
    if (editorLayout.spawn) drawEditorMarker(context, { type: 'spawn', ...editorLayout.spawn });
    if (editorLayout.exit) drawEditorMarker(context, { type: 'exit', ...editorLayout.exit });
    editorLayout.objects.forEach(item => drawEditorMarker(context, item));
    const validation = CustomMapStore.validateLayout(editorLayout);
    uiCustom.editorStatus.textContent = validation.message;
    uiCustom.editorStatus.classList.toggle('is-ready', validation.valid);
    uiCustom.editorStatus.classList.toggle('is-error', !validation.valid);
  }

  function openCustomCreator() {
    uiCustom.form.classList.remove('is-hidden');
    resetCustomEditor();
    setTimeout(() => uiCustom.name.focus(), 20);
  }

  function beginCustomValidation() {
    const draft = CustomMapStore.createDraft({ name: uiCustom.name.value, difficulty: Number(uiCustom.difficulty.value), layout: editorLayout });
    validationDraft = draft;
    validationProof = null;
    validationRegistered = null;
    selectedPlayers = 1;
    selectedMode = 'normal';
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('selected', button.dataset.mode === 'normal'));
    configureCustomCourse(draft);
    closeCustomMaps();
    startGame();
    showToast('제작자 테스트 시작 · 클리어 후 수정 또는 등록을 선택합니다.', 3.2);
  }

  function combinedCustomMaps() {
    const byCode = new Map();
    CustomMapStore.list().forEach(map => byCode.set(CustomMapStore.serialize(map), map));
    communityMaps.forEach(map => byCode.set(map.communityCode || CustomMapStore.serialize(map), map));
    return [...byCode.values()];
  }

  function findPlayableMap(value) {
    return communityMaps.find(map => map.communityCode === value || map.id === value)
      || CustomMapStore.get(value)
      || CustomMapStore.deserialize(value);
  }

  function renderCustomMapList() {
    const maps = combinedCustomMaps();
    uiCustom.unlockLabel.textContent = `${maps.length}개 공유됨`;
    uiCustom.list.innerHTML = maps.length ? maps.map(map => {
      const code = map.communityCode || CustomMapStore.serialize(map);
      const localRating = CustomMapStore.getRating(map);
      const rating = map.rating || localRating;
      const stars = rating.count ? `${'★'.repeat(Math.round(rating.average))}${'☆'.repeat(5 - Math.round(rating.average))}` : '☆☆☆☆☆';
      return `<article class="custom-map-item" data-custom-id="${code}">
        <div class="custom-map-info"><b>${escapeHtml(map.name)}</b><small>✓ SHARED · DIFFICULTY ${map.difficulty} · MAP ID ${code} · ${map.layout.objects.length} ELEMENTS · ${(map.layout.floors || []).length} FLOORS</small><div class="custom-map-rating"><strong>${stars}</strong><span>${rating.count ? `${Number(rating.average).toFixed(1)} · 별점 ${rating.count}개` : '아직 별점이 없습니다'}</span></div></div>
        <div class="custom-map-actions"><button type="button" data-custom-single="${code}">SINGLE PLAY</button><button type="button" data-custom-multi="${code}">MULTI PLAY</button><button class="report-custom" type="button" data-custom-report="${code}">신고</button></div>
      </article>`;
    }).join('') : `<p class="empty-room-list">${communityLoading ? '공유 맵을 불러오는 중입니다…' : '아직 등록된 공유 맵이 없습니다.<br>새 맵을 만들고 테스트한 뒤 등록하세요.'}</p>`;
    uiCustom.list.querySelectorAll('[data-custom-single]').forEach(button => button.addEventListener('click', () => playCustomSingle(button.dataset.customSingle)));
    uiCustom.list.querySelectorAll('[data-custom-multi]').forEach(button => button.addEventListener('click', () => playCustomMulti(button.dataset.customMulti)));
    uiCustom.list.querySelectorAll('[data-custom-report]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('이 맵을 운영자에게 신고할까요? 한 기기에서 한 번만 집계됩니다.')) return;
      button.disabled = true;
      try {
        const result = await communityRequest({ action: 'report', code: button.dataset.customReport, clientId: communityClientId() });
        showToast(result.counted ? '신고가 접수되었습니다.' : '이미 신고한 맵입니다.');
      } catch (error) { button.disabled = false; showToast(error.message); }
    }));
  }

  async function loadCommunityMaps() {
    if (communityLoading) return;
    communityLoading = true; renderCustomMapList();
    try {
      const data = await communityRequest();
      communityMaps = Array.isArray(data.maps) ? data.maps.filter(map => CustomMapStore.validateMap(map)) : [];
      const known = new Set(communityMaps.map(map => map.communityCode));
      const migrated = migratedMapCodes();
      const pending = CustomMapStore.list().filter(map => {
        const code = CustomMapStore.serialize(map);
        return !known.has(code) && !migrated.has(code) && map.layout.floors?.length;
      });
      if (pending.length) {
        await Promise.all(pending.map(async map => {
          const code = CustomMapStore.serialize(map);
          try { await communityRequest({ action: 'publish', code, map }); rememberMigratedMap(code); }
          catch {}
        }));
        const refreshed = await communityRequest();
        communityMaps = Array.isArray(refreshed.maps) ? refreshed.maps.filter(map => CustomMapStore.validateMap(map)) : communityMaps;
      }
    } catch (error) { showToast(`공유 맵 연결 실패 · ${error.message}`, 3); }
    finally { communityLoading = false; renderCustomMapList(); }
  }

  function refreshCustomUi(loadShared = false) {
    const progress = CustomMapStore.getUnlockProgress();
    uiCustom.locked.classList.toggle('is-hidden', progress.unlocked);
    uiCustom.unlocked.classList.toggle('is-hidden', !progress.unlocked);
    uiCustom.progress.textContent = `${Math.min(progress.fullClears, progress.requiredClears)} / ${progress.requiredClears} CLEAR`;
    uiCustom.unlockLabel.textContent = progress.unlocked ? `${combinedCustomMaps().length}개 공유됨` : `${progress.fullClears} / ${progress.requiredClears} 클리어`;
    uiCustom.menuButton.classList.toggle('is-locked', !progress.unlocked);
    uiCustom.menuButton.classList.toggle('is-unlocked', progress.unlocked);
    if (!progress.unlocked) return;
    renderCustomMapList();
    if (loadShared) loadCommunityMaps();
  }

  function openCustomMaps() {
    if (state !== 'menu') return;
    state = 'custom';
    refreshCustomUi(true);
    uiCustom.form.classList.add('is-hidden');
    uiCustom.screen.classList.add('is-visible');
  }

  function closeCustomMaps() {
    uiCustom.screen.classList.remove('is-visible');
    uiCustom.form.classList.add('is-hidden');
    if (state === 'custom') state = 'menu';
  }

  function playCustomSingle(id) {
    const map = findPlayableMap(id);
    if (!map) return;
    validationDraft = null;
    selectedPlayers = 1;
    configureCustomCourse(map);
    closeCustomMaps();
    startGame();
  }

  function playCustomMulti(id) {
    const map = findPlayableMap(id);
    if (!map) return;
    validationDraft = null;
    closeCustomMaps();
    openChannel(map).then(() => openCreateForm(map));
  }

  function recordClear(runId) {
    const result = CustomMapStore.recordFullClear(runId);
    refreshCustomUi();
    if (result.newlyUnlocked) showToast('CUSTOM LAB 해금! 이제 커스텀 맵을 만들 수 있습니다.');
    return result;
  }

  uiOnline.close.addEventListener('click', closeChannel);
  $('channelButton').addEventListener('click', () => openChannel());
  uiOnline.createButton.addEventListener('click', () => openCreateForm());
  uiOnline.findButton.addEventListener('click', () => { showChannelView(uiOnline.findForm); setTimeout(() => uiOnline.codeInput.focus(), 20); });
  uiOnline.refresh.addEventListener('click', () => { if (lobbyActions) lobbyActions.query.send({ at: Date.now() }); renderPublicRooms(); });
  document.querySelectorAll('[data-channel-back]').forEach(button => button.addEventListener('click', () => showChannelView(uiOnline.browser)));
  uiOnline.createForm.addEventListener('submit', event => {
    event.preventDefault();
    const visibility = document.querySelector('input[name="roomVisibility"]:checked')?.value || 'public';
    hostRoom({ code: roomCode, capacity: uiOnline.capacity.value, public: visibility === 'public', settings: currentSettings(pendingMap, uiOnline.course.value) }).catch(error => showToast(error.message));
  });
  uiOnline.course.addEventListener('change', () => {
    uiOnline.createMapLabel.textContent = mapLabel(currentSettings(pendingMap, uiOnline.course.value));
  });
  uiOnline.findForm.addEventListener('submit', event => { event.preventDefault(); joinRoom(uiOnline.codeInput.value); });
  uiOnline.codeInput.addEventListener('input', () => { uiOnline.codeInput.value = cleanCode(uiOnline.codeInput.value); });
  uiOnline.copyCode.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(roomCode); showToast(`${roomCode} 코드를 복사했습니다.`); }
    catch { showToast(`방 코드: ${roomCode}`); }
  });
  uiOnline.hostStart.addEventListener('click', startHostRun);
  uiOnline.leave.addEventListener('click', () => { leaveRoom(false); showChannelView(uiOnline.browser); openLobbyConnection().catch(() => {}); });
  uiCustom.menuButton.addEventListener('click', openCustomMaps);
  uiCustom.close.addEventListener('click', closeCustomMaps);
  uiCustom.showCreator.addEventListener('click', openCustomCreator);
  uiCustom.cancelCreator.addEventListener('click', () => uiCustom.form.classList.add('is-hidden'));
  uiCustom.editorTools.querySelectorAll('[data-editor-tool]').forEach(button => button.addEventListener('click', () => selectEditorTool(button.dataset.editorTool)));
  uiCustom.editor.addEventListener('pointerdown', event => {
    event.preventDefault();
    placeEditorObject(editorPoint(event), event.button === 2);
  });
  uiCustom.editor.addEventListener('contextmenu', event => event.preventDefault());
  uiCustom.undo.addEventListener('click', () => {
    const previous = editorHistory.pop();
    if (previous) { editorLayout = previous; renderCustomEditor(); }
  });
  uiCustom.clear.addEventListener('click', () => {
    if (!editorLayout.objects.some(item => item.type !== 'checkpoint')) return;
    pushEditorHistory();
    editorLayout.objects = editorLayout.objects.filter(item => item.type === 'checkpoint');
    renderCustomEditor();
  });
  uiCustom.form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      beginCustomValidation();
    } catch (error) { showToast(error.message); }
  });
  uiValidation.edit.addEventListener('click', resumeCustomEditor);
  uiValidation.publish.addEventListener('click', publishValidatedMap);
  uiReview.stars.querySelectorAll('[data-review-rating]').forEach(button => button.addEventListener('click', () => selectReviewRating(button.dataset.reviewRating)));
  uiReview.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeReviewMap || activeReviewRating < 1) return;
    try {
      const rating = CustomMapStore.addReview(activeReviewMap, { rating: activeReviewRating, runId: activeRunId });
      const code = CustomMapStore.serialize(activeReviewMap);
      await communityRequest({ action: 'rate', code, clientId: communityClientId(), rating: activeReviewRating });
      if (role === 'guest' && actions && hostId) {
        actions.control.send({
          type: 'customReview', mapCode: CustomMapStore.serialize(activeReviewMap), rating: activeReviewRating,
          runId: activeRunId
        }, { target: hostId });
      }
      uiReview.thanks.textContent = `별점이 저장되었습니다 · 내 기기 평균 ${rating.average.toFixed(1)}`;
      uiReview.submit.disabled = true;
      loadCommunityMaps();
    } catch (error) { showToast(error.message); }
  });
  addEventListener('keydown', event => {
    if (event.code !== 'Escape') return;
    if (state === 'channel') closeChannel();
    else if (state === 'custom') closeCustomMaps();
  });

  refreshCustomUi();
  resetCustomEditor();
  const api = {
    openChannel, openCreateForm, closeChannel, openCustomMaps, refreshCustomUi,
    tick, getRemoteInput, sendReviveChoice, onRunFinished, leaveRoom, leaveToMenu, restartOrWait, recordClear,
    isGuestPlaying: () => role === 'guest' && phase === 'playing',
    isHostPlaying: () => role === 'host' && phase === 'playing',
    isOnline: () => role !== 'offline',
    isOnlineRun: () => role !== 'offline',
    localSlot: () => assignedSlot,
    handleAgain: restartOrWait,
    handleMenu: leaveToMenu,
    recordFullClear: recordClear,
    debugState: () => ({ role, phase, roomCode, capacity, isPublic, assignedSlot, roster: [...roster], remoteInputs: [...remoteInputs], publicRooms: [...adverts.values()] }),
    debug: () => ({ role, phase, roomCode, capacity, isPublic, assignedSlot, roster: [...roster], remoteInputs: [...remoteInputs], publicRooms: [...adverts.values()] })
  };
  window.OnlineSession = api;
  return api;
})();

'use strict';

// SLIP OUT: input layer
const keys = new Set();
  const reviveChoiceHeldKeys = new Set();
  const mobileInput = { x: 0, y: 0, jump: false, boost: false, brake: false };
  let remapTarget = null;
  let keySettingsPlayer = 0;
  let settingsReturnState = 'menu';

  function keyLabel(code) {
    const labels = {
      Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Slash: '/',
      Numpad0: 'NUM 0', Numpad4: 'NUM 4', Numpad5: 'NUM 5', Numpad6: 'NUM 6',
      Numpad7: 'NUM 7', Numpad8: 'NUM 8', Numpad9: 'NUM 9'
    };
    return labels[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
  }

  function saveControlMaps() {
    try { localStorage.setItem('slip-out-controls-v1', JSON.stringify(controlMaps)); } catch { /* storage can be disabled */ }
  }

  function refreshControlLabels() {
    const p1 = controlMaps[0];
    $('guideMove').textContent = `${keyLabel(p1.up)} ${keyLabel(p1.left)} ${keyLabel(p1.down)} ${keyLabel(p1.right)}`;
    $('guideJump').textContent = keyLabel(p1.jump);
    $('guideBoost').textContent = keyLabel(p1.boost);
    $('guideBrake').textContent = keyLabel(p1.brake);
    $('hudMove').textContent = `${keyLabel(p1.up)}${keyLabel(p1.left)}${keyLabel(p1.down)}${keyLabel(p1.right)}`;
    $('hudJump').textContent = keyLabel(p1.jump);
    $('hudBoost').textContent = keyLabel(p1.boost);
    $('hudBrake').textContent = keyLabel(p1.brake);
  }

  function renderKeyBindings() {
    const map = controlMaps[keySettingsPlayer];
    document.querySelectorAll('[data-key-player]').forEach((button, index) => button.classList.toggle('selected', index === keySettingsPlayer));
    ui.keyBindings.innerHTML = CONTROL_ACTIONS.map(action => `
      <div class="binding-row">
        <span>${ACTION_LABELS[action]}</span>
        <button type="button" data-key-action="${action}" class="binding-button${remapTarget === action ? ' listening' : ''}">${remapTarget === action ? '키를 누르세요…' : keyLabel(map[action])}</button>
      </div>`).join('');
    ui.bindingHint.textContent = remapTarget ? `${ACTION_LABELS[remapTarget]}에 사용할 키를 누르세요. ESC로 취소합니다.` : `P${keySettingsPlayer + 1}의 항목을 누른 뒤 원하는 키를 입력하세요.`;
    ui.keyBindings.querySelectorAll('[data-key-action]').forEach(button => button.addEventListener('click', () => {
      remapTarget = button.dataset.keyAction;
      renderKeyBindings();
    }));
  }

  function assignControlKey(code) {
    if (!remapTarget) return;
    const map = controlMaps[keySettingsPlayer];
    const conflict = CONTROL_ACTIONS.find(action => action !== remapTarget && map[action] === code);
    if (conflict) map[conflict] = map[remapTarget];
    map[remapTarget] = code;
    remapTarget = null;
    saveControlMaps();
    refreshControlLabels();
    renderKeyBindings();
    sound.tone(620, .06, 'sine', .012, 760);
  }

  addEventListener('keydown', (event) => {
    if (remapTarget) {
      event.preventDefault();
      if (event.code === 'Escape') { remapTarget = null; renderKeyBindings(); }
      else assignControlKey(event.code);
      return;
    }
    if (reviveChoiceHeldKeys.has(event.code)) {
      event.preventDefault();
      keys.delete(event.code);
      return;
    }
    if (!event.repeat && consumeReviveChoiceKey(event.code)) {
      event.preventDefault();
      keys.delete(event.code);
      reviveChoiceHeldKeys.add(event.code);
      return;
    }
    if (isGameplayKey(event.code) && (state === 'playing' || state === 'paused')) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Escape' && (state === 'playing' || state === 'paused')) togglePause();
    else if (event.code === 'Escape' && state === 'settings') closeSettings();
    if (event.code === 'Enter' && state === 'menu') { selectedPlayers = 1; startGame(); }
    else if (event.code === 'Enter' && state === 'results') {
      if (window.OnlineSession?.isOnlineRun()) window.OnlineSession.handleAgain();
      else startGame();
    }
  });
  addEventListener('keyup', (event) => {
    keys.delete(event.code);
    reviveChoiceHeldKeys.delete(event.code);
  });
  addEventListener('blur', () => {
    keys.clear();
    reviveChoiceHeldKeys.clear();
  });

  function prepareReviveChoiceInput() {
    for (const code of ['KeyI', 'KeyO']) {
      if (keys.has(code)) reviveChoiceHeldKeys.add(code);
      keys.delete(code);
    }
  }

  function readInput(player) {
    const remote = window.OnlineSession?.getRemoteInput(player.id);
    const map = controlMaps[player.id] || controlMaps[0];
    let x = remote ? remote.x : (keys.has(map.right) ? 1 : 0) - (keys.has(map.left) ? 1 : 0);
    let y = remote ? remote.y : (keys.has(map.down) ? 1 : 0) - (keys.has(map.up) ? 1 : 0);
    let jump = remote ? remote.jump : keys.has(map.jump);
    let boost = remote ? remote.boost : keys.has(map.boost);
    let brake = remote ? remote.brake : keys.has(map.brake);
    if (!remote && player.id === 0) {
      if (Math.hypot(mobileInput.x, mobileInput.y) > Math.hypot(x, y)) { x = mobileInput.x; y = mobileInput.y; }
      jump ||= mobileInput.jump; boost ||= mobileInput.boost; brake ||= mobileInput.brake;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = remote ? null : pads[player.id];
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

  function openSettings() {
    if (state !== 'menu' && state !== 'paused') return;
    settingsReturnState = state;
    state = 'settings';
    remapTarget = null;
    ui.pause.classList.remove('is-visible');
    ui.settings.classList.add('is-visible');
    renderKeyBindings();
    updateMobileVisibility();
  }

  function closeSettings() {
    remapTarget = null;
    ui.settings.classList.remove('is-visible');
    state = settingsReturnState;
    if (state === 'paused') ui.pause.classList.add('is-visible');
    refreshControlLabels();
    updateMobileVisibility();
  }

  function updateMobileVisibility() {
    const visible = state === 'playing';
    ui.mobileControls.classList.toggle('is-visible', visible);
    ui.rotateHint.classList.toggle('is-visible', visible);
    if (!visible) {
      mobileInput.x = mobileInput.y = 0;
      mobileInput.jump = mobileInput.boost = mobileInput.brake = false;
      ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
      document.querySelectorAll('[data-mobile-action]').forEach(button => button.classList.remove('pressed'));
    }
  }

  function bindMobileControls() {
    let joystickPointer = null;
    const updateJoystick = (event) => {
      const rect = ui.joystick.getBoundingClientRect();
      const max = Math.max(32, Math.min(rect.width, rect.height) * .31);
      let dx = event.clientX - (rect.left + rect.width / 2);
      let dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > max) { dx *= max / distance; dy *= max / distance; }
      mobileInput.x = dx / max;
      mobileInput.y = dy / max;
      ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const releaseJoystick = (event) => {
      if (joystickPointer !== event.pointerId) return;
      joystickPointer = null;
      mobileInput.x = mobileInput.y = 0;
      ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
    };
    ui.joystick.addEventListener('pointerdown', event => {
      event.preventDefault();
      joystickPointer = event.pointerId;
      ui.joystick.setPointerCapture?.(event.pointerId);
      updateJoystick(event);
    });
    ui.joystick.addEventListener('pointermove', event => {
      if (joystickPointer === event.pointerId) updateJoystick(event);
    });
    ui.joystick.addEventListener('pointerup', releaseJoystick);
    ui.joystick.addEventListener('pointercancel', releaseJoystick);

    document.querySelectorAll('[data-mobile-action]').forEach(button => {
      const action = button.dataset.mobileAction;
      const release = event => {
        if (event.pointerId !== undefined && button.dataset.pointerId !== String(event.pointerId)) return;
        mobileInput[action] = false;
        button.classList.remove('pressed');
        delete button.dataset.pointerId;
      };
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.dataset.pointerId = String(event.pointerId);
        button.setPointerCapture?.(event.pointerId);
        mobileInput[action] = true;
        button.classList.add('pressed');
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', event => event.preventDefault());
    });
  }

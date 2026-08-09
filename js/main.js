'use strict';

// SLIP OUT: main layer
function loop(timestamp) {
    const dt = Math.min(.033, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    if (state === 'playing' && !OnlineSession.isGuestPlaying()) updateGame(dt);
    else if (state === 'menu') {
      worldTime += dt * .28;
      updateObstacles(dt * .28);
      updateParticles(dt);
    }
    OnlineSession.tick(dt);
    render();
    requestAnimationFrame(loop);
  }

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    selectedMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('selected', b === button));
    sound.tone(selectedMode === 'extreme' ? 140 : 520, .12, 'triangle', .018, selectedMode === 'extreme' ? 75 : 680);
  }));
  document.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
    configureCourse(Number(button.dataset.map));
    document.querySelectorAll('[data-map]').forEach(item => item.classList.toggle('selected', item === button));
    resetDynamics();
    camera.x = 950; camera.y = 800; camera.zoom = .82;
    sound.tone(360 + selectedMap * 85, .1, 'triangle', .018, 500 + selectedMap * 90);
  }));
  $('startButton').addEventListener('click', () => { selectedPlayers = 1; startGame(); });
  $('resumeButton').addEventListener('click', togglePause);
  $('restartButton').addEventListener('click', () => OnlineSession.isOnlineRun() ? showToast('온라인 런은 방장이 로비에서 다시 시작할 수 있습니다.') : startGame());
  $('menuButton').addEventListener('click', () => OnlineSession.isOnlineRun() ? OnlineSession.handleMenu() : returnToMenu());
  $('againButton').addEventListener('click', () => OnlineSession.isOnlineRun() ? OnlineSession.handleAgain() : startGame());
  $('resultMenuButton').addEventListener('click', () => OnlineSession.isOnlineRun() ? OnlineSession.handleMenu() : returnToMenu());
  $('settingsButton').addEventListener('click', openSettings);
  $('pauseSettingsButton').addEventListener('click', openSettings);
  $('closeSettingsButton').addEventListener('click', closeSettings);
  $('resetKeysButton').addEventListener('click', () => {
    controlMaps[keySettingsPlayer] = { ...DEFAULT_CONTROL_MAPS[keySettingsPlayer] };
    remapTarget = null;
    saveControlMaps();
    refreshControlLabels();
    renderKeyBindings();
    showToast(`P${keySettingsPlayer + 1} 키 설정을 초기화했습니다.`);
  });
  document.querySelectorAll('[data-key-player]').forEach((button, index) => button.addEventListener('click', () => {
    keySettingsPlayer = index;
    remapTarget = null;
    renderKeyBindings();
  }));
  ui.sound.addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    ui.sound.textContent = sound.enabled ? 'SOUND ON' : 'SOUND OFF';
    if (sound.enabled) sound.tone(600, .08, 'sine', .02, 800);
  });

  // Read-only diagnostics used by the included browser smoke test.
  Object.defineProperty(window, '__SLIP_OUT_DEBUG__', {
    value: {
      snapshot: () => ({
        state, selectedPlayers, selectedMode, selectedMap, courseName: currentCourse.name,
        runTime, checkpointIndex, exitActive, exitTimer,
        obstacleCounts: {
          floors: floors.length, holes: holes.length, pillars: pillars.length, rotors: rotors.length,
          movers: movers.length, gates: gates.length, launchers: launchers.length, collapse: collapseTiles.length,
          enemies: enemies.length, winds: winds.length, shockwaves: shockwaves.length, lasers: lasers.length, bumpers: bumpers.length
        },
        courseValidation: {
          checkpoints: checkpoints.map(point => !!surfaceAt(point.x, point.y)),
          exit: !!surfaceAt(exit.x, exit.y)
        },
        mobileInput: { ...mobileInput },
        escapeOrder: [...escapeOrder], controls: controlMaps.map(map => ({ ...map })),
        online: OnlineSession.debug(), customMaps: CustomMapStore.getStatus(),
        players: players.map(p => ({
          id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, hp: p.hp,
          jumpCooldown: p.jumpCooldown, jumpCooldownMax: p.jumpCooldownMax,
          boostCooldown: p.boostCooldown, boostCooldownMax: p.boostCooldownMax,
          downed: p.downed, escaped: p.escaped, finishPlace: p.finishPlace, finishTime: p.finishTime,
          deathCount: p.deathCount, awaitingReviveChoice: p.awaitingReviveChoice,
          reviveChoiceRemaining: p.reviveChoiceRemaining, reviveChoice: p.reviveChoice
        }))
      })
    },
    enumerable: false
  });

  refreshControlLabels();
  bindMobileControls();
  updateMobileVisibility();
  configureCourse(0);
  resetDynamics();
  requestAnimationFrame(loop);

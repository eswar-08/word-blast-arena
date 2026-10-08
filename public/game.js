// ==========================================
// WORD BLAST ARENA - CLIENT CONTROLLER
// Real-Time Multiplayer Engine & Web Audio Synth
// ==========================================

const AVATARS = ['🚀', '🐱', '🤖', '🍕', '🦊', '👾', '🦄', '⚡', '🤠', '🐼', '🎸', '👑', '🍩', '🐙', '🐉', '🥑'];
const RANDOM_NAMES = ['NeonFox', 'CosmicAce', 'TurboPanda', 'PixelKnight', 'BlazeRider', 'HyperNinja', 'QuantumCat', 'StarLord', 'CyberHawk', 'FlashPulse'];

// Application State
const state = {
  ws: null,
  playerId: null,
  roomCode: null,
  isHost: false,
  soundEnabled: true,
  audioCtx: null,
  currentAvatarIdx: 0,
  playerName: '',
  gameState: null,
  countdownInterval: null,
  lastTickSecond: null,
};

// ==========================================
// 1. WEB AUDIO API SYNTHESIZER
// 100% Client-side synthetic sound generation
// ==========================================
class SoundSynth {
  static getContext() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  static playTick(urgency = 1) {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freq = 600 + (urgency * 400); // 600Hz up to 1000Hz

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {}
  }

  static playSuccess() {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);

        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.25);
      });
    } catch (e) {}
  }

  static playError() {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (e) {}
  }

  static playExplosion() {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      // Noise burst + Sub-bass drop
      const bufferSize = ctx.sampleRate * 0.6;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      // Deep sub-bass boom
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.5);
      subGain.gain.setValueAtTime(0.4, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      sub.connect(subGain);
      subGain.connect(ctx.destination);

      noise.start();
      sub.start();
      noise.stop(ctx.currentTime + 0.6);
      sub.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  static playVictory() {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.15, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.45);
      });
    } catch (e) {}
  }
}

// ==========================================
// 2. DOM ELEMENTS CACHE
// ==========================================
const dom = {
  // Navigation & Badges
  roomBadge: document.getElementById('room-code-badge'),
  roomCodeText: document.getElementById('room-code-text'),
  btnSoundToggle: document.getElementById('btn-sound-toggle'),
  soundIcon: document.getElementById('sound-icon'),
  btnHowToPlay: document.getElementById('btn-how-to-play'),
  modalHowToPlay: document.getElementById('modal-how-to-play'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnModalGotIt: document.getElementById('btn-modal-got-it'),
  toastContainer: document.getElementById('toast-container'),

  // Screens
  screenWelcome: document.getElementById('screen-welcome'),
  screenLobby: document.getElementById('screen-lobby'),
  screenBomb: document.getElementById('screen-game-bomb'),
  screenMindMeld: document.getElementById('screen-game-mind-meld'),
  screenGameOver: document.getElementById('screen-game-over'),

  // Welcome Screen
  avatarDisplay: document.getElementById('avatar-display'),
  avatarPrev: document.getElementById('avatar-prev'),
  avatarNext: document.getElementById('avatar-next'),
  playerNameInput: document.getElementById('player-name-input'),
  btnRandomName: document.getElementById('btn-random-name'),
  tabJoin: document.getElementById('tab-join'),
  tabCreate: document.getElementById('tab-create'),
  panelJoin: document.getElementById('panel-join'),
  panelCreate: document.getElementById('panel-create'),
  joinRoomCodeInput: document.getElementById('join-room-code-input'),
  btnJoinRoom: document.getElementById('btn-join-room'),
  btnCreateRoom: document.getElementById('btn-create-room'),

  // Lobby Screen
  lobbyRoomCode: document.getElementById('lobby-room-code'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnToggleQr: document.getElementById('btn-toggle-qr'),
  qrContainer: document.getElementById('qr-container'),
  qrGraphic: document.getElementById('qr-code-graphic'),
  playerCount: document.getElementById('player-count'),
  lobbyPlayerList: document.getElementById('lobby-player-list'),
  hostBadgeIndicator: document.getElementById('host-badge-indicator'),
  hostSettingsPanel: document.getElementById('host-settings-panel'),
  btnStartGame: document.getElementById('btn-start-game'),
  nonHostWaitingMsg: document.getElementById('non-host-waiting-msg'),
  modeSelector: document.getElementById('mode-selector'),
  timerSelector: document.getElementById('timer-selector'),
  livesSelector: document.getElementById('lives-selector'),
  diffSelector: document.getElementById('diff-selector'),

  // Bomb Arena
  gamePlayersStrip: document.getElementById('game-players-strip'),
  turnAnnouncement: document.getElementById('turn-announcement-banner'),
  turnMessageText: document.getElementById('turn-message-text'),
  bombTimerSeconds: document.getElementById('bomb-timer-seconds'),
  timerCircle: document.getElementById('timer-circle'),
  bombCore: document.getElementById('bomb-core'),
  syllableTarget: document.getElementById('syllable-target'),
  syllableHelperText: document.getElementById('syllable-helper-text'),
  wordInputArea: document.getElementById('word-input-area'),
  gameWordInput: document.getElementById('game-word-input'),
  wordSubmitForm: document.getElementById('word-submit-form'),
  btnSubmitWord: document.getElementById('btn-submit-word'),
  wordFeedbackMsg: document.getElementById('word-feedback-msg'),
  waitingTurnBox: document.getElementById('waiting-turn-box'),
  hotSeatPlayerName: document.getElementById('hot-seat-player-name'),

  // Mind Meld
  mindMeldPromptText: document.getElementById('mind-meld-prompt-text'),
  mindMeldWordInput: document.getElementById('mind-meld-word-input'),
  btnSubmitMindMeld: document.getElementById('btn-submit-mind-meld'),
  mindMeldStatus: document.getElementById('mind-meld-status'),
  meldReadyRoster: document.getElementById('meld-ready-roster'),
  mindMeldResultsCard: document.getElementById('mind-meld-results-card'),
  meldMatchesContainer: document.getElementById('meld-matches-container'),
  btnNextMeldRound: document.getElementById('btn-next-meld-round'),
  btnMeldBackLobby: document.getElementById('btn-meld-back-lobby'),

  // Game Over
  winnerAvatarDisplay: document.getElementById('winner-avatar-display'),
  winnerNameDisplay: document.getElementById('winner-name-display'),
  winnerScoreDisplay: document.getElementById('winner-score-display'),
  finalLeaderboardList: document.getElementById('final-leaderboard-list'),
  btnPlayAgain: document.getElementById('btn-play-again'),

  // Floating Reactions
  floatingLayer: document.getElementById('floating-reactions-layer'),
};

// ==========================================
// 3. INITIALIZATION & SETUP
// ==========================================
function initApp() {
  // Random starting avatar & name
  state.currentAvatarIdx = Math.floor(Math.random() * AVATARS.length);
  dom.avatarDisplay.textContent = AVATARS[state.currentAvatarIdx];
  const storedName = localStorage.getItem('wb_player_name');
  state.playerName = storedName || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  dom.playerNameInput.value = state.playerName;

  // Sound preference
  const savedSound = localStorage.getItem('wb_sound');
  if (savedSound !== null) {
    state.soundEnabled = savedSound === 'true';
    dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  }

  // Parse room code from URL query (e.g. ?room=ABCD)
  const params = new URLSearchParams(window.location.search);
  const roomQuery = params.get('room');
  if (roomQuery) {
    dom.joinRoomCodeInput.value = roomQuery.toUpperCase().trim();
    showToast(`Joining Room ${roomQuery.toUpperCase()}! Tap Join Game.`);
  }

  bindEventListeners();
  connectWebSocket();
}

// ==========================================
// 4. WEBSOCKET REAL-TIME ENGINE
// ==========================================
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    console.log('⚡ Connected to game server');
    // Start keepalive ping
    setInterval(() => {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 15000);
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      console.error('Failed to parse WS msg:', e);
    }
  };

  state.ws.onclose = () => {
    console.warn('WebSocket closed. Reconnecting in 2s...');
    setTimeout(connectWebSocket, 2000);
  };

  state.ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

function sendAction(action, payload = {}) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ action, ...payload }));
  } else {
    showToast('⚠️ Connecting to server...', 2000);
  }
}

// ==========================================
// 5. SERVER MESSAGE ROUTER
// ==========================================
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'room_joined':
      state.roomCode = msg.room_code;
      state.playerId = msg.player_id;
      state.isHost = msg.is_host;
      dom.roomCodeText.textContent = state.roomCode;
      dom.lobbyRoomCode.textContent = state.roomCode;
      dom.roomBadge.classList.remove('hidden');
      switchScreen('lobby');
      renderQRCode();
      showToast(`Joined Room ${state.roomCode}!`);
      break;

    case 'state_update':
      state.gameState = msg;
      applyGameState(msg);
      break;

    case 'word_rejected':
      SoundSynth.playError();
      showWordFeedback(msg.error, false);
      shakeElement(dom.wordInputArea);
      break;

    case 'reaction':
      spawnFloatingReaction(msg.emoji, msg.sender_name);
      break;

    case 'error':
      showToast(`⚠️ ${msg.message}`);
      break;
  }
}

// ==========================================
// 6. GAME STATE SYNCHRONIZATION
// ==========================================
function applyGameState(data) {
  // Update Host Indicator
  const me = data.players.find(p => p.id === state.playerId);
  if (me) {
    state.isHost = me.is_host;
  }

  // Update URL so sharing is instant
  const currentUrl = new URL(window.location.href);
  if (data.room_code && currentUrl.searchParams.get('room') !== data.room_code) {
    currentUrl.searchParams.set('room', data.room_code);
    window.history.replaceState({}, '', currentUrl.toString());
  }

  // Router for screen states
  if (data.state === 'LOBBY') {
    switchScreen('lobby');
    updateLobbyUI(data);
  } else if (data.state === 'PLAYING') {
    if (data.game_mode === 'mind_meld') {
      switchScreen('mind_meld');
      updateMindMeldUI(data);
    } else {
      switchScreen('bomb');
      updateBombArenaUI(data);
    }
  } else if (data.state === 'ROUND_OVER' && data.game_mode === 'mind_meld') {
    switchScreen('mind_meld');
    showMindMeldResults(data);
  } else if (data.state === 'GAME_OVER') {
    switchScreen('game_over');
    updateGameOverUI(data);
  }

  // Handle server events (Explosions, Words, Toasts)
  if (data.last_event) {
    handleGameEvent(data.last_event);
  }
}

function handleGameEvent(evt) {
  if (evt.type === 'explosion') {
    SoundSynth.playExplosion();
    triggerScreenShake();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    showToast(evt.message);
  } else if (evt.type === 'word_success') {
    SoundSynth.playSuccess();
    showToast(evt.message);
  } else if (evt.type === 'game_won') {
    SoundSynth.playVictory();
    triggerConfetti();
  }
}

// ==========================================
// 7. LOBBY UI RENDERER
// ==========================================
function updateLobbyUI(data) {
  dom.playerCount.textContent = data.players.length;
  dom.hostBadgeIndicator.textContent = state.isHost ? '👑 You are the Host' : 'Joined Lobby';

  // Render players grid
  dom.lobbyPlayerList.innerHTML = '';
  data.players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-card-lobby ${p.id === state.playerId ? 'is-you' : ''}`;
    card.innerHTML = `
      ${p.is_host ? '<span class="crown-tag">👑</span>' : ''}
      <div class="avatar">${p.avatar}</div>
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="lives-tag">${'❤️'.repeat(p.lives)}</div>
    `;
    dom.lobbyPlayerList.appendChild(card);
  });

  // Host Controls visibility
  if (state.isHost) {
    dom.btnStartGame.classList.remove('hidden');
    dom.nonHostWaitingMsg.classList.add('hidden');
    dom.hostSettingsPanel.querySelectorAll('.seg-btn').forEach(b => b.removeAttribute('disabled'));
  } else {
    dom.btnStartGame.classList.add('hidden');
    dom.nonHostWaitingMsg.classList.remove('hidden');
    dom.hostSettingsPanel.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('disabled', 'true'));
  }

  // Sync settings buttons
  syncSegmentedControl(dom.modeSelector, data.game_mode, 'mode');
  syncSegmentedControl(dom.timerSelector, data.settings.bomb_timer.toString(), 'val');
  syncSegmentedControl(dom.livesSelector, data.settings.starting_lives.toString(), 'val');
  syncSegmentedControl(dom.diffSelector, data.settings.difficulty, 'val');
}

function syncSegmentedControl(container, activeVal, attr) {
  if (!container) return;
  container.querySelectorAll('.seg-btn').forEach(btn => {
    if (btn.getAttribute(`data-${attr}`) === activeVal) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ==========================================
// 8. BOMB ARENA RENDERER & COUNTDOWN
// ==========================================
function updateBombArenaUI(data) {
  // Update player strip (lives & scores)
  dom.gamePlayersStrip.innerHTML = '';
  data.players.forEach(p => {
    const isTurn = p.id === data.current_player_id;
    const isEliminated = p.lives <= 0;
    const card = document.createElement('div');
    card.className = `player-strip-card ${isTurn ? 'active-turn' : ''} ${isEliminated ? 'eliminated' : ''}`;
    card.innerHTML = `
      <div class="strip-avatar">${p.avatar}</div>
      <div class="strip-info">
        <span class="strip-name">${escapeHtml(p.name)} ${p.id === state.playerId ? '(You)' : ''}</span>
        <span class="strip-lives">${isEliminated ? '💀 OUT' : '❤️'.repeat(p.lives)}</span>
        <span class="strip-score">${p.score} PTS</span>
      </div>
    `;
    dom.gamePlayersStrip.appendChild(card);
  });

  // Syllable update
  dom.syllableTarget.textContent = data.current_syllable || '---';
  dom.syllableHelperText.textContent = data.current_syllable || '---';

  const isMyTurn = data.current_player_id === state.playerId;
  const activePlayer = data.players.find(p => p.id === data.current_player_id);

  if (isMyTurn) {
    dom.turnAnnouncement.classList.add('your-turn');
    dom.turnMessageText.textContent = "🔥 IT'S YOUR TURN! PASS THE BOMB!";
    dom.wordInputArea.classList.remove('hidden');
    dom.waitingTurnBox.classList.add('hidden');
    dom.gameWordInput.focus();
    if (navigator.vibrate) navigator.vibrate(60);
  } else {
    dom.turnAnnouncement.classList.remove('your-turn');
    const pName = activePlayer ? activePlayer.name : 'Another player';
    dom.turnMessageText.textContent = `💣 ${pName} is in the Hot Seat!`;
    dom.wordInputArea.classList.add('hidden');
    dom.waitingTurnBox.classList.remove('hidden');
    dom.hotSeatPlayerName.textContent = `${pName} is typing...`;
  }

  // Start Real-Time Synchronized Timer Animation
  startTurnCountdown(data.turn_time_total, data.turn_start_time);
}

function startTurnCountdown(totalSeconds, startTimeEpoch) {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
  }

  state.lastTickSecond = null;

  function tick() {
    const now = Date.now() / 1000;
    const elapsed = now - startTimeEpoch;
    const remaining = Math.max(0, totalSeconds - elapsed);
    const wholeSecond = Math.ceil(remaining);

    // Audio ticking sound on second boundary
    if (wholeSecond !== state.lastTickSecond && wholeSecond > 0 && remaining <= totalSeconds) {
      state.lastTickSecond = wholeSecond;
      const urgency = (totalSeconds - remaining) / totalSeconds;
      SoundSynth.playTick(urgency);
    }

    // Number display
    dom.bombTimerSeconds.textContent = Math.ceil(remaining);

    // SVG Ring progress
    const circumference = 2 * Math.PI * 45; // ~282.74
    const fraction = Math.max(0, remaining / totalSeconds);
    const offset = circumference * (1 - fraction);
    dom.timerCircle.style.strokeDashoffset = offset;

    // Color gradient based on urgency
    if (fraction > 0.5) {
      dom.timerCircle.style.stroke = '#00f0ff';
      dom.bombTimerSeconds.style.color = '#00f0ff';
    } else if (fraction > 0.25) {
      dom.timerCircle.style.stroke = '#ffb800';
      dom.bombTimerSeconds.style.color = '#ffb800';
    } else {
      dom.timerCircle.style.stroke = '#ff2a85';
      dom.bombTimerSeconds.style.color = '#ff2a85';
    }

    if (remaining <= 0) {
      clearInterval(state.countdownInterval);
    }
  }

  tick();
  state.countdownInterval = setInterval(tick, 100);
}

// ==========================================
// 9. MIND MELD UI RENDERER
// ==========================================
function updateMindMeldUI(data) {
  dom.mindMeldPromptText.textContent = data.mind_meld_prompt || 'Think fast!';
  dom.mindMeldResultsCard.classList.add('hidden');
  dom.mindMeldWordInput.value = '';
  dom.mindMeldStatus.textContent = '';

  const submitted = data.mind_meld_submitted_ids || [];
  const hasSubmitted = submitted.includes(state.playerId);

  if (hasSubmitted) {
    dom.mindMeldWordInput.disabled = true;
    dom.btnSubmitMindMeld.disabled = true;
    dom.mindMeldStatus.textContent = '🔒 Answer locked in! Waiting for others...';
  } else {
    dom.mindMeldWordInput.disabled = false;
    dom.btnSubmitMindMeld.disabled = false;
  }

  // Ready roster
  dom.meldReadyRoster.innerHTML = '';
  data.players.forEach(p => {
    const isDone = submitted.includes(p.id);
    const pill = document.createElement('div');
    pill.className = `meld-roster-item ${isDone ? 'locked' : ''}`;
    pill.textContent = `${p.avatar} ${p.name} ${isDone ? '✅' : '⏳'}`;
    dom.meldReadyRoster.appendChild(pill);
  });
}

function showMindMeldResults(data) {
  dom.mindMeldResultsCard.classList.remove('hidden');
  const res = data.mind_meld_results;
  if (!res) return;

  dom.meldMatchesContainer.innerHTML = '';
  res.results.forEach(group => {
    const card = document.createElement('div');
    card.className = `leaderboard-item ${group.is_match ? 'match-card' : ''}`;
    card.innerHTML = `
      <div>
        <strong style="color: ${group.is_match ? 'var(--accent-green)' : '#fff'}; font-size: 1.1rem;">
          ${group.is_match ? '✨ MATCH!' : '—'} "${escapeHtml(group.word)}"
        </strong>
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
          ${group.player_names.join(', ')}
        </div>
      </div>
      <span style="font-weight: 800; color: var(--accent-gold);">
        ${group.is_match ? '+250 PTS' : '0 PTS'}
      </span>
    `;
    dom.meldMatchesContainer.appendChild(card);
  });

  if (res.matches_found > 0) {
    SoundSynth.playSuccess();
    triggerConfetti();
  }

  if (state.isHost) {
    dom.btnNextMeldRound.classList.remove('hidden');
    dom.btnMeldBackLobby.classList.remove('hidden');
  } else {
    dom.btnNextMeldRound.classList.add('hidden');
    dom.btnMeldBackLobby.classList.add('hidden');
  }
}

// ==========================================
// 10. GAME OVER UI
// ==========================================
function updateGameOverUI(data) {
  if (data.winner) {
    dom.winnerAvatarDisplay.textContent = data.winner.avatar;
    dom.winnerNameDisplay.textContent = data.winner.name;
    dom.winnerScoreDisplay.textContent = `${data.winner.score} PTS`;
  } else {
    dom.winnerAvatarDisplay.textContent = '🤝';
    dom.winnerNameDisplay.textContent = 'Draw Game!';
    dom.winnerScoreDisplay.textContent = '';
  }

  // Sort leaderboard by score
  const sorted = [...data.players].sort((a, b) => b.score - a.score);
  dom.finalLeaderboardList.innerHTML = '';
  sorted.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-item';
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 800; color: var(--accent-gold);">#${idx + 1}</span>
        <span>${p.avatar} ${escapeHtml(p.name)}</span>
      </div>
      <span style="font-weight: 800; color: var(--accent-neon-cyan);">${p.score} PTS</span>
    `;
    dom.finalLeaderboardList.appendChild(row);
  });

  if (state.isHost) {
    dom.btnPlayAgain.classList.remove('hidden');
  } else {
    dom.btnPlayAgain.classList.add('hidden');
  }
}

// ==========================================
// 11. FLOATING REACTIONS & VISUAL EFFECTS
// ==========================================
function spawnFloatingReaction(emoji, senderName) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = `${Math.floor(Math.random() * 80) + 10}%`;

  dom.floatingLayer.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 2800);
}

function triggerScreenShake() {
  document.body.classList.add('shake-screen');
  setTimeout(() => document.body.classList.remove('shake-screen'), 500);
}

function triggerConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

function shakeElement(elem) {
  elem.classList.add('shake-screen');
  setTimeout(() => elem.classList.remove('shake-screen'), 500);
}

function showWordFeedback(msg, isSuccess) {
  dom.wordFeedbackMsg.textContent = msg;
  dom.wordFeedbackMsg.className = `feedback-msg ${isSuccess ? 'success' : 'error'}`;
  setTimeout(() => {
    if (dom.wordFeedbackMsg.textContent === msg) {
      dom.wordFeedbackMsg.textContent = '';
    }
  }, 3000);
}

// ==========================================
// 12. QR CODE GENERATION
// ==========================================
function renderQRCode() {
  if (!window.QRCode || !state.roomCode) return;
  dom.qrGraphic.innerHTML = '';
  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
  new QRCode(dom.qrGraphic, {
    text: joinUrl,
    width: 160,
    height: 160,
    colorDark: '#0a0c16',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

// ==========================================
// 13. UI NAVIGATION & EVENT LISTENERS
// ==========================================
function switchScreen(screenKey) {
  const screens = {
    welcome: dom.screenWelcome,
    lobby: dom.screenLobby,
    bomb: dom.screenBomb,
    mind_meld: dom.screenMindMeld,
    game_over: dom.screenGameOver,
  };

  Object.values(screens).forEach(sc => sc.classList.remove('active'));
  if (screens[screenKey]) {
    screens[screenKey].classList.add('active');
  }
}

function bindEventListeners() {
  // Unlock Web Audio on first user interaction
  document.addEventListener('click', () => SoundSynth.getContext(), { once: true });
  document.addEventListener('keydown', () => SoundSynth.getContext(), { once: true });

  // Avatar Carousel
  dom.avatarPrev.addEventListener('click', () => {
    state.currentAvatarIdx = (state.currentAvatarIdx - 1 + AVATARS.length) % AVATARS.length;
    dom.avatarDisplay.textContent = AVATARS[state.currentAvatarIdx];
  });

  dom.avatarNext.addEventListener('click', () => {
    state.currentAvatarIdx = (state.currentAvatarIdx + 1) % AVATARS.length;
    dom.avatarDisplay.textContent = AVATARS[state.currentAvatarIdx];
  });

  // Random Name
  dom.btnRandomName.addEventListener('click', () => {
    const rName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    dom.playerNameInput.value = rName;
    state.playerName = rName;
  });

  dom.playerNameInput.addEventListener('input', (e) => {
    state.playerName = e.target.value.trim();
    localStorage.setItem('wb_player_name', state.playerName);
  });

  // Tabs Join vs Create
  dom.tabJoin.addEventListener('click', () => {
    dom.tabJoin.classList.add('active');
    dom.tabCreate.classList.remove('active');
    dom.panelJoin.classList.add('active');
    dom.panelCreate.classList.remove('active');
  });

  dom.tabCreate.addEventListener('click', () => {
    dom.tabCreate.classList.add('active');
    dom.tabJoin.classList.remove('active');
    dom.panelCreate.classList.add('active');
    dom.panelJoin.classList.remove('active');
  });

  // Create Room
  dom.btnCreateRoom.addEventListener('click', () => {
    const name = dom.playerNameInput.value.trim() || 'Player 1';
    const avatar = AVATARS[state.currentAvatarIdx];
    sendAction('create_room', { name, avatar });
  });

  // Join Room
  dom.btnJoinRoom.addEventListener('click', () => {
    const name = dom.playerNameInput.value.trim() || 'Player 1';
    const avatar = AVATARS[state.currentAvatarIdx];
    const code = dom.joinRoomCodeInput.value.trim().toUpperCase();
    if (!code) {
      showToast('⚠️ Please enter a room code!');
      return;
    }
    sendAction('join_room', { room_code: code, name, avatar });
  });

  // Copy Room Link
  dom.btnCopyLink.addEventListener('click', () => {
    copyJoinLink();
  });

  dom.roomBadge.addEventListener('click', () => {
    copyJoinLink();
  });

  // Toggle QR Code
  dom.btnToggleQr.addEventListener('click', () => {
    dom.qrContainer.classList.toggle('hidden');
  });

  // Host Settings Listeners
  dom.modeSelector.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.isHost) return;
      const mode = btn.dataset.mode;
      sendAction('start_game', { mode });
    });
  });

  dom.timerSelector.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.isHost) return;
      sendAction('update_settings', { settings: { bomb_timer: parseInt(btn.dataset.val) } });
    });
  });

  dom.livesSelector.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.isHost) return;
      sendAction('update_settings', { settings: { starting_lives: parseInt(btn.dataset.val) } });
    });
  });

  dom.diffSelector.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.isHost) return;
      sendAction('update_settings', { settings: { difficulty: btn.dataset.val } });
    });
  });

  // Start Game Button
  dom.btnStartGame.addEventListener('click', () => {
    if (!state.isHost) return;
    const activeModeBtn = dom.modeSelector.querySelector('.seg-btn.active');
    const mode = activeModeBtn ? activeModeBtn.dataset.mode : 'bomb';
    sendAction('start_game', { mode });
  });

  // Word Submit (Bomb Mode)
  dom.wordSubmitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWord();
  });

  // Mind Meld Submit
  dom.btnSubmitMindMeld.addEventListener('click', () => {
    const val = dom.mindMeldWordInput.value.trim();
    if (val) {
      sendAction('submit_mind_meld', { answer: val });
    }
  });

  dom.mindMeldWordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      dom.btnSubmitMindMeld.click();
    }
  });

  dom.btnNextMeldRound.addEventListener('click', () => {
    if (state.isHost) sendAction('start_game', { mode: 'mind_meld' });
  });

  dom.btnMeldBackLobby.addEventListener('click', () => {
    if (state.isHost) sendAction('return_to_lobby');
  });

  // Play Again Button (Game Over)
  dom.btnPlayAgain.addEventListener('click', () => {
    if (state.isHost) {
      sendAction('return_to_lobby');
    }
  });

  // Reaction Buttons
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      sendAction('send_reaction', { emoji });
      spawnFloatingReaction(emoji, state.playerName);
    });
  });

  // Sound Toggle
  dom.btnSoundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    localStorage.setItem('wb_sound', state.soundEnabled);
    showToast(state.soundEnabled ? '🔊 Sound Enabled' : '🔇 Sound Muted');
  });

  // How to play modal
  dom.btnHowToPlay.addEventListener('click', () => dom.modalHowToPlay.classList.remove('hidden'));
  dom.btnCloseModal.addEventListener('click', () => dom.modalHowToPlay.classList.add('hidden'));
  dom.btnModalGotIt.addEventListener('click', () => dom.modalHowToPlay.classList.add('hidden'));
}

function submitWord() {
  const word = dom.gameWordInput.value.trim();
  if (!word) return;

  sendAction('submit_word', { word });
  dom.gameWordInput.value = '';
}

function copyJoinLink() {
  if (!state.roomCode) return;
  const link = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(() => {
      showToast('📋 Invite link copied to clipboard!');
    }).catch(() => fallbackCopy(link));
  } else {
    fallbackCopy(link);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('📋 Invite link copied!');
}

function showToast(text, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, duration);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);

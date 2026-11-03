// ==========================================
// WORD BLAST ARENA - CLIENT CONTROLLER
// Real-Time Multiplayer Engine & Web Audio Synth
// ==========================================

const AVATARS = ['🚀', '🐱', '🤖', '🍕', '🦊', '👾', '🦄', '⚡', '🤠', '🐼', '🎸', '👑', '🍩', '🐙', '🐉', '🥑'];
const RANDOM_NAMES = ['NeonFox', 'CosmicAce', 'TurboPanda', 'PixelKnight', 'BlazeRider', 'HyperNinja', 'QuantumCat', 'StarLord', 'CyberHawk', 'FlashPulse'];

// ==========================================
// 🎵 CUSTOM MUSIC CONFIGURATION:
// To use your own MP3/WAV/OGG music:
// 1. Copy your audio file into the "public" folder (e.g. public/bgm.mp3)
// 2. Set the file name or URL in the line below:
// ==========================================
const CUSTOM_MUSIC_FILE = 'F1 Movie - Background Music.mp3'; // <-- CHANGE THIS LINE (e.g. 'bgm.mp3' or full URL)

// Application State
const state = {
  ws: null,
  playerId: null,
  roomCode: null,
  isHost: false,
  soundEnabled: true,
  musicEnabled: true,
  musicMode: 'lobby',
  audioCtx: null,
  currentAvatarIdx: 0,
  playerName: '',
  gameState: null,
  countdownInterval: null,
  lastTickSecond: null,
  serverClockOffset: 0,
};

// ==========================================
// 1. WEB AUDIO API SYNTHESIZER
// High-compatibility, multi-device synthetic audio engine
// ==========================================
class SoundSynth {
  static isUnlocked = false;

  static getContext() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
      }
    }
    return state.audioCtx;
  }

  static unlock() {
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (!this.isUnlocked) {
      try {
        // Unlock iOS Safari hardware audio pipeline with silent buffer
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        this.isUnlocked = true;
      } catch (e) {}
    }

    if (state.musicEnabled && typeof MusicEngine !== 'undefined') {
      MusicEngine.start();
    }
  }

  static withContext(fn) {
    if (!state.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        try { fn(ctx); } catch (e) { console.error('Audio play error:', e); }
      }).catch(() => {});
    } else {
      try { fn(ctx); } catch (e) { console.error('Audio play error:', e); }
    }
  }

  static playTick(urgency = 0) {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      const baseFreq = 700 + Math.min(Math.max(urgency, 0), 1) * 650; // 700Hz -> 1350Hz

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.045);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    });
  }

  static playSuccess() {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      const freqs = [659.25, 880.00, 1108.73, 1318.51]; // E5, A5, C#6, E6
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.055;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.23);
      });
    });
  }

  static playError() {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      [240, 170].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.09;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.28, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.085);
      });
    });
  }

  static playExplosion() {
    if (typeof MusicEngine !== 'undefined') {
      MusicEngine.duck(0.7);
    }
    this.withContext((ctx) => {
      const now = ctx.currentTime;

      // 1. Noise crackle with filter sweep
      const bufferSize = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.45);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      // 2. Punch sub-bass drop
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160, now);
      sub.frequency.exponentialRampToValueAtTime(45, now + 0.4);

      subGain.gain.setValueAtTime(0.6, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      sub.connect(subGain);
      subGain.connect(ctx.destination);

      noise.start(now);
      sub.start(now);
      noise.stop(now + 0.5);
      sub.stop(now + 0.45);
    });
  }

  static playVictory() {
    if (typeof MusicEngine !== 'undefined') {
      MusicEngine.setMode('game_over');
    }
    this.withContext((ctx) => {
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.09;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.45);
      });
    });
  }

  static playPop() {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    });
  }

  static playClick() {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1100, now);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.025);
    });
  }

  static playTestChime() {
    this.withContext((ctx) => {
      const now = ctx.currentTime;
      [783.99, 1046.50].forEach((freq, idx) => { // G5, C6
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.3);
      });
    });
  }
}

// ==========================================
// 1.5 DYNAMIC BACKGROUND MUSIC ENGINE
// Procedural multi-track adaptive synthwave soundtrack
// ==========================================
class MusicEngine {
  static isRunning = false;
  static currentMode = 'lobby'; // 'lobby', 'game', 'tension', 'game_over'
  static tempo = 114;
  static nextNoteTime = 0.0;
  static currentStep = 0; // 0 to 63
  static timerId = null;
  static masterGain = null;
  static noiseBuffer = null;
  static audioEl = null;

  static init(ctx) {
    if (!this.masterGain && ctx) {
      this.masterGain = ctx.createGain();
      const initialVol = state.musicEnabled ? 0.16 : 0.0001;
      this.masterGain.gain.setValueAtTime(initialVol, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
      this.createNoiseBuffer(ctx);
    }
  }

  static createNoiseBuffer(ctx) {
    if (this.noiseBuffer) return;
    try {
      const bufferSize = ctx.sampleRate * 1.0;
      this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } catch (e) {}
  }

  static start() {
    const ctx = SoundSynth.getContext();
    if (!ctx) return;
    this.init(ctx);
    if (this.isRunning) return;
    this.isRunning = true;

    // If custom audio file is specified, play the MP3/audio file
    if (typeof CUSTOM_MUSIC_FILE === 'string' && CUSTOM_MUSIC_FILE.trim() !== '') {
      if (!this.audioEl) {
        this.audioEl = new Audio(CUSTOM_MUSIC_FILE);
        this.audioEl.loop = true;
      }
      this.audioEl.volume = state.musicEnabled ? 0.35 : 0;
      if (state.musicEnabled) {
        this.audioEl.play().catch(e => console.log('Custom audio autoplay prevented:', e));
      }
      return;
    }

    // Otherwise, play the built-in procedural synthesizer
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.currentStep = 0;
    this.scheduler();
  }

  static stop() {
    this.isRunning = false;
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  static setMuted(muted) {
    if (this.audioEl) {
      if (muted) {
        this.audioEl.pause();
      } else {
        this.audioEl.volume = 0.35;
        this.audioEl.play().catch(() => {});
      }
      return;
    }
    const ctx = SoundSynth.getContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    const target = muted ? 0.0001 : 0.16;
    this.masterGain.gain.exponentialRampToValueAtTime(target, now + 0.12);
  }

  static duck(duration = 0.7) {
    if (this.audioEl && state.musicEnabled) {
      this.audioEl.volume = 0.08;
      setTimeout(() => {
        if (this.audioEl && state.musicEnabled) {
          this.audioEl.volume = 0.35;
        }
      }, duration * 1000);
      return;
    }
    const ctx = SoundSynth.getContext();
    if (!ctx || !this.masterGain || !state.musicEnabled) return;
    const now = ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.03, now + 0.05);
      this.masterGain.gain.exponentialRampToValueAtTime(0.16, now + duration);
    } catch (e) {}
  }

  static setMode(mode) {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    if (mode === 'lobby') {
      this.tempo = 114;
    } else if (mode === 'game') {
      this.tempo = 128;
    } else if (mode === 'tension') {
      this.tempo = 152;
    } else if (mode === 'game_over') {
      this.tempo = 98;
    }
  }

  static scheduler() {
    if (!this.isRunning) return;
    const ctx = SoundSynth.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      this.timerId = setTimeout(() => this.scheduler(), 80);
      return;
    }

    if (this.nextNoteTime < ctx.currentTime) {
      this.nextNoteTime = ctx.currentTime + 0.02;
    }

    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      if (state.musicEnabled) {
        this.scheduleStep(this.currentStep, this.nextNoteTime, ctx);
      }
      this.advanceStep();
    }
    this.timerId = setTimeout(() => this.scheduler(), 30);
  }

  static advanceStep() {
    const secondsPerBeat = 60.0 / this.tempo;
    const secondsPer16th = 0.25 * secondsPerBeat;
    this.nextNoteTime += secondsPer16th;
    this.currentStep = (this.currentStep + 1) % 64;
  }

  static midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // --- Synthetic Instruments ---
  static playKick(time, ctx, punch = 1) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130 * punch, time);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.07);

      gain.gain.setValueAtTime(0.65 * punch, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.085);
    } catch (e) {}
  }

  static playSnare(time, ctx) {
    try {
      if (!this.noiseBuffer) return;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, time);
      filter.Q.setValueAtTime(1.2, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(time);
      noise.stop(time + 0.12);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(60, time + 0.05);

      oscGain.gain.setValueAtTime(0.25, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.055);
    } catch (e) {}
  }

  static playHiHat(time, ctx, open = false) {
    try {
      if (!this.noiseBuffer) return;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7500, time);

      const gain = ctx.createGain();
      const dur = open ? 0.12 : 0.035;
      gain.gain.setValueAtTime(open ? 0.22 : 0.13, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(time);
      noise.stop(time + dur + 0.01);
    } catch (e) {}
  }

  static playBass(time, ctx, midiNote, dur = 0.14) {
    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.midiToFreq(midiNote), time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, time);
      filter.frequency.exponentialRampToValueAtTime(220, time + dur);

      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + dur + 0.02);
    } catch (e) {}
  }

  static playLead(time, ctx, midiNote, dur = 0.12) {
    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.midiToFreq(midiNote), time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, time);

      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + dur + 0.02);
    } catch (e) {}
  }

  // --- Step Dispatchers ---
  static scheduleStep(step, time, ctx) {
    if (this.currentMode === 'lobby') {
      this.playLobbyStep(step, time, ctx);
    } else if (this.currentMode === 'game' || this.currentMode === 'tension') {
      this.playGameStep(step, time, ctx, this.currentMode === 'tension');
    } else if (this.currentMode === 'game_over') {
      this.playGameOverStep(step, time, ctx);
    }
  }

  static playLobbyStep(step, time, ctx) {
    const barStep = step % 16;
    const barIdx = Math.floor(step / 16); // 0: Am, 1: F, 2: C, 3: G

    // Drums
    if (barStep === 0 || barStep === 8) this.playKick(time, ctx);
    if (barStep === 14) this.playKick(time, ctx, 0.7);
    if (barStep === 4 || barStep === 12) this.playSnare(time, ctx);
    if (barStep % 2 === 0) this.playHiHat(time, ctx, barStep === 14);

    // Bass Roots
    const roots = [33, 29, 36, 31];
    const root = roots[barIdx];
    if (barStep === 0 || barStep === 3 || barStep === 8 || barStep === 12) {
      const n = (barStep === 3) ? root + 7 : (barStep === 12 ? root + 5 : root);
      this.playBass(time, ctx, n, 0.16);
    }

    // Melodic Arp
    const arpAm = [57, 60, 64, 69, 67, 64, 60, 62];
    const arpF  = [53, 57, 60, 65, 64, 60, 57, 60];
    const arpC  = [48, 52, 55, 60, 62, 60, 55, 52];
    const arpG  = [55, 59, 62, 67, 65, 62, 59, 57];
    const arps = [arpAm, arpF, arpC, arpG];
    if (barStep % 2 === 0) {
      const noteIdx = (barStep / 2) % 8;
      this.playLead(time, ctx, arps[barIdx][noteIdx], 0.14);
    }
  }

  static playGameStep(step, time, ctx, isTension) {
    const barStep = step % 16;
    const barIdx = Math.floor(step / 16); // 0: Dm, 1: Bb, 2: F, 3: C

    // High-energy Drums
    if (barStep % 4 === 0) this.playKick(time, ctx, isTension ? 1.2 : 1.0);
    if (isTension && (barStep === 2 || barStep === 6 || barStep === 10 || barStep === 14)) {
      this.playKick(time, ctx, 0.7);
    }
    if (barStep === 4 || barStep === 12) this.playSnare(time, ctx);
    this.playHiHat(time, ctx, barStep % 4 === 2);

    // Pumping 16th Octave Bass
    const lowRoots = [26, 22, 29, 24];
    const r = lowRoots[barIdx];
    const bassNote = (barStep % 2 === 0) ? r : r + 12;
    this.playBass(time, ctx, bassNote, isTension ? 0.09 : 0.11);

    // Driving Cyberpunk Arp
    const arpDm = [62, 65, 69, 74, 72, 69, 65, 69, 62, 65, 69, 74, 77, 74, 69, 65];
    const arpBb = [58, 62, 65, 70, 69, 65, 62, 65, 58, 62, 65, 70, 74, 70, 65, 62];
    const arpF  = [53, 57, 60, 65, 67, 65, 60, 57, 53, 57, 60, 65, 69, 65, 60, 57];
    const arpC  = [60, 64, 67, 72, 70, 67, 64, 60, 60, 64, 67, 72, 76, 72, 67, 64];
    const gameArps = [arpDm, arpBb, arpF, arpC];

    const note = gameArps[barIdx][barStep] + (isTension ? 12 : 0);
    this.playLead(time, ctx, note, isTension ? 0.08 : 0.10);
  }

  static playGameOverStep(step, time, ctx) {
    const barStep = step % 16;
    if (barStep === 0 || barStep === 8) this.playKick(time, ctx, 0.7);
    if (barStep === 4 || barStep === 12) this.playSnare(time, ctx);
    if (barStep % 2 === 0) this.playHiHat(time, ctx);
    if (barStep === 0 || barStep === 6 || barStep === 10) {
      this.playBass(time, ctx, 36, 0.2);
    }
  }
}

// ==========================================
// 2. DOM ELEMENTS CACHE
// ==========================================
const dom = {
  // Navigation & Badges
  roomBadge: document.getElementById('room-code-badge'),
  roomCodeText: document.getElementById('room-code-text'),
  btnInstallApp: document.getElementById('btn-install-app'),
  btnMusicToggle: document.getElementById('btn-music-toggle'),
  musicIcon: document.getElementById('music-icon'),
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

  // Music preference
  const savedMusic = localStorage.getItem('wb_music');
  if (savedMusic !== null) {
    state.musicEnabled = savedMusic === 'true';
    if (dom.musicIcon) {
      dom.musicIcon.textContent = state.musicEnabled ? '🎵' : '🔇';
    }
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
  // Synchronize server-client clock offset
  if (data.server_time) {
    state.serverClockOffset = (Date.now() / 1000) - data.server_time;
  }

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
    const currentServerTime = (Date.now() / 1000) - (state.serverClockOffset || 0);
    const elapsed = Math.max(0, currentServerTime - startTimeEpoch);
    const remaining = Math.max(0, totalSeconds - elapsed);
    const wholeSecond = Math.ceil(remaining);

    // Audio ticking sound on second boundary
    if (wholeSecond !== state.lastTickSecond && wholeSecond > 0 && remaining <= totalSeconds) {
      state.lastTickSecond = wholeSecond;
      const urgency = (totalSeconds - remaining) / totalSeconds;
      SoundSynth.playTick(urgency);
    }

    // Dynamic music tempo escalation when time is running out!
    if (remaining <= 3.5 && remaining > 0) {
      if (typeof MusicEngine !== 'undefined') MusicEngine.setMode('tension');
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
  SoundSynth.playPop();
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

  // Adaptive background music track switching
  if (typeof MusicEngine !== 'undefined') {
    if (screenKey === 'welcome' || screenKey === 'lobby') {
      MusicEngine.setMode('lobby');
    } else if (screenKey === 'bomb' || screenKey === 'mind_meld') {
      MusicEngine.setMode('game');
    } else if (screenKey === 'game_over') {
      MusicEngine.setMode('game_over');
    }
  }
}

function bindEventListeners() {
  // Persistent Web Audio unlock across all user touch & click gestures
  const unlockEvents = ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'];
  const handleUnlock = () => {
    SoundSynth.unlock();
  };
  unlockEvents.forEach(evt => {
    document.addEventListener(evt, handleUnlock, { passive: true });
  });

  // Avatar Carousel
  dom.avatarPrev.addEventListener('click', () => {
    SoundSynth.playClick();
    state.currentAvatarIdx = (state.currentAvatarIdx - 1 + AVATARS.length) % AVATARS.length;
    dom.avatarDisplay.textContent = AVATARS[state.currentAvatarIdx];
  });

  dom.avatarNext.addEventListener('click', () => {
    SoundSynth.playClick();
    state.currentAvatarIdx = (state.currentAvatarIdx + 1) % AVATARS.length;
    dom.avatarDisplay.textContent = AVATARS[state.currentAvatarIdx];
  });

  // Random Name
  dom.btnRandomName.addEventListener('click', () => {
    SoundSynth.playClick();
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

  // Music Toggle
  dom.btnMusicToggle.addEventListener('click', () => {
    SoundSynth.unlock();
    state.musicEnabled = !state.musicEnabled;
    dom.musicIcon.textContent = state.musicEnabled ? '🎵' : '🔇';
    localStorage.setItem('wb_music', state.musicEnabled);
    if (typeof MusicEngine !== 'undefined') {
      MusicEngine.setMuted(!state.musicEnabled);
      if (state.musicEnabled) {
        MusicEngine.start();
        showToast('🎵 Music Enabled');
      } else {
        showToast('🔇 Music Muted');
      }
    }
  });

  // Sound Toggle
  dom.btnSoundToggle.addEventListener('click', () => {
    SoundSynth.unlock();
    state.soundEnabled = !state.soundEnabled;
    dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    localStorage.setItem('wb_sound', state.soundEnabled);
    if (state.soundEnabled) {
      SoundSynth.playTestChime();
      showToast('🔊 Sound Enabled (Audio is active!)');
    } else {
      showToast('🔇 Sound Muted');
    }
  });

  // How to play modal
  dom.btnHowToPlay.addEventListener('click', () => dom.modalHowToPlay.classList.remove('hidden'));
  dom.btnCloseModal.addEventListener('click', () => dom.modalHowToPlay.classList.add('hidden'));
  dom.btnModalGotIt.addEventListener('click', () => dom.modalHowToPlay.classList.add('hidden'));

  // PWA Install Prompt handling
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (dom.btnInstallApp) {
      dom.btnInstallApp.classList.remove('hidden');
    }
  });

  if (dom.btnInstallApp) {
    dom.btnInstallApp.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('🎉 Word Blast Arena installed to your device!');
        }
        deferredInstallPrompt = null;
        dom.btnInstallApp.classList.add('hidden');
      } else {
        // Fallback instructions for iOS Safari or already installed
        showToast('📲 Tap your browser Share menu ➔ "Add to Home Screen" to install!');
      }
    });
  }

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration error:', err);
    });
  }
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

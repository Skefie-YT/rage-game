(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const statHeightEl = document.getElementById('stat-height');
  const statBestEl = document.getElementById('stat-best');
  const statFallsEl = document.getElementById('stat-falls');
  const statTimeEl = document.getElementById('stat-time');
  const zoneNameEl = document.getElementById('zone-name');
  const progressFillEl = document.getElementById('progress-fill');
  const progressPctEl = document.getElementById('progress-pct');
  const tauntToastEl = document.getElementById('taunt-toast');
  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlaySubtitleEl = document.getElementById('overlay-subtitle');
  const overlayStatsEl = document.getElementById('overlay-stats');
  const startBtn = document.getElementById('start-btn');
  const resetBtn = document.getElementById('reset-btn');
  const toggleHardcoreEl = document.getElementById('toggle-hardcore');
  const toggleMuteEl = document.getElementById('toggle-mute');

  // Touch buttons & Mobile HUD
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');
  const jumpChargeFillEl = document.getElementById('jump-charge-fill');
  const mHeightEl = document.getElementById('m-height');
  const mBestEl = document.getElementById('m-best');
  const mFallsEl = document.getElementById('m-falls');
  const mPctEl = document.getElementById('m-pct');
  const mMuteBtn = document.getElementById('m-mute');
  const mResetBtn = document.getElementById('m-reset');
  const mInfoBtn = document.getElementById('m-info');
  const mCloseDrawerBtn = document.getElementById('m-close-drawer');
  const rightPanelEl = document.getElementById('right-panel');

  // Constants
  const W = 480;
  const H = 720;
  const WALL_THICKNESS = 16;
  const TOWER_HEIGHT = 4600;
  const START_Y = 4560;
  const GOAL_Y = 165;

  const GRAVITY = 1350;
  const WALK_SPEED = 165;
  const MIN_JUMP_VY = 280;
  const MAX_JUMP_VY = 830;
  const MIN_JUMP_VX = 100;
  const MAX_JUMP_VX = 310;
  const CHARGE_RATE = 1.18; // full charge in ~0.85s
  const SPLAT_VY = 680;
  const BIG_FALL_THRESHOLD = 280;

  // Web Audio Synthesizer (zero external assets)
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.chargeOsc = null;
      this.chargeGain = null;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playTone(freq, endFreq, duration, type = 'square', vol = 0.12) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    }

    startCharge() {
      if (this.muted || !this.ctx || this.chargeOsc) return;
      const now = this.ctx.currentTime;
      this.chargeOsc = this.ctx.createOscillator();
      this.chargeGain = this.ctx.createGain();
      this.chargeOsc.type = 'triangle';
      this.chargeOsc.frequency.setValueAtTime(140, now);
      this.chargeGain.gain.setValueAtTime(0.05, now);
      this.chargeOsc.connect(this.chargeGain);
      this.chargeGain.connect(this.ctx.destination);
      this.chargeOsc.start(now);
    }

    updateCharge(charge) {
      if (this.chargeOsc && this.ctx) {
        this.chargeOsc.frequency.setValueAtTime(140 + charge * 420, this.ctx.currentTime);
      }
    }

    stopCharge() {
      if (this.chargeOsc) {
        try {
          this.chargeOsc.stop();
          this.chargeOsc.disconnect();
          this.chargeGain.disconnect();
        } catch (_) {}
        this.chargeOsc = null;
        this.chargeGain = null;
      }
    }

    jump(charge) {
      this.stopCharge();
      this.playTone(220 + charge * 180, 520 + charge * 260, 0.14, 'square', 0.1);
    }

    bonk() {
      this.playTone(150, 55, 0.15, 'sawtooth', 0.16);
    }

    splat() {
      this.playTone(110, 35, 0.25, 'sawtooth', 0.2);
    }

    bounce() {
      this.playTone(260, 880, 0.22, 'sine', 0.16);
    }

    crumble() {
      this.playTone(180, 70, 0.18, 'triangle', 0.12);
    }

    sadTrombone() {
      if (this.muted || !this.ctx) return;
      const notes = [293.66, 277.18, 261.63, 246.94];
      notes.forEach((n, i) => {
        setTimeout(() => {
          this.playTone(n, n * 0.94, i === 3 ? 0.45 : 0.2, 'sawtooth', 0.1);
        }, i * 210);
      });
    }

    victory() {
      if (this.muted || !this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => {
        setTimeout(() => {
          this.playTone(n, n * 1.02, 0.25, 'triangle', 0.15);
        }, i * 130);
      });
    }
  }

  const sfx = new SoundFX();

  // Snarky Rage Taunts
  const FALL_TAUNTS = [
    "Gravity: 1, You: 0.",
    "Did you mean to do that?",
    "That was painful to watch.",
    "Maybe try knitting instead?",
    "Skill issue detected.",
    "All that progress... gone.",
    "Sir Sisyphus sends his regards.",
    "Have you considered holding Space less?",
    "Bonk! Right back to square one.",
    "The tower claims another victim.",
    "At least the view on the way down is nice.",
    "Uninstalled yet?"
  ];

  let toastTimer = null;
  function showToast(msg, isGood = false, duration = 2600) {
    tauntToastEl.textContent = msg;
    tauntToastEl.classList.toggle('good', isGood);
    tauntToastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      tauntToastEl.classList.add('hidden');
    }, duration);
  }

  // Level Platforms
  function createPlatforms() {
    return [
      // Ground
      { x: 16, y: 4560, w: 448, h: 40, type: 'solid' },

      // Zone 1: The Mossy Dungeon
      { x: 270, y: 4420, w: 130, h: 18, type: 'solid' },
      { x: 70,  y: 4280, w: 120, h: 18, type: 'solid' },
      { x: 260, y: 4135, w: 110, h: 18, type: 'solid' },
      { x: 340, y: 3980, w: 95,  h: 18, type: 'solid' },
      { x: 130, y: 3840, w: 100, h: 18, type: 'crumble' },
      { x: 40,  y: 3690, w: 95,  h: 18, type: 'solid' },
      { x: 220, y: 3550, w: 110, h: 18, type: 'solid' },
      { x: 350, y: 3410, w: 90,  h: 18, type: 'solid' },

      // Zone 2: The Windy Spire
      { x: 180, y: 3260, w: 95,  h: 18, type: 'solid' },
      { x: 45,  y: 3110, w: 90,  h: 18, type: 'moving', minX: 30, maxX: 195, speed: 78 },
      { x: 290, y: 2960, w: 90,  h: 18, type: 'solid' },
      { x: 160, y: 2810, w: 85,  h: 18, type: 'crumble' },
      { x: 320, y: 2660, w: 95,  h: 18, type: 'bounce' },
      { x: 110, y: 2490, w: 110, h: 18, type: 'solid' },
      { x: 240, y: 2340, w: 120, h: 18, type: 'solid', hasFakeCheckpoint: true },
      { x: 48,  y: 2340, w: 78,  h: 18, type: 'fake', label: 'SAFE!' },

      // Zone 3: The Icy Peaks
      { x: 90,  y: 2190, w: 110, h: 18, type: 'ice' },
      { x: 290, y: 2045, w: 100, h: 18, type: 'ice' },
      { x: 130, y: 1900, w: 95,  h: 18, type: 'ice' },
      { x: 330, y: 1755, w: 85,  h: 18, type: 'crumble' },
      { x: 170, y: 1610, w: 90,  h: 18, type: 'moving', minX: 55, maxX: 285, speed: 105 },
      { x: 340, y: 1465, w: 90,  h: 18, type: 'ice' },
      { x: 110, y: 1320, w: 90,  h: 18, type: 'ice' },
      { x: 250, y: 1175, w: 95,  h: 18, type: 'solid' },

      // Zone 4: The Golden Heaven
      { x: 70,  y: 1030, w: 82,  h: 18, type: 'crumble' },
      { x: 270, y: 885,  w: 82,  h: 18, type: 'ice' },
      { x: 360, y: 740,  w: 75,  h: 18, type: 'solid' },
      { x: 150, y: 595,  w: 82,  h: 18, type: 'moving', minX: 48, maxX: 265, speed: 125 },
      { x: 40,  y: 450,  w: 75,  h: 18, type: 'crumble' },
      { x: 210, y: 310,  w: 85,  h: 18, type: 'ice' },

      // Summit
      { x: 150, y: 165,  w: 180, h: 22, type: 'goal' }
    ].map(p => ({
      ...p,
      baseX: p.x,
      dir: 1,
      dx: 0,
      crumbleState: 'intact', // intact | shaking | gone
      crumbleTimer: 0
    }));
  }

  // Angry Bonk Bumpers
  function createBumpers() {
    return [
      { x: 240, y: 1970, r: 15, baseX: 240, range: 95, speed: 1.8, phase: 0 },
      { x: 240, y: 815,  r: 16, baseX: 240, range: 120, speed: 2.3, phase: 1.5 }
    ];
  }

  // Game State
  let state = 'menu'; // menu | playing | won
  let platforms = createPlatforms();
  let bumpers = createBumpers();
  let particles = [];
  let ambientParticles = [];
  let screenShake = 0;
  let fakeCheckpointTriggered = false;

  let bestHeightMeters = Number(localStorage.getItem('tor_best_meters') || 0);
  let falls = 0;
  let elapsedSeconds = 0;
  let hardcoreMode = false;

  // Player
  const player = {
    x: 226,
    y: START_Y - 28,
    w: 28,
    h: 28,
    vx: 0,
    vy: 0,
    onGround: false,
    standingPlatform: null,
    charging: false,
    charge: 0,
    facing: 1,
    splatTimer: 0,
    peakYOnJump: START_Y - 28,
    squashX: 1,
    squashY: 1,
    bonkFlash: 0
  };

  let cameraY = TOWER_HEIGHT - H;

  // Input State
  const keys = {
    left: false,
    right: false,
    jump: false
  };

  // Wind State (Zone 2)
  let windForce = 0;
  let windTimer = 0;

  // Init ambient particles
  for (let i = 0; i < 45; i++) {
    ambientParticles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 20 + Math.random() * 40,
      size: 1.5 + Math.random() * 2.5
    });
  }

  function resetGame(autoPlay = true) {
    platforms = createPlatforms();
    bumpers = createBumpers();
    particles = [];
    screenShake = 0;
    fakeCheckpointTriggered = false;
    falls = 0;
    elapsedSeconds = 0;
    windForce = 0;
    windTimer = 0;

    player.x = 226;
    player.y = START_Y - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.standingPlatform = platforms[0];
    player.charging = false;
    player.charge = 0;
    player.facing = 1;
    player.splatTimer = 0;
    player.peakYOnJump = player.y;
    player.squashX = 1;
    player.squashY = 1;
    player.bonkFlash = 0;

    cameraY = TOWER_HEIGHT - H;
    sfx.stopCharge();

    if (autoPlay) {
      state = 'playing';
      overlayEl.classList.add('hidden');
      showToast("Climb to the Crown. Good luck.", true, 2000);
    }
    updateHUD();
  }

  function spawnParticles(x, y, color, count = 10, speed = 150) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 40,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color,
        size: 3 + Math.random() * 3
      });
    }
  }

  function triggerJump() {
    if (!player.onGround || player.splatTimer > 0) return;
    const c = Math.max(0.08, player.charge);
    let aim = 0;
    if (keys.left && !keys.right) aim = -1;
    else if (keys.right && !keys.left) aim = 1;

    player.vy = -(MIN_JUMP_VY + c * (MAX_JUMP_VY - MIN_JUMP_VY));
    player.vx = aim * (MIN_JUMP_VX + c * (MAX_JUMP_VX - MIN_JUMP_VX));
    player.onGround = false;
    player.standingPlatform = null;
    player.charging = false;
    player.charge = 0;
    player.peakYOnJump = player.y;
    player.squashX = 0.75;
    player.squashY = 1.3;

    sfx.jump(c);
    spawnParticles(player.x + player.w / 2, player.y + player.h, '#e2e8f0', 8, 110);
  }

  // Input Listeners
  function handleKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    sfx.init();

    if (e.code === 'KeyM') {
      sfx.muted = !sfx.muted;
      toggleMuteEl.checked = sfx.muted;
      if (sfx.muted) sfx.stopCharge();
      return;
    }

    if (e.code === 'KeyR') {
      resetGame(true);
      return;
    }

    if (state !== 'playing') {
      if (e.code === 'Space' || e.code === 'Enter') {
        resetGame(true);
      }
      return;
    }

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      keys.left = true;
      player.facing = -1;
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      keys.right = true;
      player.facing = 1;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (!keys.jump && player.onGround && player.splatTimer <= 0) {
        player.charging = true;
        player.charge = 0;
        sfx.startCharge();
      }
      keys.jump = true;
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      keys.jump = false;
      if (state === 'playing' && player.charging) {
        triggerJump();
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Touch / Mouse Controls (multi-touch safe via pointer capture)
  function bindHold(el, onDown, onUp) {
    const activePointers = new Set();
    const start = (e) => {
      e.preventDefault();
      sfx.init();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const wasEmpty = activePointers.size === 0;
      activePointers.add(e.pointerId);
      if (wasEmpty) {
        el.classList.add('active');
        onDown();
      }
    };
    const end = (e) => {
      e.preventDefault();
      if (!activePointers.has(e.pointerId)) return;
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        el.classList.remove('active');
        onUp();
      }
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindHold(btnLeft, () => { keys.left = true; player.facing = -1; }, () => { keys.left = false; });
  bindHold(btnRight, () => { keys.right = true; player.facing = 1; }, () => { keys.right = false; });
  bindHold(btnJump,
    () => {
      if (state !== 'playing') return;
      keys.jump = true;
      if (player.onGround && player.splatTimer <= 0) {
        player.charging = true;
        player.charge = 0;
        sfx.startCharge();
      }
    },
    () => {
      keys.jump = false;
      if (state === 'playing' && player.charging) triggerJump();
    }
  );

  function syncMuteUI() {
    toggleMuteEl.checked = sfx.muted;
    if (mMuteBtn) mMuteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  }

  startBtn.addEventListener('click', () => {
    sfx.init();
    resetGame(true);
  });

  resetBtn.addEventListener('click', () => {
    sfx.init();
    rightPanelEl.classList.remove('open');
    resetGame(true);
  });

  if (mResetBtn) {
    mResetBtn.addEventListener('click', () => {
      sfx.init();
      resetGame(true);
    });
  }

  if (mMuteBtn) {
    mMuteBtn.addEventListener('click', () => {
      sfx.init();
      sfx.muted = !sfx.muted;
      if (sfx.muted) sfx.stopCharge();
      syncMuteUI();
    });
  }

  if (mInfoBtn) {
    mInfoBtn.addEventListener('click', () => {
      rightPanelEl.classList.toggle('open');
    });
  }

  if (mCloseDrawerBtn) {
    mCloseDrawerBtn.addEventListener('click', () => {
      rightPanelEl.classList.remove('open');
    });
  }

  toggleHardcoreEl.addEventListener('change', (e) => {
    hardcoreMode = e.target.checked;
  });

  toggleMuteEl.addEventListener('change', (e) => {
    sfx.muted = e.target.checked;
    if (sfx.muted) sfx.stopCharge();
    syncMuteUI();
  });

  // Update Physics (fixed dt = 1/60)
  function update(dt) {
    if (state !== 'playing') return;

    elapsedSeconds += dt;
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 28);
    if (player.bonkFlash > 0) player.bonkFlash = Math.max(0, player.bonkFlash - dt * 4);

    // Recover squash/stretch
    player.squashX += (1 - player.squashX) * 14 * dt;
    player.squashY += (1 - player.squashY) * 14 * dt;

    // Update Wind in Zone 2 (y between 2200 and 3350)
    windTimer += dt;
    if (player.y > 2200 && player.y < 3350) {
      windForce = Math.sin(windTimer * 0.9) * 145;
    } else {
      windForce = 0;
    }

    // Update Moving & Crumbling Platforms
    for (const p of platforms) {
      p.dx = 0;
      if (p.type === 'moving') {
        const prevX = p.x;
        p.x += p.dir * p.speed * dt;
        if (p.x <= p.minX) { p.x = p.minX; p.dir = 1; }
        if (p.x >= p.maxX) { p.x = p.maxX; p.dir = -1; }
        p.dx = p.x - prevX;
      } else if (p.type === 'crumble') {
        if (p.crumbleState === 'shaking') {
          p.crumbleTimer -= dt;
          if (p.crumbleTimer <= 0) {
            p.crumbleState = 'gone';
            p.crumbleTimer = 2.6;
            sfx.crumble();
            spawnParticles(p.x + p.w / 2, p.y + 8, '#d97706', 14, 130);
            if (player.standingPlatform === p) {
              player.onGround = false;
              player.standingPlatform = null;
              player.charging = false;
              player.charge = 0;
              sfx.stopCharge();
            }
          }
        } else if (p.crumbleState === 'gone') {
          p.crumbleTimer -= dt;
          if (p.crumbleTimer <= 0) {
            p.crumbleState = 'intact';
          }
        }
      }
    }

    // Update Bumpers
    for (const b of bumpers) {
      b.phase += b.speed * dt;
      b.x = b.baseX + Math.sin(b.phase) * b.range;
    }

    // Splat recovery
    if (player.splatTimer > 0) {
      player.splatTimer -= dt;
      player.squashX = 1.35;
      player.squashY = 0.6;
    }

    // Ground Movement / Charging
    if (player.onGround) {
      if (player.standingPlatform) {
        player.x += player.standingPlatform.dx;
      }

      if (keys.jump && !player.charging && player.splatTimer <= 0) {
        player.charging = true;
        player.charge = 0;
        sfx.startCharge();
      }

      if (player.charging) {
        player.charge = Math.min(1, player.charge + CHARGE_RATE * dt);
        sfx.updateCharge(player.charge);
        player.squashX = 1 + player.charge * 0.25;
        player.squashY = 1 - player.charge * 0.28;
        player.vx *= 0.8;
      } else if (player.splatTimer <= 0) {
        const isIce = player.standingPlatform && player.standingPlatform.type === 'ice';
        const targetVx = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * WALK_SPEED;
        if (isIce) {
          player.vx += (targetVx - player.vx) * 2.8 * dt;
        } else {
          player.vx = targetVx;
        }
      } else {
        player.vx *= 0.85;
      }

      player.x += player.vx * dt;

      // Wall clamp on ground
      if (player.x < WALL_THICKNESS) {
        player.x = WALL_THICKNESS;
        player.vx = 0;
      }
      if (player.x + player.w > W - WALL_THICKNESS) {
        player.x = W - WALL_THICKNESS - player.w;
        player.vx = 0;
      }

      // Check if walked off ledge
      if (player.standingPlatform) {
        const p = player.standingPlatform;
        const stillOver = player.x + player.w > p.x + 2 && player.x < p.x + p.w - 2;
        if (!stillOver || p.crumbleState === 'gone') {
          player.onGround = false;
          player.standingPlatform = null;
          player.charging = false;
          player.charge = 0;
          player.peakYOnJump = player.y;
          sfx.stopCharge();
        }
      }
    } else {
      // Airborne Physics
      player.vy += GRAVITY * dt;
      player.vx += windForce * dt;
      if (player.y < player.peakYOnJump) {
        player.peakYOnJump = player.y;
      }

      // Horizontal step & wall/platform side collision
      const prevX = player.x;
      player.x += player.vx * dt;

      if (player.x < WALL_THICKNESS) {
        player.x = WALL_THICKNESS;
        player.vx = Math.abs(player.vx) * 0.58;
        sfx.bonk();
        screenShake = 4;
        player.bonkFlash = 1;
        spawnParticles(player.x, player.y + player.h / 2, '#fbbf24', 6, 120);
      } else if (player.x + player.w > W - WALL_THICKNESS) {
        player.x = W - WALL_THICKNESS - player.w;
        player.vx = -Math.abs(player.vx) * 0.58;
        sfx.bonk();
        screenShake = 4;
        player.bonkFlash = 1;
        spawnParticles(player.x + player.w, player.y + player.h / 2, '#fbbf24', 6, 120);
      }

      // Check side collisions with solid platforms
      for (const p of platforms) {
        if (p.type === 'fake' || p.crumbleState === 'gone') continue;
        if (player.y + player.h > p.y + 4 && player.y < p.y + p.h - 4) {
          if (prevX + player.w <= p.x && player.x + player.w > p.x) {
            player.x = p.x - player.w;
            player.vx = -Math.abs(player.vx) * 0.55;
            sfx.bonk();
            screenShake = 4;
          } else if (prevX >= p.x + p.w && player.x < p.x + p.w) {
            player.x = p.x + p.w;
            player.vx = Math.abs(player.vx) * 0.55;
            sfx.bonk();
            screenShake = 4;
          }
        }
      }

      // Vertical step & top/bottom platform collision
      const prevY = player.y;
      player.y += player.vy * dt;

      for (const p of platforms) {
        if (p.crumbleState === 'gone') continue;
        const horizOverlap = player.x + player.w > p.x + 2 && player.x < p.x + p.w - 2;
        if (!horizOverlap) continue;

        if (p.type === 'fake') {
          if (player.vy > 0 && prevY + player.h <= p.y + 6 && player.y + player.h >= p.y) {
            p.crumbleState = 'gone';
            p.crumbleTimer = 2.0;
            sfx.bonk();
            showToast("SIKE! That ledge was fake!", false, 2200);
            spawnParticles(p.x + p.w / 2, p.y + 8, '#f43f5e', 14, 150);
          }
          continue;
        }

        // Landing on top
        if (player.vy >= 0 && prevY + player.h <= p.y + 8 && player.y + player.h >= p.y) {
          player.y = p.y - player.h;

          if (p.type === 'bounce') {
            player.vy = -790;
            player.onGround = false;
            player.squashX = 0.7;
            player.squashY = 1.4;
            sfx.bounce();
            spawnParticles(p.x + p.w / 2, p.y, '#fb7185', 12, 160);
            break;
          }

          const fallDist = player.y - player.peakYOnJump;
          const impactVy = player.vy;

          player.vy = 0;
          player.onGround = true;
          player.standingPlatform = p;
          if (p.type !== 'ice') {
            player.vx = 0;
          }

          if (p.type === 'crumble' && p.crumbleState === 'intact') {
            p.crumbleState = 'shaking';
            p.crumbleTimer = 0.65;
          }

          if (p.hasFakeCheckpoint && !fakeCheckpointTriggered) {
            fakeCheckpointTriggered = true;
            showToast("CHECKPOINT REACHED!", true, 1200);
            spawnParticles(p.x + p.w / 2, p.y - 20, '#34d399', 22, 180);
            setTimeout(() => {
              if (state === 'playing') {
                sfx.sadTrombone();
                showToast("HAHA JUST KIDDING. NO CHECKPOINTS.", false, 2800);
              }
            }, 1300);
          }

          if (impactVy > SPLAT_VY || fallDist > BIG_FALL_THRESHOLD) {
            player.splatTimer = 0.4;
            screenShake = 7;
            sfx.splat();
            spawnParticles(player.x + player.w / 2, player.y + player.h, '#f43f5e', 14, 150);
            if (fallDist > BIG_FALL_THRESHOLD) {
              falls++;
              const metersLost = Math.round(fallDist / 30);
              const taunt = FALL_TAUNTS[Math.floor(Math.random() * FALL_TAUNTS.length)];
              showToast(`-${metersLost}m! ${taunt}`);
              if (fallDist > 550) sfx.sadTrombone();
            }
          } else {
            player.squashX = 1.2;
            player.squashY = 0.8;
          }

          // Check Victory
          if (p.type === 'goal') {
            state = 'won';
            sfx.victory();
            spawnParticles(player.x + player.w / 2, player.y, '#fbbf24', 45, 240);
            overlayTitleEl.textContent = 'YOU CONQUERED THE TOWER!';
            overlaySubtitleEl.textContent = 'Against all odds, gravity lost today.';
            overlayStatsEl.innerHTML = `
              <strong>Time:</strong> ${formatTime(elapsedSeconds)}<br/>
              <strong>Big Falls:</strong> ${falls}<br/>
              <strong>Peak Height:</strong> ${Math.round((START_Y - GOAL_Y) / 30)}m
            `;
            overlayStatsEl.classList.remove('hidden');
            startBtn.textContent = 'CLIMB AGAIN';
            overlayEl.classList.remove('hidden');
          }
          break;
        }

        // Ceiling bonk
        if (player.vy < 0 && prevY >= p.y + p.h - 4 && player.y < p.y + p.h) {
          player.y = p.y + p.h;
          player.vy = Math.abs(player.vy) * 0.25;
          sfx.bonk();
          screenShake = 5;
          player.bonkFlash = 1;
          spawnParticles(player.x + player.w / 2, player.y, '#fbbf24', 8, 120);
        }
      }

      // Bumper Collisions
      for (const b of bumpers) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        const dx = cx - b.x;
        const dy = cy - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < b.r + player.w * 0.48) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          player.vx = nx * 320;
          player.vy = Math.max(120, ny * 260);
          player.x = b.x + nx * (b.r + player.w * 0.55) - player.w / 2;
          player.y = b.y + ny * (b.r + player.w * 0.55) - player.h / 2;
          sfx.bonk();
          screenShake = 8;
          player.bonkFlash = 1;
          spawnParticles(b.x, b.y, '#f43f5e', 14, 180);
          showToast("BONKED BY AN ANGRY ORB!", false, 1800);
        }
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 400 * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }

    // Update ambient snow/dust
    for (const a of ambientParticles) {
      a.y += a.speed * dt;
      a.x += (windForce * 0.3) * dt;
      if (a.y > H) a.y = -4;
      if (a.x > W) a.x = 0;
      if (a.x < 0) a.x = W;
    }

    // Camera Follow
    const targetCamY = Math.max(0, Math.min(TOWER_HEIGHT - H, player.y - H * 0.55));
    cameraY += (targetCamY - cameraY) * 8 * dt;

    updateHUD();
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateHUD() {
    const heightPx = Math.max(0, START_Y - (player.y + player.h));
    const meters = Math.round(heightPx / 30);
    const totalMeters = Math.round((START_Y - GOAL_Y) / 30);
    const pct = Math.min(100, Math.max(0, Math.round((heightPx / (START_Y - GOAL_Y)) * 100)));

    if (meters > bestHeightMeters) {
      bestHeightMeters = meters;
      localStorage.setItem('tor_best_meters', String(bestHeightMeters));
    }

    statHeightEl.textContent = `${meters}m`;
    statBestEl.textContent = `${bestHeightMeters}m`;
    statFallsEl.textContent = String(falls);
    statTimeEl.textContent = formatTime(elapsedSeconds);
    progressFillEl.style.width = `${pct}%`;
    progressPctEl.textContent = `${pct}% (${meters} / ${totalMeters}m)`;

    if (mHeightEl) mHeightEl.textContent = `${meters}m`;
    if (mBestEl) mBestEl.textContent = `${bestHeightMeters}m`;
    if (mFallsEl) mFallsEl.textContent = String(falls);
    if (mPctEl) mPctEl.textContent = `${pct}%`;
    if (jumpChargeFillEl) {
      jumpChargeFillEl.style.width = (!hardcoreMode && player.charging) ? `${Math.round(player.charge * 100)}%` : '0%';
    }

    if (player.y > 3350) zoneNameEl.textContent = '1. The Mossy Dungeon';
    else if (player.y > 2200) zoneNameEl.textContent = '2. The Windy Spire';
    else if (player.y > 1100) zoneNameEl.textContent = '3. The Icy Peaks';
    else zoneNameEl.textContent = '4. The Golden Heaven';
  }

  // Render
  function render() {
    ctx.save();
    if (screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }

    // Dynamic Background Gradient by Camera Height
    const progress = 1 - cameraY / (TOWER_HEIGHT - H);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (progress < 0.3) {
      bgGrad.addColorStop(0, '#131824');
      bgGrad.addColorStop(1, '#090b10');
    } else if (progress < 0.6) {
      bgGrad.addColorStop(0, '#1e1b3a');
      bgGrad.addColorStop(1, '#101426');
    } else if (progress < 0.85) {
      bgGrad.addColorStop(0, '#0f2942');
      bgGrad.addColorStop(1, '#121a2f');
    } else {
      bgGrad.addColorStop(0, '#3b2610');
      bgGrad.addColorStop(1, '#17192b');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ambient particles (snow/dust)
    ctx.fillStyle = progress > 0.55 ? 'rgba(224, 242, 254, 0.35)' : 'rgba(148, 163, 184, 0.2)';
    for (const a of ambientParticles) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // World Space
    ctx.save();
    ctx.translate(0, -cameraY);

    // Background Tower Brick Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const startRow = Math.floor(cameraY / 60) * 60;
    for (let y = startRow; y < cameraY + H + 60; y += 60) {
      ctx.beginPath();
      ctx.moveTo(WALL_THICKNESS, y);
      ctx.lineTo(W - WALL_THICKNESS, y);
      ctx.stroke();
    }

    // Side Walls
    ctx.fillStyle = '#1e2538';
    ctx.fillRect(0, 0, WALL_THICKNESS, TOWER_HEIGHT);
    ctx.fillRect(W - WALL_THICKNESS, 0, WALL_THICKNESS, TOWER_HEIGHT);
    ctx.fillStyle = '#334155';
    ctx.fillRect(WALL_THICKNESS - 3, 0, 3, TOWER_HEIGHT);
    ctx.fillRect(W - WALL_THICKNESS, 0, 3, TOWER_HEIGHT);

    // Platforms
    for (const p of platforms) {
      if (p.y + p.h < cameraY - 40 || p.y > cameraY + H + 40) continue;
      if (p.crumbleState === 'gone') continue;

      let drawX = p.x;
      if (p.crumbleState === 'shaking') {
        drawX += (Math.random() - 0.5) * 5;
      }

      if (p.type === 'solid') {
        ctx.fillStyle = '#475569';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(drawX, p.y, p.w, 4);
      } else if (p.type === 'ice') {
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(drawX, p.y, p.w, 5);
      } else if (p.type === 'crumble') {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(drawX, p.y, p.w, 4);
      } else if (p.type === 'bounce') {
        ctx.fillStyle = '#9f1239';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(drawX + 4, p.y - 4, p.w - 8, 6);
      } else if (p.type === 'moving') {
        ctx.fillStyle = '#5b21b6';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#c4b5fd';
        ctx.fillRect(drawX, p.y, p.w, 4);
      } else if (p.type === 'fake') {
        ctx.fillStyle = 'rgba(71, 85, 105, 0.75)';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#f43f5e';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.label || 'SAFE', drawX + p.w / 2, p.y - 6);
      } else if (p.type === 'goal') {
        ctx.fillStyle = '#b45309';
        ctx.fillRect(drawX, p.y, p.w, p.h);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(drawX, p.y, p.w, 6);
        // Crown Icon
        const cx = drawX + p.w / 2;
        const cy = p.y - 16 + Math.sin(performance.now() * 0.005) * 4;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy + 12);
        ctx.lineTo(cx - 20, cy - 8);
        ctx.lineTo(cx - 8, cy + 2);
        ctx.lineTo(cx, cy - 12);
        ctx.lineTo(cx + 8, cy + 2);
        ctx.lineTo(cx + 20, cy - 8);
        ctx.lineTo(cx + 18, cy + 12);
        ctx.closePath();
        ctx.fill();
      }

      // Fake Checkpoint Flag
      if (p.hasFakeCheckpoint) {
        const fx = p.x + p.w - 22;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(fx, p.y - 34, 3, 34);
        ctx.fillStyle = fakeCheckpointTriggered ? '#f43f5e' : '#34d399';
        ctx.beginPath();
        ctx.moveTo(fx + 3, p.y - 34);
        ctx.lineTo(fx + 22, p.y - 26);
        ctx.lineTo(fx + 3, p.y - 18);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Angry Bumpers
    for (const b of bumpers) {
      if (b.y < cameraY - 40 || b.y > cameraY + H + 40) continue;
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Angry eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 6, b.y - 4, 4, 4);
      ctx.fillRect(b.x + 2, b.y - 4, 4, 4);
    }

    // Particles
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // Player ("Sir Sisyphus")
    const pw = player.w * player.squashX;
    const ph = player.h * player.squashY;
    const px = player.x + (player.w - pw) / 2;
    const py = player.y + (player.h - ph);

    ctx.fillStyle = player.bonkFlash > 0 ? '#f43f5e' : (player.charging ? '#fbbf24' : '#f8fafc');
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // Eyes
    const eyeOffsetX = player.facing * 3;
    ctx.fillStyle = '#0f172a';
    if (player.splatTimer > 0) {
      // X_X eyes
      ctx.fillRect(px + pw * 0.25, py + ph * 0.35, 5, 2);
      ctx.fillRect(px + pw * 0.6, py + ph * 0.35, 5, 2);
    } else if (player.vy > 520) {
      // Panicked wide eyes
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + pw * 0.25 + eyeOffsetX, py + ph * 0.25, 5, 7);
      ctx.fillRect(px + pw * 0.6 + eyeOffsetX, py + ph * 0.25, 5, 7);
    } else {
      ctx.fillRect(px + pw * 0.25 + eyeOffsetX, py + ph * 0.3, 4, 5);
      ctx.fillRect(px + pw * 0.6 + eyeOffsetX, py + ph * 0.3, 4, 5);
    }

    // Power Charge Bar
    if (player.charging && !hardcoreMode) {
      const barW = 38;
      const barH = 6;
      const bx = player.x + player.w / 2 - barW / 2;
      const by = player.y - 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = player.charge > 0.85 ? '#f43f5e' : '#fbbf24';
      ctx.fillRect(bx, by, barW * player.charge, barH);
    }

    ctx.restore(); // end world space

    // Wind HUD Indicator (in screen space)
    if (Math.abs(windForce) > 25 && state === 'playing') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(W / 2 - 70, 14, 140, 26);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(windForce > 0 ? 'WIND  >>>' : '<<<  WIND', W / 2, 31);
    }

    ctx.restore();
  }

  // Fixed Timestep Loop
  let lastTime = performance.now();
  let accumulator = 0;
  const FIXED_DT = 1 / 60;

  function loop(now) {
    const frameDt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += frameDt;

    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(loop);
  }

  // Initialize HUD on load
  updateHUD();
  requestAnimationFrame(loop);
})();

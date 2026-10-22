(() => {
  "use strict";

  // Tunable rules. Speeds are in pixels per second. Intervals are in seconds.
  const CONFIG = {
    startLives: 3,
    coinPoints: 10,
    countdownSeconds: 3,
    bestScoreKey: "coinCatcher.bestScore",
    muteKey: "coinCatcher.muted",
    baseFallSpeed: 180,
    maxFallSpeed: 540,
    baseSpawnInterval: 0.95,
    minSpawnInterval: 0.34,
    baseBombChance: 0.16,
    maxBombChance: 0.36,
    difficultyScoreSpan: 800,
    basketSpeed: 720,
    pointerFollow: 18,
    invulnTime: 1.05,
    endingDelay: 0.7,
    maxDt: 0.033,
    maxEntities: 24,
    masterGain: 0.28,
  };

  const PALETTE = {
    skyTop: "#3a27d6",
    skyMid: "#6d4bff",
    skyBottom: "#2aa4ff",
    coinLight: "#fff7c4",
    coinMid: "#ffd24a",
    coinDeep: "#e08a00",
    coinRim: "#b86a00",
    bombLight: "#5c5c70",
    bombMid: "#2a2a38",
    bombDeep: "#12121a",
    basketLight: "#ffe0a8",
    basketDeep: "#ef7a2f",
    basketRim: "#fff4c8",
    basketRimDeep: "#f0b429",
    basketHole: "#6a3d22",
    basketInk: "#3b2416",
  };

  const FONT = '"Avenir Next", "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  const COIN_PARTICLES = ["#fff7c8", "#ffd84a", "#ffffff", "#ffe9a0"];
  const BOMB_PARTICLES = ["#ff6b6b", "#ffb020", "#ffd0c8", "#ff3b3b"];

  const app = document.getElementById("app");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const safeProbe = document.getElementById("safeProbe");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const livesEl = document.getElementById("lives");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const iconPause = document.getElementById("iconPause");
  const iconResume = document.getElementById("iconResume");
  const iconSound = document.getElementById("iconSound");
  const iconMuted = document.getElementById("iconMuted");
  const overlay = document.getElementById("overlay");
  const backdrop = document.getElementById("backdrop");
  const menuPanel = document.getElementById("menuPanel");
  const playBtn = document.getElementById("playBtn");
  const countPanel = document.getElementById("countPanel");
  const countNum = document.getElementById("countNum");
  const pausePanel = document.getElementById("pausePanel");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");
  const overPanel = document.getElementById("overPanel");
  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const finalCaughtEl = document.getElementById("finalCaught");
  const newBestEl = document.getElementById("newBest");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keys = { left: false, right: false };
  const view = { w: 0, h: 0 };
  const metrics = { coinR: 16, bombR: 17 };
  const basket = { x: 0, y: 0, w: 110, h: 60, vx: 0, squash: 1 };

  let dpr = 1;
  let safeBottomPx = 0;
  let state = "menu";
  let score = 0;
  let lives = CONFIG.startLives;
  let bestScore = 0;
  let muted = false;
  let bgTime = 0;
  let countdown = CONFIG.countdownSeconds;
  let countdownLabel = "";
  let endingTimer = 0;
  let invuln = 0;
  let shake = 0;
  let spawnTimer = 0.5;
  let spawns = 0;
  let recentBombs = 0;
  let lastSpawnX = -9999;
  let pointerX = null;
  let suppressPointer = false;
  let aimed = false;
  let lastFrame = 0;
  let backdropStamp = "";

  const entities = [];
  const particles = [];
  const rings = [];
  const floaters = [];
  let stars = [];
  let shapes = [];

  const sound = createAudio();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function approach(current, target, maxDelta) {
    const delta = target - current;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
  }

  function compact(list, keep) {
    let write = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (keep(list[i])) list[write++] = list[i];
    }
    list.length = write;
  }

  function difficulty() {
    const eased = smoothstep(score / CONFIG.difficultyScoreSpan);
    const heightScale = view.h ? clamp(view.h / 780, 0.72, 1.3) : 1;
    return {
      fall: lerp(CONFIG.baseFallSpeed, CONFIG.maxFallSpeed, eased) * heightScale,
      interval: lerp(CONFIG.baseSpawnInterval, CONFIG.minSpawnInterval, eased),
      bombChance: lerp(CONFIG.baseBombChance, CONFIG.maxBombChance, eased),
    };
  }

  function createAudio() {
    let audioCtx = null;
    let master = null;

    function ensure() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      if (!audioCtx) {
        audioCtx = new AudioCtx();
        master = audioCtx.createGain();
        master.gain.value = muted ? 0 : CONFIG.masterGain;
        master.connect(audioCtx.destination);
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      return true;
    }

    function tone(freq, duration, type, volume, delay = 0, endFreq = 0) {
      if (!ensure()) return;
      try {
        toneNow(freq, duration, type, volume, delay, endFreq);
      } catch (err) {
        /* A failed blip should never stop the game. */
      }
    }

    function toneNow(freq, duration, type, volume, delay, endFreq) {
      const start = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (endFreq > 0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);
      }
      gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    function noise(duration, volume, delay = 0) {
      if (!ensure()) return;
      try {
        noiseNow(duration, volume, delay);
      } catch (err) {
        /* Ignore audio failures. */
      }
    }

    function noiseNow(duration, volume, delay) {
      const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
      const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const start = audioCtx.currentTime + delay;
      const source = audioCtx.createBufferSource();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = 420;
      gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    return {
      ensure,
      setMuted(isMuted) {
        if (!master || !audioCtx) return;
        master.gain.setTargetAtTime(isMuted ? 0 : CONFIG.masterGain, audioCtx.currentTime, 0.015);
      },
      coin() {
        const bend = 0.97 + Math.random() * 0.06;
        tone(880 * bend, 0.08, "triangle", 0.16);
        tone(1320 * bend, 0.12, "sine", 0.1, 0.05);
      },
      bomb() {
        noise(0.24, 0.28);
        tone(150, 0.26, "sawtooth", 0.1, 0, 48);
      },
      gameOver() {
        tone(494, 0.16, "triangle", 0.14, 0);
        tone(392, 0.18, "triangle", 0.14, 0.16);
        tone(262, 0.4, "triangle", 0.16, 0.32);
      },
      tick(step) {
        const notes = { 1: 880, 2: 740, 3: 620 };
        tone(notes[step] || 660, 0.07, "sine", 0.12);
      },
      go() {
        tone(523, 0.08, "triangle", 0.12, 0);
        tone(784, 0.14, "triangle", 0.14, 0.08);
      },
    };
  }

  function loadPersistent() {
    try {
      const storedBest = Number.parseInt(localStorage.getItem(CONFIG.bestScoreKey) || "0", 10);
      bestScore = Number.isFinite(storedBest) && storedBest > 0 ? storedBest : 0;
      muted = localStorage.getItem(CONFIG.muteKey) === "1";
    } catch (err) {
      bestScore = 0;
      muted = false;
    }
  }

  function persistBest() {
    try {
      localStorage.setItem(CONFIG.bestScoreKey, String(bestScore));
    } catch (err) {
      /* Private mode and blocked storage should not stop the game. */
    }
  }

  function persistMute() {
    try {
      localStorage.setItem(CONFIG.muteKey, muted ? "1" : "0");
    } catch (err) {
      /* Ignore storage failures. */
    }
  }

  function renderMute() {
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    muteBtn.title = muted ? "Unmute" : "Mute";
    iconSound.hidden = muted;
    iconMuted.hidden = !muted;
  }

  function renderHearts() {
    if (livesEl.childElementCount !== CONFIG.startLives) {
      livesEl.replaceChildren();
      for (let i = 0; i < CONFIG.startLives; i += 1) {
        const heart = document.createElement("span");
        heart.className = "heart";
        heart.textContent = "♥";
        heart.setAttribute("aria-hidden", "true");
        livesEl.appendChild(heart);
      }
    }
    Array.from(livesEl.children).forEach((heart, index) => {
      heart.classList.toggle("is-full", index < lives);
    });
    const label = `${Math.max(0, lives)} ${lives === 1 ? "life" : "lives"} left`;
    livesEl.setAttribute("aria-label", label);
  }

  function syncHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(bestScore);
    renderHearts();
  }

  function addScore(points) {
    score += points;
    scoreEl.textContent = String(score);
    scoreEl.classList.remove("bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
  }

  function toggleMute() {
    sound.ensure();
    muted = !muted;
    persistMute();
    sound.setMuted(muted);
    renderMute();
  }

  function flashHurt() {
    app.classList.remove("is-hurt");
    void app.offsetWidth;
    app.classList.add("is-hurt");
  }

  function popElement(el) {
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  function setOverlay(name) {
    overlay.hidden = name === "none";
    overlay.classList.toggle("is-countdown", name === "countdown");
    backdrop.hidden = name === "countdown" || name === "none";
    menuPanel.hidden = name !== "menu";
    countPanel.hidden = name !== "countdown";
    pausePanel.hidden = name !== "paused";
    overPanel.hidden = name !== "gameover";
  }

  function applyState() {
    app.dataset.state = state;
    const showPause = state === "playing" || state === "countdown" || state === "paused";
    pauseBtn.hidden = !showPause;
    const resuming = state === "paused";
    pauseBtn.classList.toggle("is-resume", resuming);
    iconPause.hidden = resuming;
    iconResume.hidden = !resuming;
    pauseBtn.title = resuming ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-label", resuming ? "Resume" : "Pause");
  }

  function resetRun() {
    score = 0;
    lives = CONFIG.startLives;
    entities.length = 0;
    particles.length = 0;
    rings.length = 0;
    floaters.length = 0;
    spawnTimer = 0.42;
    spawns = 0;
    recentBombs = 0;
    lastSpawnX = -9999;
    invuln = 0;
    shake = 0;
    endingTimer = 0;
    basket.squash = 1;
    basket.vx = 0;
    scoreEl.classList.remove("bump");
    overPanel.classList.remove("is-record");
    syncHud();
  }

  function syncCountdown() {
    const label = String(Math.max(1, Math.ceil(countdown)));
    if (label === countdownLabel) return;
    countdownLabel = label;
    countNum.textContent = label;
    popElement(countNum);
    sound.tick(Number(label));
  }

  function beginCountdown() {
    state = "countdown";
    countdown = CONFIG.countdownSeconds;
    countdownLabel = "";
    setOverlay("countdown");
    applyState();
    syncCountdown();
  }

  function startGame() {
    sound.ensure();
    resetRun();
    beginCountdown();
  }

  function pauseGame() {
    if (state !== "playing" && state !== "countdown") return;
    state = "paused";
    keys.left = false;
    keys.right = false;
    setOverlay("paused");
    applyState();
  }

  function resumeGame() {
    if (state !== "paused") return;
    sound.ensure();
    beginCountdown();
  }

  function enterGameOver() {
    if (state === "gameover") return;
    state = "gameover";
    const isNew = score > bestScore;
    if (isNew) {
      bestScore = score;
      persistBest();
    }
    const coins = Math.round(score / CONFIG.coinPoints);
    finalScoreEl.textContent = String(score);
    finalBestEl.textContent = String(bestScore);
    finalCaughtEl.textContent = coins === 1 ? "1 coin caught" : `${coins} coins caught`;
    newBestEl.hidden = !isNew;
    overPanel.classList.toggle("is-record", isNew);
    setOverlay("gameover");
    applyState();
    syncHud();
    sound.gameOver();
  }

  function makeBackdrop() {
    const area = Math.max(1, view.w * view.h);
    const starCount = Math.round(clamp(area / 15000, 28, 100));
    stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * view.w,
      y: Math.random() * view.h,
      r: Math.random() * 1.7 + 0.4,
      speed: 8 + Math.random() * 20,
      twinkle: 0.6 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    }));
    shapes = Array.from({ length: 7 }, (_, index) => ({
      nx: Math.random(),
      ny: Math.random(),
      r: 16 + Math.random() * 54,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      vx: (Math.random() - 0.5) * 0.012,
      vy: -(0.008 + Math.random() * 0.016),
      kind: index % 2 === 0 ? "circle" : "diamond",
      alpha: 0.045 + Math.random() * 0.07,
    }));
    backdropStamp = `${Math.round(view.w / 80)}x${Math.round(view.h / 80)}`;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const prevW = view.w;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = width;
    view.h = height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    safeBottomPx = safeProbe.offsetHeight || 0;

    const shortSide = Math.min(width, height);
    basket.w = clamp(shortSide * 0.2, 68, 128);
    basket.h = basket.w * (60 / 110);
    metrics.coinR = clamp(shortSide * 0.031, 13, 22);
    metrics.bombR = metrics.coinR * 1.08;

    if (prevW > 0) basket.x *= width / prevW;
    else basket.x = width / 2;
    basket.y = height - basket.h - (32 + safeBottomPx);

    const stamp = `${Math.round(width / 80)}x${Math.round(height / 80)}`;
    if (!stars.length || stamp !== backdropStamp) makeBackdrop();
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    pointerX = clamp(event.clientX - rect.left, 0, rect.width);
    suppressPointer = false;
  }

  function burst(x, y, colors, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random());
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 36,
        age: 0,
        life: 0.28 + Math.random() * 0.32,
        size: 2 + Math.random() * 3.2,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function spawnRing(x, y, color) {
    rings.push({ x, y, radius: 8, vr: 150, age: 0, life: 0.34, color });
    if (rings.length > 24) rings.shift();
  }

  function spawnFloater(x, y, text) {
    floaters.push({ x, y, text, age: 0, life: 0.7, vy: -64 });
    if (floaters.length > 16) floaters.shift();
  }

  function collectCoin(entity) {
    if (entity.caught) return;
    entity.caught = true;
    entity.popT = 0;
    addScore(CONFIG.coinPoints);
    burst(entity.x, entity.y, COIN_PARTICLES, 16, 180);
    spawnRing(entity.x, entity.y, "rgba(255, 220, 90, 0.95)");
    spawnFloater(entity.x, entity.y - 8, `+${CONFIG.coinPoints}`);
    basket.squash = 0.78;
    sound.coin();
  }

  function fizzleBomb(entity) {
    entity.dead = true;
    burst(entity.x, entity.y, BOMB_PARTICLES, 6, 80);
  }

  function hitBomb(entity) {
    if (entity.dead || invuln > 0) return;
    entity.dead = true;
    lives = Math.max(0, lives - 1);
    invuln = CONFIG.invulnTime;
    shake = reduceMotion ? 2.5 : 8;
    basket.squash = 1.16;
    burst(entity.x, entity.y, BOMB_PARTICLES, 18, 220);
    spawnRing(entity.x, entity.y, "rgba(255, 80, 90, 0.95)");
    flashHurt();
    renderHearts();
    sound.bomb();
    if (lives <= 0) {
      state = "ending";
      endingTimer = CONFIG.endingDelay;
      invuln = 999;
      applyState();
    }
  }

  function spawnItem() {
    if (entities.length >= CONFIG.maxEntities) {
      spawnTimer = 0.2;
      return;
    }
    const diff = difficulty();
    let type = "coin";
    if (spawns > 0 && recentBombs < 2 && Math.random() < diff.bombChance) type = "bomb";
    spawns += 1;
    recentBombs = type === "bomb" ? recentBombs + 1 : 0;

    const radius = type === "coin" ? metrics.coinR : metrics.bombR;
    const margin = Math.max(20, radius + 10);
    const span = Math.max(1, view.w - margin * 2);
    let x = margin + Math.random() * span;
    if (lastSpawnX > 0 && Math.abs(x - lastSpawnX) < Math.min(90, span * 0.35)) {
      x = margin + ((x - margin + span * 0.5) % span);
    }
    lastSpawnX = x;
    const y = -radius * 2.6;
    entities.push({
      type,
      x,
      y,
      prevY: y,
      r: radius,
      vy: diff.fall * (0.86 + Math.random() * 0.28),
      spin: Math.random() * Math.PI * 2,
      spinSpeed: type === "coin" ? (2 + Math.random() * 2.6) * (Math.random() < 0.5 ? -1 : 1) : 2,
      caught: false,
      dead: false,
      popT: 0,
    });
    spawnTimer = diff.interval * (0.75 + Math.random() * 0.5);
  }

  function intersectsCatch(entity) {
    const radius = entity.type === "bomb" ? entity.r * 0.82 : entity.r * 1.02;
    const scale = entity.type === "bomb" ? 0.98 : 1.08;
    const half = (basket.w * scale) / 2;
    const top = basket.y + basket.h * 0.02;
    const bottom = basket.y + basket.h * 0.78;
    const closestX = clamp(entity.x, basket.x - half, basket.x + half);
    const closestY = clamp(entity.y, top, bottom);
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    if (dx * dx + dy * dy <= radius * radius) return true;

    const prevY = entity.prevY ?? entity.y;
    return prevY < top && entity.y + radius >= top && Math.abs(entity.x - basket.x) <= half + radius * 0.2;
  }

  function updateBasket(dt) {
    basket.y = view.h - basket.h - (32 + safeBottomPx);
    if (state === "gameover") return;

    if (state !== "paused") {
      basket.squash += (1 - basket.squash) * Math.min(1, dt * 10);
    }

    const axis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const speed = CONFIG.basketSpeed * clamp(view.w / 900, 0.62, 1.2);
    if (axis !== 0 || Math.abs(basket.vx) > 1) {
      aimed = true;
      suppressPointer = true;
      basket.vx = approach(basket.vx, axis * speed, 3400 * dt);
      basket.x += basket.vx * dt;
    } else if (!suppressPointer && pointerX != null) {
      aimed = true;
      const blend = 1 - Math.exp(-CONFIG.pointerFollow * dt);
      basket.x += (pointerX - basket.x) * blend;
      basket.vx = 0;
    } else if (state === "menu" && !aimed && !reduceMotion) {
      const amp = Math.min(70, view.w * 0.1);
      basket.x = view.w * 0.5 + Math.sin(bgTime * 0.85) * amp;
      basket.vx = 0;
    }

    const pad = basket.w / 2 + 8;
    if (view.w > pad * 2) basket.x = clamp(basket.x, pad, view.w - pad);
  }

  function updateEntities(dt, collide) {
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.caught) {
        entity.popT += dt;
        if (entity.popT > 0.18) entity.dead = true;
        continue;
      }
      entity.prevY = entity.y;
      entity.y += entity.vy * dt;
      entity.spin += entity.spinSpeed * dt;
      if (entity.y - entity.r > view.h + 36) entity.dead = true;
    }

    if (collide) {
      for (let i = 0; i < entities.length; i += 1) {
        const entity = entities[i];
        if (entity.dead || entity.caught || !intersectsCatch(entity)) continue;
        if (entity.type === "coin") collectCoin(entity);
        else if (invuln > 0) fizzleBomb(entity);
        else hitBomb(entity);
      }
    }

    compact(entities, (entity) => !entity.dead);
  }

  function updateCountdown(dt) {
    countdown -= dt;
    if (countdown <= 0) {
      state = "playing";
      countdownLabel = "";
      setOverlay("none");
      applyState();
      sound.go();
      return;
    }
    syncCountdown();
  }

  function update(dt) {
    if (view.w < 2 || view.h < 2) return;
    bgTime += dt;

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      star.y -= star.speed * dt;
      if (star.y < -4) {
        star.y = view.h + 4;
        star.x = Math.random() * view.w;
      }
    }

    for (let i = 0; i < shapes.length; i += 1) {
      const shape = shapes[i];
      shape.nx += shape.vx * dt;
      shape.ny += shape.vy * dt;
      shape.rot += shape.vr * dt;
      if (shape.ny < -0.2) shape.ny = 1.15;
      if (shape.nx < -0.15) shape.nx = 1.1;
      if (shape.nx > 1.15) shape.nx = -0.1;
    }

    updateBasket(dt);

    if (state === "countdown") updateCountdown(dt);
    else if (state === "playing") {
      invuln = Math.max(0, invuln - dt);
      spawnTimer -= dt;
      if (spawnTimer <= 0) spawnItem();
      updateEntities(dt, true);
    } else if (state === "ending") {
      endingTimer -= dt;
      if (endingTimer <= 0) enterGameOver();
    }

    if (state !== "paused") {
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        particle.age += dt;
        particle.vy += 460 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      compact(particles, (particle) => particle.age < particle.life);

      for (let i = 0; i < rings.length; i += 1) {
        const ring = rings[i];
        ring.age += dt;
        ring.radius += ring.vr * dt;
      }
      compact(rings, (ring) => ring.age < ring.life);

      for (let i = 0; i < floaters.length; i += 1) {
        const floater = floaters[i];
        floater.age += dt;
        floater.y += floater.vy * dt;
      }
      compact(floaters, (floater) => floater.age < floater.life);

      if (shake > 0) {
        shake *= Math.exp(-5.4 * dt);
        if (shake < 0.25) shake = 0;
      }
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.48, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, view.w + 80, view.h + 80);

    for (let i = 0; i < shapes.length; i += 1) {
      const shape = shapes[i];
      ctx.save();
      ctx.translate(shape.nx * view.w, shape.ny * view.h);
      ctx.rotate(shape.rot);
      ctx.fillStyle = `rgba(255,255,255,${shape.alpha})`;
      ctx.beginPath();
      if (shape.kind === "circle") {
        ctx.arc(0, 0, shape.r, 0, Math.PI * 2);
      } else {
        ctx.moveTo(0, -shape.r);
        ctx.lineTo(shape.r * 0.72, 0);
        ctx.lineTo(0, shape.r);
        ctx.lineTo(-shape.r * 0.72, 0);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      const alpha = 0.25 + Math.abs(Math.sin(bgTime * star.twinkle + star.phase)) * 0.75;
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const floor = ctx.createLinearGradient(0, view.h - 140, 0, view.h);
    floor.addColorStop(0, "rgba(18, 0, 60, 0)");
    floor.addColorStop(1, "rgba(18, 0, 60, 0.28)");
    ctx.fillStyle = floor;
    ctx.fillRect(-40, view.h - 140, view.w + 80, 180);

    const vignette = ctx.createRadialGradient(
      view.w * 0.5,
      view.h * 0.45,
      view.h * 0.2,
      view.w * 0.5,
      view.h * 0.5,
      view.h * 0.78
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(24, 0, 60, 0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(-40, -40, view.w + 80, view.h + 80);
  }

  function drawSparkle(x, y, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const outer = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const inner = outer + Math.PI / 4;
      ctx.lineTo(Math.cos(outer) * radius, Math.sin(outer) * radius);
      ctx.lineTo(Math.cos(inner) * radius * 0.32, Math.sin(inner) * radius * 0.32);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCoin(entity) {
    const squash = 0.28 + 0.72 * Math.abs(Math.cos(entity.spin));
    const pop = entity.caught ? clamp(entity.popT / 0.18, 0, 1) : 0;
    ctx.save();
    ctx.translate(entity.x, entity.y);
    if (pop > 0) {
      ctx.globalAlpha = 1 - pop;
      ctx.scale(1 + pop * 1.35, 1 + pop * 1.35);
    }
    ctx.fillStyle = "rgba(70, 30, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, entity.r * 0.95, entity.r * squash * 0.72, entity.r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(squash, 1);

    const glow = ctx.createRadialGradient(-entity.r * 0.32, -entity.r * 0.38, entity.r * 0.15, 0, 0, entity.r);
    glow.addColorStop(0, PALETTE.coinLight);
    glow.addColorStop(0.48, PALETTE.coinMid);
    glow.addColorStop(1, PALETTE.coinDeep);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, entity.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, entity.r * 0.12);
    ctx.strokeStyle = PALETTE.coinRim;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, entity.r * 0.64, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 250, 230, 0.9)";
    ctx.lineWidth = Math.max(1.5, entity.r * 0.08);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.beginPath();
    ctx.ellipse(Math.sin(entity.spin) * entity.r * 0.18 - entity.r * 0.12, -entity.r * 0.28, entity.r * 0.26, entity.r * 0.14, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!entity.caught && squash > 0.72) {
      drawSparkle(entity.x - entity.r * 0.22, entity.y - entity.r * 0.2, Math.max(3, entity.r * 0.22));
    }
  }

  function drawBomb(entity) {
    const pulse = 1 + Math.sin(bgTime * 6 + entity.spin) * 0.035;
    const flicker = 0.7 + Math.sin(bgTime * 32 + entity.spin) * 0.3;
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.scale(pulse, pulse);

    ctx.beginPath();
    ctx.arc(0, 0, entity.r + 6 + Math.sin(bgTime * 8 + entity.spin) * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 70, 80, 0.78)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "#6b4423";
    ctx.lineWidth = Math.max(2.5, entity.r * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(entity.r * 0.1, -entity.r * 0.72);
    ctx.quadraticCurveTo(entity.r * 0.55, -entity.r * 1.25, entity.r * 0.82, -entity.r * 1.55);
    ctx.stroke();

    const sparkX = entity.r * 0.82;
    const sparkY = -entity.r * 1.55;
    ctx.fillStyle = `rgba(255, 213, 106, ${0.75 + flicker * 0.25})`;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 4.2 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff7a18";
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 2.1 * flicker, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(-entity.r * 0.35, -entity.r * 0.4, entity.r * 0.1, 0, 0, entity.r);
    body.addColorStop(0, PALETTE.bombLight);
    body.addColorStop(0.45, PALETTE.bombMid);
    body.addColorStop(1, PALETTE.bombDeep);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, entity.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(-entity.r * 0.28, -entity.r * 0.32, entity.r * 0.28, entity.r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function traceBasketBody() {
    ctx.beginPath();
    ctx.moveTo(-55, 2);
    ctx.bezierCurveTo(-52, 24, -42, 40, -36, 50);
    ctx.quadraticCurveTo(0, 66, 36, 50);
    ctx.bezierCurveTo(42, 40, 52, 24, 55, 2);
    ctx.closePath();
  }

  function drawBasket() {
    ctx.save();
    ctx.translate(basket.x, basket.y + basket.h + 6);
    ctx.fillStyle = "rgba(24, 0, 60, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 0, basket.w * 0.34, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const scale = basket.w / 110;
    const extra = 1 + (1 - basket.squash) * 0.45;
    ctx.save();
    ctx.translate(basket.x, basket.y);
    ctx.scale(scale * extra, scale * basket.squash);
    if (invuln > 0 && state !== "menu" && state !== "gameover") {
      ctx.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(bgTime * 28));
    }

    const body = ctx.createLinearGradient(0, 0, 0, 60);
    body.addColorStop(0, PALETTE.basketLight);
    body.addColorStop(1, PALETTE.basketDeep);
    ctx.fillStyle = body;
    traceBasketBody();
    ctx.fill();

    ctx.save();
    traceBasketBody();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const y = 10 + i * 9;
      ctx.beginPath();
      ctx.moveTo(-60, y);
      ctx.lineTo(60, y + 7);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(-16, 28, 8, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#c45e1a";
    traceBasketBody();
    ctx.stroke();

    ctx.fillStyle = PALETTE.basketInk;
    ctx.beginPath();
    ctx.arc(-16, 30, 3.1, 0, Math.PI * 2);
    ctx.arc(16, 30, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-14.8, 28.8, 1.15, 0, Math.PI * 2);
    ctx.arc(17.2, 28.8, 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = PALETTE.basketInk;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 32, 9, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 110, 130, 0.48)";
    ctx.beginPath();
    ctx.ellipse(-30, 34, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.ellipse(30, 34, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const rim = ctx.createLinearGradient(0, -10, 0, 10);
    rim.addColorStop(0, "#fffaf0");
    rim.addColorStop(0.45, PALETTE.basketRim);
    rim.addColorStop(1, PALETTE.basketRimDeep);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(0, 2, 55, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();

    ctx.fillStyle = PALETTE.basketHole;
    ctx.beginPath();
    ctx.ellipse(0, 2, 42, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.ellipse(-10, 0.5, 14, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (invuln > 0 && lives > 0 && state !== "menu") {
      ctx.save();
      ctx.translate(basket.x, basket.y + basket.h * 0.48);
      ctx.strokeStyle = `rgba(186, 230, 255, ${0.35 + 0.3 * Math.sin(bgTime * 20)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, basket.w * 0.62, basket.h * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFx() {
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      ctx.save();
      ctx.globalAlpha = 1 - ring.age / ring.life;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      ctx.save();
      ctx.globalAlpha = 1 - particle.age / particle.life;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    for (let i = 0; i < floaters.length; i += 1) {
      const floater = floaters[i];
      ctx.globalAlpha = 1 - floater.age / floater.life;
      ctx.strokeStyle = "rgba(90, 40, 0, 0.35)";
      ctx.fillStyle = "#fff6c8";
      ctx.strokeText(floater.text, floater.x, floater.y);
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function draw() {
    if (view.w < 2 || view.h < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, view.w, view.h);
    const magnitude = shake;
    const ox = magnitude > 0 ? (Math.random() - 0.5) * magnitude : 0;
    const oy = magnitude > 0 ? (Math.random() - 0.5) * magnitude : 0;
    ctx.save();
    ctx.translate(ox, oy);
    drawBackground();

    entities.sort((a, b) => a.y - b.y);
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.caught) continue;
      if (entity.type === "coin") drawCoin(entity);
      else drawBomb(entity);
    }

    drawBasket();

    for (let i = 0; i < entities.length; i += 1) {
      if (entities[i].caught) drawCoin(entities[i]);
    }

    drawFx();
    ctx.restore();
  }

  function frame(now) {
    const dt = lastFrame ? Math.min(CONFIG.maxDt, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (view.w < 2) resize();
    if (dt > 0) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function onKeyDown(event) {
    const key = event.key;
    const typingTarget = event.target.closest && event.target.closest("button, input, textarea, a");
    if (key.startsWith("Arrow") || (key === " " && !typingTarget)) event.preventDefault();

    if (key === "ArrowLeft" || key === "a" || key === "A") {
      keys.left = true;
      suppressPointer = true;
      return;
    }
    if (key === "ArrowRight" || key === "d" || key === "D") {
      keys.right = true;
      suppressPointer = true;
      return;
    }
    if (event.repeat) return;

    if (key === "m" || key === "M") {
      toggleMute();
      return;
    }

    if (key === "Enter") {
      if (typingTarget) return;
      if (state === "menu" || state === "gameover") startGame();
      else if (state === "paused") resumeGame();
      return;
    }

    if (key === " " || key === "p" || key === "P" || key === "Escape") {
      if (typingTarget) return;
      if (state === "menu" || state === "gameover") {
        if (key !== "Escape") startGame();
      } else if (state === "paused") resumeGame();
      else if (state === "playing" || state === "countdown") pauseGame();
    }
  }

  function onKeyUp(event) {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") keys.left = false;
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") keys.right = false;
  }

  function bindInput() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      keys.left = false;
      keys.right = false;
    });
    document.addEventListener("visibilitychange", () => {
      lastFrame = performance.now();
      if (document.hidden && (state === "playing" || state === "countdown")) pauseGame();
    });

    app.addEventListener("pointermove", updatePointer, { passive: true });
    app.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      updatePointer(event);
    });
    app.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => resize());
      observer.observe(app);
    }
    window.addEventListener("resize", resize);
  }

  function bindUi() {
    playBtn.addEventListener("click", startGame);
    restartBtn.addEventListener("click", startGame);
    resumeBtn.addEventListener("click", resumeGame);
    pauseBtn.addEventListener("click", () => {
      sound.ensure();
      if (state === "paused") resumeGame();
      else pauseGame();
    });
    muteBtn.addEventListener("click", toggleMute);
  }

  loadPersistent();
  renderMute();
  syncHud();
  setOverlay("menu");
  applyState();
  bindInput();
  bindUi();
  resize();
  requestAnimationFrame(frame);
})();

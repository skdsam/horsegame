/* ============================================================================
 * Horse Rally 3D — Main Race Simulation, UI Binding & Game Loop
 * Preserves 100% of original horse.html gameplay, rules, odds, players & controls
 * ============================================================================ */

import {
  BASE_FALL_PROB,
  CAMERA_MODES,
  COLORS,
  FURLONG_CHOICES,
  HORSE_NAMES,
  JOCKEYS,
  JUMP_DUR,
  LANES_Y_2D,
   LANES_Z,
  LAST_TMPL,
  NUM_HORSES,
  OWNERS,
  POS,
  PX_PER_FURLONG,
  RACE_ICONS,
  SIM_TO_M,
  START_X,
  STATE,
  TRAINERS,
  WEATHER_ICONS,
  clamp,
  getSeed,
  lerp,
  pick,
  rand,
  randi,
  random,
  randomOdds,
  setSeed
} from "./config.js";
import { SceneManager3D } from "./scene3d.js";
import { updateHorseActorAnimation } from "./horse3d.js";
import { RaceAudioEngine } from "./audio.js";

/* ======================== Game State ========================= */
let gameState = STATE.BOARD;
let useHedges = false;
let weather = "Clear";
let speedFactor = 1;
let windForce = 0;
let fallProb = BASE_FALL_PROB;

let raceFurlongs = 12;
let RACE_DISTANCE = raceFurlongs * PX_PER_FURLONG;
let FINISH_X = START_X + RACE_DISTANCE;
let HEDGES_X = [];

let startTime = 0;
let lastTs = 0;
let commentaryTs = 0;
const commentaryInterval = 950;
let commentary = "";

let horses = [];
let baseCard = [];
let playerPick = null;
let players = [];
let finishTimes = [];
let fallen = [];
let jumpStart = [];
const model = [];
let currentLeader = -1;
let leaderSince = 0;
let gateOpenProgress = 0;
let photoFinishTriggered = false;
let slowMoTimer = 0;

/* Subsystems */
let scene3d = null;
const audio = new RaceAudioEngine();

/* DOM Elements */
const tbody = document.getElementById("tbodyHorses");
const legendEl = document.getElementById("legend");
const metaEl = document.getElementById("raceMeta");
const trevorEl = document.getElementById("trevorPreview");
const comEl = document.getElementById("commentary");
const weatherChip = document.getElementById("weatherChip");
const weatherTop = document.getElementById("weatherTop");
const banner = document.getElementById("finishBanner");
const bannerTitle = document.getElementById("finishTitle");
const bannerGrid = document.getElementById("finishGrid");
const playersResultEl = document.getElementById("playersResult");
const startModal = document.getElementById("startModal");
const btnStart = document.getElementById("btnStart");
const playersUI = document.getElementById("playersUI");
const playerNameInp = document.getElementById("playerName");
const playerHorseSel = document.getElementById("playerHorse");
const formList = document.getElementById("formList");
const countdownEl = document.getElementById("countdown");
const countNumEl = document.getElementById("countNum");
const flashEl = document.getElementById("flash");
const raceTypeChip = document.getElementById("raceTypeChip");
const distanceChip = document.getElementById("distanceChip");
const raceCard = document.getElementById("raceCard");
const panelBoard = document.getElementById("panelBoard");
const btnToggleBoard = document.getElementById("btnToggleBoard");
const btnCameraMode = document.getElementById("btnCameraMode");
const btnAudioMute = document.getElementById("btnAudioMute");
const btnVoiceToggle = document.getElementById("btnVoiceToggle");
const btnDebugDrawer = document.getElementById("btnDebugDrawer");
const debugDrawer = document.getElementById("debugDrawer");
const telemetryEl = document.getElementById("telemetryStats");
const seedInput = document.getElementById("seedInput");

/* ============================ Course & Card Setup ============================= */
function buildHedges() {
  HEDGES_X = [];
  if (!useHedges) return;
  const n = Math.max(3, Math.round(raceFurlongs / 2)); // 5f→3, 12f→6, 18f→9
  for (let i = 0; i < n; i++) {
    const t = 0.20 + (0.72 * (i + 1) / (n + 1));
    const x = Math.round(START_X + t * RACE_DISTANCE);
    if (x < FINISH_X - 32) HEDGES_X.push(x);
  }
}

function sync3DCourseAndWeather() {
  if (!scene3d) return;
  scene3d.course.buildCourse({
    raceFurlongs,
    finishSimX: FINISH_X,
    hedgesSimX: HEDGES_X,
    useHedges
  });
  scene3d.weatherSystem.applyWeatherEnvelope(weather, windForce, {
    sunLight: scene3d.sunLight,
    hemiLight: scene3d.hemiLight,
    fog: scene3d.fog,
    renderer: scene3d.renderer
  });
}

function rollRaceTypeAndDistance(randomizeType = true) {
  if (randomizeType) useHedges = random() < 0.5;

  raceFurlongs = pick(FURLONG_CHOICES);
  RACE_DISTANCE = raceFurlongs * PX_PER_FURLONG;
  FINISH_X = START_X + RACE_DISTANCE;

  buildHedges();

  raceTypeChip.textContent = `Race: ${useHedges ? "Hedges" : "Flat"}`;
  distanceChip.textContent = `Distance: ${raceFurlongs}f`;

  const typeTxt = `${RACE_ICONS[useHedges ? "Hedges" : "Flat"]} ${useHedges ? "Hedges (Steeplechase)" : "Flat Turf"}`;
  const distTxt = `📏 ${raceFurlongs} Furlongs`;
  const w = weather || "Clear";
  const wTxt = `${WEATHER_ICONS[w] ?? ""} ${w}`;
  raceCard.innerHTML = `
    <span class="pill" style="background:#0a1131;border-color:#2d3a7a">${typeTxt}</span>
    <span class="pill" style="background:#0a1131;border-color:#2d3a7a">${distTxt}</span>
    <span class="pill" style="background:#0a1131;border-color:#2d3a7a">Weather: ${wTxt}</span>
  `;

  sync3DCourseAndWeather();
  updateModeButtons();
}

function updateModeButtons() {
  const btnFlat = document.getElementById("btnFlat");
  const btnHedges = document.getElementById("btnHedges");
  if (btnFlat && btnHedges) {
    btnFlat.classList.toggle("active-mode", !useHedges);
    btnHedges.classList.toggle("active-mode", useHedges);
  }
}

function freshRaceMeta() {
  const track = pick(["FAST", "GOOD", "SLOW", "SOFT"]);
  const tod = `${randi(1, 12)}:${String(randi(0, 59)).padStart(2, "0")}`;
  const raceNo = randi(1, 9);
  metaEl.textContent = `Track: ${track} • Time: ${tod} • Race #${raceNo} • Type: ${useHedges ? "Hedges" : "Flat"} • Distance: ${raceFurlongs}f`;
}

function makeCard() {
  const names = [...HORSE_NAMES].sort(() => random() - 0.5).slice(0, NUM_HORSES);
  baseCard = names.map((name, i) => ({
    name,
    color: COLORS[i % COLORS.length],
    odds: randomOdds(),
    trainer: pick(TRAINERS),
    jockey: pick(JOCKEYS),
    owner: pick(OWNERS),
    last: pick(LAST_TMPL)({ pos: pick(POS), days: randi(5, 30) }),
    laneY: LANES_Y_2D[i],
    idx: i
  }));
}

function seedHorses(fromCard = null) {
  const card = fromCard || baseCard;
  horses = card.map((c) => ({
    ...c,
    x: START_X,
    speed: rand(110, 130)
  }));
  model.length = 0;
  horses.forEach(() => model.push({
    pace: rand(104, 124),
    stamina: rand(0.82, 1.05),
    aggression: rand(0.6, 1.3),
    surgeT: rand(6.5, 12.5),
    fatigue: 0,
    momentum: 0,
    boostT: 0
  }));

  finishTimes = Array(NUM_HORSES).fill(undefined);
  fallen = Array(NUM_HORSES).fill(false);
  jumpStart = Array(NUM_HORSES).fill(0);
  playerPick = null;
  gateOpenProgress = 0;
  photoFinishTriggered = false;
  slowMoTimer = 0;

  if (scene3d) {
    scene3d.course.setStartingGatesOpen(0);
    scene3d.vfx.clearAll();
  }

  commentary = "Pick a horse to arm the start (or add players in the start screen).";
  comEl.textContent = commentary;
  commentaryTs = performance.now();
  leaderSince = 0;
  currentLeader = -1;

  // Populate Betting Board Table
  tbody.innerHTML = "";
  horses.forEach((h, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="saddle-num" style="background:${h.color}">${idx + 1}</span></td>
      <td class="name">
        <div style="font-weight:700;color:#f4f7ff">${h.name}</div>
        <div class="small" style="opacity:.82">${h.last}</div>
      </td>
      <td><span class="pill odds-pill">${h.odds}</span></td>
      <td>${h.trainer}</td>
      <td>${h.jockey}</td>`;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => chooseHorse(idx));
    tbody.appendChild(tr);
  });

  // Legend
  legendEl.innerHTML = "";
  horses.forEach((h, i) => {
    const tag = document.createElement("div");
    tag.className = "legend-item";
    tag.style.cursor = "pointer";
    tag.title = `Focus / Pick #${i + 1} ${h.name}`;
    tag.innerHTML = `<span class="dot" style="background:${h.color}"></span><span class="small"><b>#${i + 1}</b></span>`;
    tag.onclick = () => chooseHorse(i);
    legendEl.appendChild(tag);
  });

  buildTrevorPreview();
  rebuildHorseSelect();
  buildFormSidePanel();
}

function buildTrevorPreview() {
  let out = `<b>Trevor's Famous Bookies — Preview</b><br/>`;
  out += `Top fancy: <b>${horses[0].name}</b> (${horses[0].odds}), trained by ${horses[0].trainer} for ${horses[0].owner}. `;
  out += `Value each-way: <b>${horses[1].name}</b> (${horses[1].odds}) — ${horses[1].last}. `;
  out += `Keep an eye on <b>${horses[2].name}</b> late if they go too quick up front.`;
  trevorEl.innerHTML = out;
}

function buildFormSidePanel() {
  formList.innerHTML = "";
  horses.forEach((h, idx) => {
    const row = document.createElement("div");
    row.className = "form-row";
    row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span class="saddle-num" style="background:${h.color};flex:0 0 22px">${idx + 1}</span>
        <div>
          <div><b>${h.name}</b> <span class="pill" style="margin-left:6px">${h.odds}</span></div>
          <div class="small">Jockey: ${h.jockey} • Trainer: ${h.trainer}</div>
          <div class="small" style="opacity:.82">${h.last}</div>
        </div>
      </div>`;
    formList.appendChild(row);
  });
}

function rebuildHorseSelect() {
  const taken = new Set(players.map(p => p.horse));
  playerHorseSel.innerHTML = "";
  horses.forEach((h, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i + 1} — ${h.name}`;
    if (taken.has(i)) opt.disabled = true;
    playerHorseSel.appendChild(opt);
  });
}

function renderPlayersUI() {
  playersUI.innerHTML = "";
  players.forEach((p, idx) => {
    const badge = document.createElement("div");
    badge.className = "pill";
    badge.style.cursor = "pointer";
    badge.title = "Click to remove";
    badge.innerHTML = `<span class="dot" style="background:${horses[p.horse].color}"></span> <b>${p.name}</b> — ${horses[p.horse].name} ✕`;
    badge.onclick = () => {
      players.splice(idx, 1);
      renderPlayersUI();
      rebuildHorseSelect();
    };
    playersUI.appendChild(badge);
  });
}

/* ===================== Race Flow ==================== */
function chooseHorse(i) {
  audio.unlock();
  if (![STATE.PICK, STATE.BOARD, STATE.WAIT].includes(gameState)) {
    // Allow switching camera focus horse mid-race in Chase cam
    playerPick = i;
    return;
  }
  playerPick = i;
  commentary = `You backed #${i + 1} ${horses[i].name} (${horses[i].odds})! Press Space or Start Race.`;
  comEl.textContent = commentary;
  [...tbody.children].forEach((tr, idx) => {
    tr.classList.toggle("selected-row", idx === i);
  });
  gameState = STATE.WAIT;
  btnStart.style.display = "inline-block";
}

function setWeatherRandom() {
  const w = pick(["Clear", "Rain", "Wind", "Rain & Wind"]);
  weather = w;

  if (w === "Clear") { fallProb = BASE_FALL_PROB; speedFactor = 1; windForce = 0; }
  if (w === "Rain") { fallProb = BASE_FALL_PROB * 1.5; speedFactor = 0.9; windForce = 0; }
  if (w === "Wind") { fallProb = BASE_FALL_PROB; speedFactor = 1; windForce = rand(-5, 5); }
  if (w === "Rain & Wind") { fallProb = BASE_FALL_PROB * 1.5; speedFactor = 0.85; windForce = rand(-5, 5); }

  const icon = WEATHER_ICONS[w] ?? "";
  weatherChip.textContent = `Weather: ${icon} ${w}`;
  weatherTop.textContent = `Weather: ${icon} ${w}`;

  rollRaceTypeAndDistance(false);
}

function showCountdown(startCb) {
  let n = 3;
  countNumEl.textContent = n;
  countdownEl.style.display = "flex";
  audio.playCountdownTick(n);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      countdownEl.style.display = "none";
      audio.playStartBell();
      startCb();
      return;
    }
    countNumEl.textContent = n;
    audio.playCountdownTick(n);
  }, 700);
}

function startRace() {
  if (gameState !== STATE.WAIT) return;
  audio.unlock();
  setWeatherRandom();

  horses.forEach((h, i) => {
    h.x = START_X;
    fallen[i] = false;
    finishTimes[i] = undefined;
    jumpStart[i] = 0;
  });
  model.forEach(m => {
    m.fatigue = 0;
    m.momentum = 0;
    m.surgeT = rand(6.5, 12.5);
    m.boostT = 0;
  });

  gateOpenProgress = 0;
  photoFinishTriggered = false;
  slowMoTimer = 0;
  if (scene3d) {
    scene3d.course.setStartingGatesOpen(0);
    scene3d.vfx.clearAll();
  }

  startTime = performance.now();
  lastTs = startTime;
  commentaryTs = startTime;
  commentary = "Gates crash open — They're off!";
  comEl.textContent = commentary;
  banner.style.display = "none";
  btnStart.style.display = "none";
  flashEl.style.opacity = 0;
  leaderSince = startTime;
  currentLeader = -1;

  // Auto-collapse betting drawer on smaller screens so 3D track is unobstructed
  if (window.innerWidth < 1100) {
    panelBoard.classList.add("collapsed");
  }

  gameState = STATE.COUNTDOWN;
  showCountdown(() => {
    gameState = STATE.RACING;
    audio.speak("And they are off!", true);
  });
}

function resetAllToSetup() {
  startModal.style.display = "flex";
  panelBoard.classList.remove("collapsed");
  rollRaceTypeAndDistance(true);
  setWeatherRandom();
  players.length = 0;
  renderPlayersUI();
  makeCard();
  freshRaceMeta();
  seedHorses();
  gameState = STATE.BOARD;
  banner.style.display = "none";
  btnStart.style.display = "none";
}

function instantReplay() {
  audio.unlock();
  setWeatherRandom();
  freshRaceMeta();
  seedHorses(baseCard);
  gameState = STATE.WAIT;
  banner.style.display = "none";
  btnStart.style.display = "inline-block";
  comEl.textContent = "Ready for an instant replay — same runners at the starting gate!";
}

/* ======================== Commentary ======================== */
const leadName = () => horses[horses.reduce((a, _, i) => horses[i].x > horses[a].x ? i : a, 0)].name;
const pickRunner = () => pick(horses).name;

function randomComment() {
  const acts = [
    () => `${leadName()} holds the call — tempo honest.`,
    () => `${pickRunner()} sneaks to the rail for cover.`,
    () => `${pickRunner()} edges wider looking for daylight.`,
    () => `Wind gust across the turf — silks rippling!`,
    () => `${pickRunner()} travelling sweetly on the bit.`,
    () => `${pickRunner()} asked to pick up; response is there.`,
    () => `Pack compresses — swings and roundabouts!`
  ];
  return pick(acts)();
}

function milestoneCalls() {
  const lead = Math.max(...horses.map(h => h.x));
  const prog = (lead - START_X) / RACE_DISTANCE;
  let milestone = null;
  if (prog > 0.25 && prog < 0.27) milestone = `Quarter gone — ${leadName()} shows the way.`;
  else if (prog > 0.50 && prog < 0.52) milestone = `Halfway home — field well bunched.`;
  else if (prog > 0.75 && prog < 0.77) milestone = `Three-quarters — moves coming from the pack!`;
  else if (prog > 0.90 && prog < 0.92) milestone = `Final furlong! ${leadName()} asked for everything!`;

  if (milestone && commentary !== milestone) {
    commentary = milestone;
    audio.speak(milestone);
  }
}

/* ====================== Rank & Velocity Helpers ====================== */
function ranksByX() {
  return [...horses.keys()].sort((a, b) => horses[b].x - horses[a].x);
}
function rankOf(i, order) {
  return order.indexOf(i) + 1;
}
function vmaxForDistance() {
  const t = clamp((raceFurlongs - 5) / (18 - 5), 0, 1);
  return Math.round(lerp(160, 95, t));
}

/* ========================== Simulation Dynamics =========================== */
function advanceHorse(i, dt, now, order) {
  const h = horses[i];
  const m = model[i];
  if (fallen[i] || finishTimes[i] != null) return;

  // Stumble chance
  if (random() < fallProb * dt * 0.5) {
    fallen[i] = true;
    m.momentum = -30;
    if (scene3d) {
      scene3d.vfx.emitStumbleBurst(h.x * SIM_TO_M, LANES_Z[i]);
      scene3d.cameraDirector.addTrauma(0.65);
    }
    audio.playStumble();
    return;
  }

  // 1. Base pace
  let target = m.pace;

  // 2. Rank-based rubber banding
  const rk = rankOf(i, order);
  const isLeader = (rk === 1);
  const rankFactor = (rk - 1) / (NUM_HORSES - 1);

  if (!isLeader) {
    target += lerp(0, 15, rankFactor);
  } else {
    const leadGap = (order.length > 1) ? (h.x - horses[order[1]].x) : 0;
    if (leadGap > 200) target -= 10;
    if (leadGap > 400) target -= 20;
  }

  // 3. Burst mechanic
  if (m.boostT > 0) {
    m.boostT -= dt;
    target += 25 * m.aggression;
    m.fatigue += dt * 2.5;
  } else {
    const burstChance = (rk > 1) ? 0.015 : 0.005;
    if (random() < burstChance && m.fatigue < 4) {
      m.boostT = rand(1.5, 3.0);
      commentary = `${h.name} surges into overdrive!`;
      commentaryTs = now;
      audio.playBurstSurge();
    }
    if (m.fatigue > 0) m.fatigue -= dt * 0.2;
  }

  // 4. Late race stamina fade
  const prog = (h.x - START_X) / RACE_DISTANCE;
  if (prog > 0.7) {
    const staminaPenalty = (1.0 - m.stamina) * 50 * prog;
    target -= staminaPenalty;
    target -= m.fatigue * 2;
  }

  // 5. Environmental factors
  target = target * speedFactor + windForce * 0.3;

  // Smooth momentum change
  m.momentum = lerp(m.momentum, target, 2.0 * dt);
  const maxSpeed = vmaxForDistance() * 1.3;
  const vx = clamp(m.momentum, 50, maxSpeed);

  // 6. Hedges auto-jump trigger (velocity-aware so peak of jump lands squarely over hedge)
  if (useHedges) {
    const jumpHalfSpan = vx * (JUMP_DUR * 0.001) * 0.50; // exact distance covered from takeoff to apex
    const triggerDist = clamp(jumpHalfSpan, 26, 48);      // ~36 sim px (7.2m) before hedge center
    for (const hx of HEDGES_X) {
      const d = hx - h.x;
      const arcOver = (now - jumpStart[i]) > JUMP_DUR;
      if (d > 2 && d <= triggerDist && arcOver) {
        jumpStart[i] = now;
        if (scene3d) {
          scene3d.vfx.emitHedgeTakeoff(h.x * SIM_TO_M, LANES_Z[i]);
        }
        audio.playJumpBrush();
        break;
      }
    }
  }

  h.x += vx * dt;

  // Finish Line Crossing
  if (h.x >= FINISH_X && finishTimes[i] == null) {
    finishTimes[i] = now - startTime;
    if (!photoFinishTriggered) {
      photoFinishTriggered = true;
      slowMoTimer = 0.72; // Brief dramatic photo-finish slow-motion on 1st place crossing
      triggerPhotoFlash();
      audio.playPhotoFinishShutter();
    }
    if (scene3d) {
      scene3d.cameraDirector.addTrauma(0.45);
      scene3d.vfx.emitFinishConfetti(FINISH_X * SIM_TO_M, LANES_Z[i]);
    }
  }
}

function triggerPhotoFlash() {
  flashEl.style.transition = "none";
  flashEl.style.opacity = 0.85;
  requestAnimationFrame(() => {
    flashEl.style.transition = "opacity 650ms ease";
    flashEl.style.opacity = 0;
  });
}

/* ========================== 2D HUD Minimap Overlay =========================== */
function drawMinimapOverlay() {
  if (!scene3d || !scene3d.minimapCtx) return;
  const ctx = scene3d.minimapCtx;
  const W = scene3d.minimapW || 420;
  const H = scene3d.minimapH || 48;

  ctx.clearRect(0, 0, W, H);

  const x0 = 18;
  const x1 = W - 18;
  const y = H / 2;

  // Track progress rail
  const g = ctx.createLinearGradient(x0, y, x1, y);
  g.addColorStop(0, "#7aa2ff");
  g.addColorStop(1, "#56f0c1");
  ctx.strokeStyle = g;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();

  // Start & Finish nodes
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x0, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x1, y, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Hedge ticks
  if (useHedges) {
    ctx.fillStyle = "#22c55e";
    HEDGES_X.forEach(hx => {
      if (hx >= FINISH_X) return;
      const t = clamp((hx - START_X) / RACE_DISTANCE, 0, 1);
      const xi = lerp(x0, x1, t);
      ctx.fillRect(xi - 1.5, y - 8, 3, 16);
    });
  }

  // Horse position pips
  const leaderIdx = horses.reduce((best, _, idx) => horses[idx].x > horses[best].x ? idx : best, 0);
  horses.forEach((h, i) => {
    const t = clamp((h.x - START_X) / RACE_DISTANCE, 0, 1);
    const xi = lerp(x0, x1, t);
    ctx.fillStyle = "#0b0e17";
    ctx.beginPath();
    ctx.arc(xi, y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.beginPath();
    ctx.arc(xi, y, 5.2, 0, Math.PI * 2);
    ctx.fill();

    if (i === leaderIdx) {
      ctx.strokeStyle = "#ffd76a";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(xi, y, 9.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/* ========================== Results Modal =========================== */
function showResults() {
  audio.playWinnerFanfare();

  const finishers = horses
    .map((h, i) => ({ i, t: finishTimes[i] }))
    .filter(o => o.t != null)
    .sort((a, b) => a.t - b.t);
  const fallers = horses
    .map((h, i) => ({ i }))
    .filter(o => fallen[o.i]);
  const order = [...finishers.map(o => o.i), ...fallers.map(o => o.i)];
  const first = finishers[0]?.i;

  bannerTitle.textContent = first != null ? `🏆 Winner: ${horses[first].name}` : "No horse finished!";
  if (first != null) {
    audio.speak(`Winner is ${horses[first].name}!`, true);
  }

  bannerGrid.innerHTML = "";
  const placeLabels = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  order.forEach((idx, rank) => {
    const place = placeLabels[rank] || `${rank + 1}th`;
    const left = document.createElement("div");
    left.innerHTML = `<span class="dot" style="background:${horses[idx].color}"></span> <b>${place}</b>`;
    const right = document.createElement("div");
    const timeStr = finishTimes[idx] != null ? ` (${(finishTimes[idx] / 1000).toFixed(2)}s)` : "";
    right.textContent = horses[idx].name + (fallen[idx] ? " — Fell" : timeStr);
    bannerGrid.appendChild(left);
    bannerGrid.appendChild(right);
  });

  if (players.length) {
    const winners = players.filter(p => p.horse === first).map(p => p.name);
    playersResultEl.textContent = winners.length
      ? `🏆 Winning Ticket: ${winners.join(", ")}!`
      : `No player backed the winner this race.`;
  } else if (playerPick != null) {
    playersResultEl.textContent = (first === playerPick)
      ? `🏆 You backed ${horses[playerPick].name} (${horses[playerPick].odds}) — WINNER!`
      : `You backed ${horses[playerPick].name}. Better luck next race!`;
  } else {
    playersResultEl.textContent = "";
  }
  banner.style.display = "block";
}

/* ========================== Main Loop =========================== */
function tick(now) {
  requestAnimationFrame(tick);
  if (!lastTs) lastTs = now;
  let rawDt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;

  // Brief photo-finish slow-motion effect when winner hits the wire
  let simDt = rawDt;
  if (slowMoTimer > 0) {
    slowMoTimer = Math.max(0, slowMoTimer - rawDt);
    simDt = rawDt * 0.35;
  }

  const nowSec = now * 0.001;
  const order = ranksByX();
  const leaderIdx = order[0] ?? 0;

  if (gameState === STATE.RACING) {
    // Open starting stall gates rapidly in first 0.25s
    gateOpenProgress = clamp(gateOpenProgress + rawDt * 6.5, 0, 1);
    scene3d.course.setStartingGatesOpen(gateOpenProgress);

    if (leaderIdx !== currentLeader) {
      currentLeader = leaderIdx;
      leaderSince = now;
      commentary = `${horses[leaderIdx].name} takes the lead!`;
      commentaryTs = now;
    }

    let fallMsg = false;
    for (let i = 0; i < NUM_HORSES; i++) {
      const wasFallen = fallen[i];
      advanceHorse(i, simDt, now, order);
      if (fallen[i] && !wasFallen) {
        fallMsg = true;
        commentary = `Oh no! ${horses[i].name} stumbled!`;
        commentaryTs = now;
        audio.speak(`${horses[i].name} stumbled!`);
      }
    }

    if (now - commentaryTs > commentaryInterval && !fallMsg) {
      commentary = randomComment();
      commentaryTs = now;
    }
    milestoneCalls();
    comEl.textContent = commentary;

    const allDone = horses.every((_, i) => fallen[i] || finishTimes[i] != null);
    if (allDone) {
      gameState = STATE.FINISHED;
      showResults();
    }
  }

  // Update 3D Horse Actors, Hoof Audio & VFX
  const isWet = weather.includes("Rain");
  for (let i = 0; i < NUM_HORSES; i++) {
    const actor = scene3d.horseActors[i];
    const h = horses[i];
    const m = model[i];
    if (!actor || !h || !m) continue;

    const jumpElapsed = now - jumpStart[i];
    const isJumpActive = jumpStart[i] > 0 && jumpElapsed < JUMP_DUR;
    const jumpT = isJumpActive ? clamp(jumpElapsed / JUMP_DUR, 0, 1) : 0;

    const res = updateHorseActorAnimation(
      actor,
      h,
      m,
      {
        isRacing: gameState === STATE.RACING,
        hasStarted: gameState === STATE.RACING || gameState === STATE.FINISHED,
        isJumpActive,
        jumpT,
        isFallen: fallen[i],
        isLeader: i === leaderIdx,
        windForce
      },
      simDt,
      now
    );

    if (res.hoofStrike && finishTimes[i] == null) {
      scene3d.vfx.emitHoofClods(res.worldX, LANES_Z[i], isWet);
      // Spatial pan relative to camera X
      const pan = clamp((res.worldX - scene3d.camera.position.x) * 0.08, -0.8, 0.8);
      const vol = (i === leaderIdx || i === playerPick) ? 0.095 : 0.045;
      audio.playHoofbeat(pan, isWet, vol);
    }

    if (gameState === STATE.RACING && m.boostT > 0 && !fallen[i] && finishTimes[i] == null) {
      scene3d.vfx.emitBurstTrail(res.worldX, res.jumpY, LANES_Z[i], actor.silkColor);
    }
  }

  // Update Camera Director, Sun Shadow Frustum, Weather & Vegetation Wind
  const leadWorldX = (horses[leaderIdx]?.x || START_X) * SIM_TO_M;
  const raceProgress = clamp(((horses[leaderIdx]?.x || START_X) - START_X) / Math.max(1, RACE_DISTANCE), 0, 1);

  scene3d.cameraDirector.update(rawDt, {
    gameState,
    horses,
    leaderIdx,
    playerPick,
    finishSimX: FINISH_X,
    raceFurlongs,
    nowSec
  });

  scene3d.updateSunFollow(leadWorldX);
  scene3d.course.updateVegetationWind(nowSec, windForce);
  scene3d.weatherSystem.update(rawDt, scene3d.cameraDirector.currentLookAt.x, weather, windForce);
  scene3d.vfx.update(simDt);
  audio.updateAmbience(gameState === STATE.RACING, raceProgress, weather);

  scene3d.renderFrame(rawDt);
  drawMinimapOverlay();

  // Update Visual Validation Telemetry Drawer if open
  if (debugDrawer && debugDrawer.style.display !== "none" && telemetryEl) {
    const t = scene3d.getTelemetry();
    telemetryEl.textContent = `FPS: ${t.fps} • Draws: ${t.drawCalls} • Tris: ${t.triangles} • Wetness: ${t.wetness} • Seed: ${getSeed()}`;
  }
}

/* ========================= Controls & UI Wiring ========================= */
function updateCameraButtonLabel() {
  if (!btnCameraMode || !scene3d) return;
  const info = scene3d.cameraDirector.modeInfo;
  btnCameraMode.textContent = `${info.icon} Cam: ${info.label}`;
}

window.addEventListener("keydown", (e) => {
  if (document.activeElement === playerNameInp || document.activeElement === seedInput) return;

  if (e.key === " ") {
    e.preventDefault();
    if (gameState === STATE.WAIT) startRace();
    else if (gameState === STATE.FINISHED) instantReplay();
  }
  if (e.key === "f" || e.key === "F") {
    useHedges = false;
    rollRaceTypeAndDistance(false);
    freshRaceMeta();
  }
  if (e.key === "h" || e.key === "H") {
    useHedges = true;
    rollRaceTypeAndDistance(false);
    freshRaceMeta();
  }
  if (e.key === "c" || e.key === "C") {
    scene3d.cameraDirector.cycleMode();
    updateCameraButtonLabel();
  }
  if (e.key === "m" || e.key === "M") {
    const muted = audio.toggleMute();
    btnAudioMute.textContent = muted ? "🔇 Muted" : "🔊 Audio";
  }
  if (e.key === "v" || e.key === "V") {
    const voice = audio.toggleVoice();
    btnVoiceToggle.textContent = voice ? "🎙️ Caller: ON" : "🎙️ Caller: OFF";
  }
  if (e.key === "d" || e.key === "D") {
    const open = debugDrawer.style.display === "none";
    debugDrawer.style.display = open ? "flex" : "none";
  }
  if ([STATE.PICK, STATE.BOARD, STATE.WAIT, STATE.RACING].includes(gameState)) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= NUM_HORSES) chooseHorse(n - 1);
  }
});

document.getElementById("btnFlat").onclick = () => {
  useHedges = false;
  rollRaceTypeAndDistance(false);
  freshRaceMeta();
};
document.getElementById("btnHedges").onclick = () => {
  useHedges = true;
  rollRaceTypeAndDistance(false);
  freshRaceMeta();
};
document.getElementById("btnContinue").onclick = () => {
  gameState = STATE.PICK;
  commentary = `Pick a horse (1–${NUM_HORSES}) or click a row on the Tote Board.`;
  comEl.textContent = commentary;
};

document.getElementById("btnRestartFull").onclick = resetAllToSetup;
document.getElementById("btnInstantReplay").onclick = instantReplay;
document.getElementById("btnPlayAgain").onclick = instantReplay;
document.getElementById("btnChangeCard").onclick = () => {
  makeCard();
  seedHorses();
  gameState = STATE.PICK;
  banner.style.display = "none";
  panelBoard.classList.remove("collapsed");
  comEl.textContent = "New race card — pick your runner.";
};
btnStart.onclick = startRace;

if (btnToggleBoard) {
  btnToggleBoard.onclick = () => {
    panelBoard.classList.toggle("collapsed");
    setTimeout(() => scene3d && scene3d.resize(), 260);
  };
}

if (btnCameraMode) {
  btnCameraMode.onclick = () => {
    scene3d.cameraDirector.cycleMode();
    updateCameraButtonLabel();
  };
}

if (btnAudioMute) {
  btnAudioMute.onclick = () => {
    const muted = audio.toggleMute();
    btnAudioMute.textContent = muted ? "🔇 Muted" : "🔊 Audio";
  };
}

if (btnVoiceToggle) {
  btnVoiceToggle.onclick = () => {
    const voice = audio.toggleVoice();
    btnVoiceToggle.textContent = voice ? "🎙️ Caller: ON" : "🎙️ Caller: OFF";
  };
}

if (btnDebugDrawer) {
  btnDebugDrawer.onclick = () => {
    const open = debugDrawer.style.display === "none";
    debugDrawer.style.display = open ? "flex" : "none";
  };
}

// Quality & Visual Validation controls
const qualitySelect = document.getElementById("qualitySelect");
if (qualitySelect) {
  qualitySelect.onchange = (e) => {
    scene3d.setQualityTier(e.target.value);
  };
}

const debugModeSelect = document.getElementById("debugModeSelect");
if (debugModeSelect) {
  debugModeSelect.onchange = (e) => {
    scene3d.setDebugMode(e.target.value);
  };
}

const btnApplySeed = document.getElementById("btnApplySeed");
if (btnApplySeed && seedInput) {
  btnApplySeed.onclick = () => {
    const s = setSeed(seedInput.value);
    seedInput.value = s;
    rollRaceTypeAndDistance(true);
    setWeatherRandom();
    makeCard();
    freshRaceMeta();
    seedHorses();
  };
}

document.getElementById("btnAddPlayer").onclick = () => {
  const name = (playerNameInp.value || "").trim();
  const horse = parseInt(playerHorseSel.value, 10);
  if (!name) return alert("Enter a player name");
  if (players.length >= NUM_HORSES) return alert("Max players reached for this race.");
  if (players.some(p => p.horse === horse)) return alert("That horse is already taken.");
  players.push({ name, horse });
  playerNameInp.value = "";
  renderPlayersUI();
  rebuildHorseSelect();
  gameState = STATE.WAIT;
  btnStart.style.display = "inline-block";
  comEl.textContent = "Players ready at the paddock. Press Space or Start Race.";
};

document.getElementById("btnQuickStart").onclick = () => {
  audio.unlock();
  startModal.style.display = "none";
  rollRaceTypeAndDistance(true);
  setWeatherRandom();
  freshRaceMeta();
  seedHorses();
  if (players.length > 0) {
    gameState = STATE.WAIT;
    btnStart.style.display = "inline-block";
    comEl.textContent = "Players ready. Press Space or Start Race.";
  } else {
    gameState = STATE.PICK;
    comEl.textContent = `Pick a horse by clicking a row on the Tote Board or pressing 1–${NUM_HORSES}.`;
  }
};

/* ============================ Boot ============================= */
const canvas3d = document.getElementById("game");
const minimapCanvas = document.getElementById("minimapCanvas");
scene3d = new SceneManager3D(canvas3d, minimapCanvas);

if (seedInput) seedInput.value = getSeed();
rollRaceTypeAndDistance(true);
setWeatherRandom();
makeCard();
freshRaceMeta();
seedHorses();
renderPlayersUI();
updateCameraButtonLabel();
requestAnimationFrame(tick);

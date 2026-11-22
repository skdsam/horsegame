/* ============================================================================
 * Horse Rally 3D — Configuration, Data Pools & Deterministic PRNG
 * ============================================================================ */

export const NUM_HORSES = 5;
export const START_X = 70;
export const FURLONG_CHOICES = [5, 6, 7, 8, 10, 12, 16, 18];
export const PX_PER_FURLONG = 230;
export const BASE_FALL_PROB = 0.004;

/* Jump feel (preserved from 2D simulation) */
export const JUMP_DUR = 900; // ms
export const JUMP_H = 22;    // sim units (~2.2m in 3D)
export const PRE_JUMP = 60;
export const HEAD_START_MS = 140;
export const LATE_WINDOW = 18;

/* 3D Scale Contract:
 * 1 simulation pixel = 0.2 metres (so 230 px/furlong = 46m compressed 3D furlong)
 * 5 lanes spaced 2.5m apart along Z: -5.0m, -2.5m, 0.0m, +2.5m, +5.0m
 */
export const SIM_TO_M = 0.20;
export const LANES_Z = [-5.0, -2.5, 0.0, 2.5, 5.0];
export const LANES_Y_2D = [120, 200, 280, 360, 440]; // legacy compatibility

export const COLORS = ["#ff526d", "#61a0ff", "#ffd85a", "#f070ff", "#36c7c7"];

export const EQUINE_COATS = [
  { name: "Bay", body: "#6b381d", mane: "#1c130e", muzzle: "#3d2213", socks: "#f0ece1", hooves: "#1f1b18" },
  { name: "Chestnut", body: "#8c421e", mane: "#59250c", muzzle: "#632d14", socks: "#f5efe6", hooves: "#29221c" },
  { name: "Dapple Grey", body: "#b5bbc4", mane: "#4a5059", muzzle: "#69707a", socks: "#e8ecf2", hooves: "#26282b" },
  { name: "Black Satin", body: "#232328", mane: "#111114", muzzle: "#2e2d33", socks: "#dce0e8", hooves: "#17171a" },
  { name: "Palomino", body: "#c49446", mane: "#f2ead5", muzzle: "#8c672b", socks: "#faf6eb", hooves: "#332a1e" }
];

export const STATE = {
  BOARD: 0,
  PICK: 1,
  WAIT: 2,
  COUNTDOWN: 3,
  RACING: 4,
  FINISHED: 5
};

export const CAMERA_MODES = [
  { id: "broadcast", label: "TV Broadcast", icon: "🎥" },
  { id: "action", label: "Action Rail", icon: "🎬" },
  { id: "chase", label: "Jockey Chase", icon: "🏇" },
  { id: "aerial", label: "Helicopter", icon: "🚁" },
  { id: "orbit", label: "Free Orbit", icon: "🌐" }
];

export const HORSE_NAMES = [
  "Lightning Menzies", "Thunderbolt Miller", "Majesty Briggs", "Starlight Chapman", "Blaze Gray",
  "Spirit Brind", "Apollo Menzies", "Comet Miller", "Dusk Briggs", "Midnight Chapman",
  "Eclipse Gray", "Sundance Brind", "Rocket Menzies", "Storm Miller", "Mystic Briggs",
  "Sapphire Chapman", "Wild Gray", "Charger Brind", "Racer Menzies", "Victory Miller",
  "Phantom Briggs", "Galaxy Menzies", "Miracle Chapman", "Fury Miller", "Zephyr Briggs",
  "Copper Chapman", "Inferno Miller", "Vortex Brind", "Mirage Gray", "Tempest Briggs",
  "Dynamo Chapman", "Blitz Menzies", "Nova Miller", "Cosmos Brind",
  "Sterling Baker", "Ironheart Davies", "Crimson Arrow", "Shadowfax Li", "Gale Dixon",
  "Onyx Steele", "Solar Flare", "High Tide Jackson", "Avalanche Bell", "Whisper Wind",
  "Canyon King", "Golden Spur", "Phoenix Ash", "Diamond Dust", "Silver Streak",
  "Maverick Jones", "Tidal Wave", "Desert Hawk", "Spartan Gold", "Terra Firma",
  "Granite Peak", "Emerald Fire", "Jade Runner", "Sky Marshal", "Swift Justice",
  "Aether Drift", "Oracle Reed", "Zenith Power", "Steel Curtain", "Monarch Reign",
  "Viper Strike", "Polaris Star", "Glacier Rush"
];

export const TRAINERS = [
  "T. Smith", "K. Brown", "D. Johnson", "F. Martin", "B. Cooper", "L. Kramer",
  "P. Davis", "G. White", "M. Wilson", "R. Taylor", "E. Harris", "A. King",
  "J. Clark", "S. Hall", "C. Lewis", "H. Young", "W. Lee", "Z. Green",
  "V. Carter", "O. Parker", "N. Hayes"
];

export const JOCKEYS = [
  "J. Diaz", "R. Jackson", "M. Li", "S. Carter", "N. Hall", "W. Baker",
  "C. Chen", "A. Patel", "L. Jones", "B. O'Connell", "E. Rodriguez", "G. Singh",
  "K. Ito", "D. Murphy", "T. Vance", "V. Khan", "F. Evans", "H. Kim",
  "P. Silva", "I. Weber", "Z. Scott"
];

export const OWNERS = [
  "Riverstone Stables", "Blue Jay Racing", "Silver Oak Syndicate", "Northwind Farms", "Crimson Gate",
  "Golden Crown Racing", "Willow Creek Farm", "Victory Line Stables", "Black Swan Syndicate",
  "Rising Sun Ranch", "Emerald Isle Group", "Steel Barrier Stables", "Shadow Run Farms",
  "Iron Horse Ventures", "Monarch Racing LLC"
];

export const LAST_TMPL = [
  d => `Last race: ${d.pos} at Ascot, ${d.days} days ago`,
  d => `Last race: ${d.pos} at Cheltenham, ${d.days} days ago`,
  d => `Last race: ${d.pos} at Aintree, ${d.days} days ago`,
  d => `Last race: ${d.pos} at Newmarket, ${d.days} days ago`,
  d => `Last race: ${d.pos} at Goodwood, ${d.days} days ago`
];

export const POS = ["1st", "2nd", "3rd", "4th"];
export const RACE_ICONS = { Flat: "🏁", Hedges: "🌿" };
export const WEATHER_ICONS = {
  "Clear": "☀️",
  "Rain": "🌧️",
  "Wind": "💨",
  "Rain & Wind": "🌧️💨"
};

/* Deterministic Seedable Mulberry32 PRNG for Visual Validation & Replays */
let currentSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
let prngState = currentSeed;

export function setSeed(seed) {
  currentSeed = (Number(seed) || 1337) >>> 0;
  prngState = currentSeed;
  return currentSeed;
}

export function getSeed() {
  return currentSeed;
}

export function random() {
  let t = (prngState += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (a, b) => a + random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pick = arr => arr[randi(0, arr.length - 1)];
export const randomOdds = () => `${randi(1, 12)}-${randi(1, 12)}`;

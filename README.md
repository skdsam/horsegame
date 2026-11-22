# Horse Rally 3D — Architecture & Implementation Plan

**Horse Rally 3D** transforms the classic 2D browser-based *Trevor Gray's Horse Rally* into a rich, full-3D equestrian racing simulation built with **Three.js**. Every core feature of the original game—Flat vs. Steeplechase (Hedges) racing, 5–18 furlong distances, dynamic weather (Clear, Rain, Wind, Rain & Wind), 9-horse AI race physics (pace, stamina, aggression, burst surges, rubber-banding, stumble risk), Trevor's Bookies form & odds board, local multiplayer, and live race commentary—is preserved and elevated into a physically grounded 3D racecourse experience.

---

## 1. Activated Skills & Responsibilities

Following the shared skill routing architecture (`project-skill-router` & `threejs-skill-router`), this 3D upgrade is engineered around a focused set of specialist skills:

| Skill ID | Role in Horse Rally 3D |
| :--- | :--- |
| **`threejs-skill-router`** | Establishes the visual contract (subject scale, camera distance, frame budget, deterministic seeds, debug modes, and no-post baseline). |
| **`threejs-procedural-geometry`** | Builds semantic 3D procedural meshes with explicit metre-scale dimensions: articulated 3D horses & jockeys, starting stalls, white post-and-rail fences, trimmed boxwood steeplechase hedges with white takeoff boards, finish gantry, and grandstand silhouettes. |
| **`threejs-procedural-animation`** | Drives frame-rate-independent (`deltaSeconds`) skeletal/hierarchical gallop cycles (4-beat gait phase offset per runner, neck/head bob, tail stream, leg articulation), ballistic hedge-jump arcs, and stumble/recovery physics. |
| **`threejs-camera-direction`** & **`build-game-camera-controls`** | Powers a multi-mode 3D camera rig with independent position (`lerp`) and orientation (`slerp`) smoothing: **TV Broadcast Tracking**, **Jockey/Chase Cam**, **Helicopter Overhead**, **Free Orbit**, and **Photo-Finish Cut**, plus trauma-damped camera shake. |
| **`threejs-procedural-vegetation`** | Generates instanced 3D turf grass clusters, manicured track stripes, hedge foliage, and perimeter trees with rooted circular-arc wind deformation synced to the race's wind force. |
| **`threejs-precipitation-surfaces`** | Couples weather state (`Clear`, `Rain`, `Wind`, `Rain & Wind`) directly to the 3D track: camera-wrapped instanced 3D rain streaks, wind-tilted trajectories, wet turf/dirt roughness darkening, puddle masks, and hoof splash ripples. |
| **`create-game-vfx`** | Object-pooled, zero-allocation 3D particle systems for hoof-strike turf clods, mud/water splashes, golden aerodynamic draft/surge trails during bursts (`>>>`), stumble impact puffs, and finish-line confetti cannons. |
| **`build-game-audio-feedback`** | Procedural Web Audio API sound engine (zero external audio files needed) providing user-gesture unlock, tempo-synced 3D spatial hoofbeats, starting gate bell & latch clatter, crowd roar swell in the final furlong, whip/burst whoosh, hedge brush rustle, weather ambience, and optional Web Speech API commentary. |
| **`frontend-design`** | Crafts a distinctive **Royal Turf Club & Tote Board** UI overlay—combining classic British racecourse heritage (deep turf emerald, warm paddock brass, crisp tote board numerals) with an obstructed-view-free HUD over the 3D WebGL viewport. |
| **`threejs-visual-validation`** | Supplies deterministic seed control, quality tiers (`High`, `Balanced`, `Reduced Motion`), and live visual debug toggles (wireframe, weather masks, camera targets, and FPS/budget telemetry). |

---

## 2. Visual Contract & World Scale

To ensure realistic proportions, stable shadow cascades, and readable motion across all race distances (5f to 18f):

- **Coordinate System**: Right-handed Y-up metre scale (`1 unit = 1 metre`).
  - `+X`: Down-track racing direction (Start to Finish).
  - `+Y`: Vertical elevation (turf surface at `Y = 0`).
  - `+Z`: Lateral lane offset across the track width (`5 lanes` spaced at `2.4 m` intervals, centered around `Z = 0`, total track width `14 m`).
- **Track Scale Mapping**:
  - Original 2D scale: `230 px` per furlong (`START_X = 70`).
  - 3D world scale:Mapped deterministically (`1 furlong = 46 m` in compressed game-time scale so 5f = `230 m` and 18f = `828 m`, keeping race durations identical to the crisp 15–45s pacing of the original while preserving exact simulation math).
- **Target Frame Budget**: Locked `60 FPS` (`<= 16.6 ms` frame time) on desktop and mobile GPUs via `InstancedMesh` for fences, grass, hedges, rain, and pooled particles (`< 45` draw calls total).

---

## 3. Core 3D Systems Plan

### 3.1 Procedural 3D Racecourse & Environment (`threejs-procedural-geometry`, `threejs-procedural-vegetation`)
1. **Turf & Track Surface**:
   - Multi-band mowed grass shaders with alternating lawn stripes every `10 m` and worn dirt/divot marks along the 5 running lanes.
   - Painted white lane lines and furlong distance markers (`5f`, `4f`, `3f`, `2f`, `1f` poles with red/white discs) counting down to the finish.
2. **Perimeter Post-and-Rail Fences**:
   - Continuous instanced white PVC running rails (`Y = 1.1 m`) with vertical posts every `3 m` lining both the inner (`Z = -7.5 m`) and outer (`Z = +7.5 m`) rails.
3. **Starting Stalls & Finish Gantry**:
   - **Starting Gate**: 5-bay metallic starting stall structure at `X = 0` with spring-open front gates that swing wide when the countdown hits `GO!`.
   - **Finish Line**: Checkered turf strip, red-and-white mirror finish post, overhead turf-club archway, and photo-finish camera tower at `X = FINISH_X`.
4. **3D Steeplechase Hedges (`Hedges` Mode)**:
   - Positioned at the exact normalized intervals (`20%` to `92%` of race distance) as the 2D version.
   - Constructed with a sloped timber guard rail (white/orange takeoff bar), dense boxwood/spruce hedge volume, and brush top that compresses slightly when horses clear it.
5. **Backdrop & Paddock Context**:
   - Rolling infield hills, instanced perimeter trees swaying with `windForce`, and a low-poly Victorian grandstand lining the final furlong (`85%` to `100%` of track length) populated with animated spectator color blocks.

### 3.2 Articulated 3D Horses & Jockeys (`threejs-procedural-geometry`, `threejs-procedural-animation`)
1. **Procedural Articulated Horse Hierarchy**:
   - Built from sculpted, smooth-shaded procedural sub-assemblies (torso barrel, chest, hindquarters, articulated neck + head + ears, flowing mane & tail, and 4 two-segment legs with hooves).
   - **Distinctive Coat & Silk Colors**: Each of the 5 runners wears their signature color (`#ff526d`, `#61a0ff`, `#ffd85a`, `#f070ff`, `#36c7c7`) on the jockey's satin silks, helmet cover, and numbered saddlecloth (`1`–`5`), paired with varied natural equine coat tones (Bay, Chestnut, Dapple Grey, Black, Palomino).
2. **Kinematic 4-Beat Gallop & Jump Animation**:
   - Phase-locked to actual horizontal velocity (`vx`): faster bursts accelerate stride frequency and lengthen suspension phase.
   - **Hedge Jump State Machine**:
     - *Approach (`d < 120`)*: Stride gathers, head raises.
     - *Takeoff & Arc (`JUMP_DUR = 900 ms`)*: Parabolic center-of-mass trajectory (`Y = sin(t * PI) * JUMP_H`) with pitched body angle (`+28°` takeoff pitching smoothly to `-22°` landing), tucked forelegs, and extended hindlegs.
     - *Landing*: Compression spring dip + turf clod particle burst.
   - **Stumble / Fall Animation**:
     - When a horse stumbles (`fallen[i] = true`), it pitches forward into a dramatic stumble-and-pull-up recovery halt (horse slows safely to the side of its lane while shaking its head, avoiding grim visuals while clearly signaling `Fell / Pulled Up!`).
3. **In-World 3D Badges**:
   - Crisp CSS2D / canvas-sprite floating nameplates (`#1 Horse Name`), a gleaming 3D rotating golden crown (`👑`) above the current leader, and glowing golden chevrons (`>>>`) during an active surge burst.

### 3.3 Dynamic Weather & Surface Coupling (`threejs-precipitation-surfaces`)
All four original weather modes directly alter both physics and 3D visuals via a shared weather envelope:
- **Clear (`☀️`)**: Golden-hour directional sunlight (`SUN_AZIMUTH = 135°`, `SUN_ELEVATION = 32°`), crisp real-time PCF soft shadows, vibrant green dry turf, and warm sky dome.
- **Rain (`🌧️`)**: Overcast slate sky, cooler ambient lighting, `speedFactor = 0.9`, `fallProb * 1.5`. Camera-wrapped instanced 3D rain streaks fall across the viewport; track material increases wetness, lowering roughness to create reflective puddles along the turf and kicking up water spray instead of dry turf clods.
- **Wind (`💨`)**: `windForce = rand(-5, 5)`. Procedural grass blades, perimeter tree canopies, horse tails, and furlong flags bend continuously in the wind direction; wind streaks drift across the course.
- **Rain & Wind (`🌧️💨`)**: Stormy low-visibility fog, diagonal wind-driven rain streaks tilted by `windForce`, wet reflective track puddles with ripple normals, and maximum stumble danger (`speedFactor = 0.85`, `fallProb * 1.5`).

### 3.4 Multi-Angle Broadcast Camera System (`threejs-camera-direction`, `build-game-camera-controls`)
Players can switch camera angles live during the race via hotkeys (`C` or `V`) or on-screen HUD pills:
1. **TV Broadcast Cam (Default)**: Elevated rail-side tracking dolly (`Z = +16 m`, `Y = 4.5 m`) that smoothly leads the pack, dynamically adjusting FOV and look-ahead distance based on race length (`5f` sprint vs. `18f` marathon) just like the original `viewAhead` logic.
2. **Close Action / Pack Cam**: Low-angle dramatic sweeping shot (`Y = 1.8 m`) tracking alongside the current leader and nearest challengers.
3. **Jockey / Chase Cam**: Third-person chase camera locked behind the player's selected horse (or current leader if spectating), leaning into bursts and rising over hedge jumps.
4. **Helicopter / Drone Overhead**: High-altitude angled aerial view showing full lateral spacing and hedge lines.
5. **Photo-Finish Automatic Cut**: As the leader crosses `96%` of the track, the camera optionally swings into a dramatic finish-line angle with a white photo-finish shutter flash and brief slow-motion (`0.35x` for `800 ms`) as the winner hits the wire.

### 3.5 3D VFX & Particle Pooling (`create-game-vfx`)
- **Hoof Turf & Mud Clods**: Emitted on ground contact frames when `vx > 110`; color adapts automatically to dry turf (`#4d6b2c`), dirt (`#5e3e29`), or wet rain spray (`#b8d4e8`).
- **Burst Slipstream (`boostT > 0`)**: Ribbon trail and instanced gold/team-color speed sparks streaming off the jockey's silks during an AI surge.
- **Hedge Brush & Stumble Impact**: Leaf burst when skimming the top of a hedge; high-energy pink/crimson shock ring and camera trauma shake (`shake = 10`) on a stumble.
- **Winner's Enclosure Confetti**: Multi-color 3D confetti burst at the finish gantry when the winning horse crosses the line.

### 3.6 Procedural Web Audio & Speech Engine (`build-game-audio-feedback`)
- **Zero-Dependency Web Audio Synthesizer**:
  - *Hoofbeats*: Filtered noise + low-tom resonant pulses scheduled in 4-beat cadence (`1-2-3-4 — pause`), panned in stereo according to horse positions relative to the camera.
  - *Starting Gate*: Metallic latch clank + clear brass bell ring on race start; countdown ticks (`3... 2... 1...`).
  - *Hedge Jump*: Brush whoosh on takeoff and heavy turf thud on landing.
  - *Surge / Stumble*: Rising harmonic whoosh when a runner triggers a burst; dramatic low thud + crowd gasp on a stumble.
  - *Finish Crowd Roar*: Bandpass-filtered crowd cheer that swells over the final furlong and peaks with camera shutter clicks at the finish line.
- **Controls**: Top-bar Mute (`M`) and optional **Live Voice Announcer** toggle (using browser `speechSynthesis` to read Trevor's live race commentary aloud in a brisk British race-caller cadence).

---

## 4. UI / UX Design Plan (`frontend-design`)

### Aesthetic Direction: *"Royal Ascot Meets Modern Broadcast Tote"*
Rather than obscuring the 3D scene inside a small box, the **Three.js 3D canvas fills the full stage viewport**, with floating translucent glass-and-brass broadcast cards layered cleanly over the perimeter:

- **Color Palette**:
  - `--turf-deep`: `#08140e` (Deep Paddock Pine backdrop)
  - `--panel-glass`: `rgba(13, 22, 36, 0.78)` with `backdrop-filter: blur(12px)`
  - `--brass-gold`: `#e5c158` (Trophy Brass accents & leader badges)
  - `--tote-cream`: `#f4f6fb` (Crisp primary typography)
  - `--silk-1..5`: `#ff526d`, `#61a0ff`, `#ffd85a`, `#f070ff`, `#36c7c7`
- **Layout & Interactive Flow**:
  1. **Header Bar**: Game emblem, live Race Type (`Flat` / `Hedges`), Distance (`5f`–`18f`), Weather chip, Camera Angle selector (`TV`, `Chase`, `Aerial`, `Orbit`), Audio Mute toggle, Quality/Debug drawer toggle, `Reset to Setup`, and `Instant Replay`.
  2. **Start Modal (Paddock Setup)**:
     - Live 3D background preview slowly orbiting the starting stalls and paddock while players configure the race.
     - Add up to 5 local players, assign exclusive horses, inspect **Race Tips & Form**, and launch into **Betting Board** or **Quick Start**.
  3. **Collapsible Left Tote & Betting Board**:
     - Interactive runner table (`#`, `Horse & Last Form`, `Odds`, `Trainer`, `Jockey`) + *Trevor's Famous Bookies Preview*.
     - Automatically compacts or slides into a sleek live leaderboard pill during `STATE.RACING` so the 3D racecourse takes center stage, and expands again anytime.
  4. **Bottom Broadcast HUD & 3D Minimap**:
     - Live scrolling race commentary ticker with milestone calls (`Quarter gone`, `Halfway home`, `Three-quarters`, `Final furlong!`).
     - High-contrast track progress bar showing start, finish, hedge markers, and live horse position pips with a golden ring around the leader.
  5. **Photo-Finish Results Banner**:
     - Podium breakdown (`1st` through `5th` + `Fell` statuses), finish times, winning player callouts, `Play Again (Instant Replay)`, and `New Card`.

---

## 5. Architecture & File Structure

To keep the game effortless to run (just like the original `horse.html`, requiring zero build steps or Node bundlers while staying clean and modular):

```text
d:\scratch\horse game\
├── horse.html              # Main entry point (3D Three.js edition with ES Module importmap)
├── horse_2d_backup.html    # Preserved copy of the 2D version (alongside horse_original.html)
├── js/                     # Modular ES6 architecture (also runnable via local server or inline bundle)
│   ├── config.js           # Constants, furlong scaling, horse names, trainers, jockeys, owners
│   ├── simulation.js       # Core race math: pace, stamina, rubber-banding, bursts, hedges, weather
│   ├── scene3d.js          # Three.js renderer, lighting, sky, shadows, resize, and visual validation debug
│   ├── track3d.js          # Procedural 3D turf, rails, starting stalls, hedges, furlong poles, grandstand
│   ├── horse3d.js          # Procedural 3D articulated horse + jockey mesh builder & gait/jump animator
│   ├── weather3d.js        # Coupled 3D rain streaks, wind deformation, wet surface roughness & puddles
│   ├── camera3d.js         # Broadcast, Chase, Aerial, Orbit & Photo-Finish camera rig + trauma shake
│   ├── vfx3d.js            # Pooled 3D particles: turf clods, water spray, burst trails, confetti
│   ├── audio.js            # Procedural Web Audio synthesizer & optional SpeechSynthesis race caller
│   └── ui.js               # DOM state binding, Betting Board, Start Modal, Minimap, and HUD controls
├── grass.png               # Retained legacy texture (used as optional detail map / fallback)
├── horse1.png..horse5.png  # Retained legacy 2D sprites (used in UI form badges & 2D minimap tokens)
└── README.md               # Project documentation & 3D implementation roadmap
```

> **Note on Single-File Compatibility**: Just as `horse.html` currently works by double-clicking it directly from the filesystem (`file://`), the 3D upgrade in `horse.html` will bundle its Three.js module pipeline cleanly so it runs out-of-the-box without CORS errors when opened directly in a browser, while keeping the code cleanly sectioned by system.

---

## 6. Phased Implementation Roadmap

### Phase 1: Foundation & 3D Scene Bootstrap
- Set up the Three.js WebGLRenderer (`ACESFilmicToneMapping`, soft PCF shadow maps, responsive DPR cap) inside `horse.html`.
- Establish the Y-up metre coordinate frame (`X` track length, `Z` 5-lane width) and map the original simulation units (`START_X`, `FINISH_X`, `HEDGES_X`, `LANES_Y`) into 3D world coordinates (`1:1` deterministic correspondence).

### Phase 2: Procedural 3D Racecourse & Articulated Horses
- Build the procedural 3D racecourse: striped turf, dirt lanes, instanced white rails, starting stalls with animated gates, furlong poles, steeplechase hedges with takeoff bars, finish gantry, and grandstand.
- Build the procedural 3D articulated horse & jockey assemblies with per-runner silk colors, coat variations, 4-beat gallop animation, parabolic hedge-jumping posture, and stumble recovery animation.

### Phase 3: Weather Coupling, 3D VFX & Broadcast Cameras
- Implement the 4 weather states (`Clear`, `Rain`, `Wind`, `Rain & Wind`) with camera-wrapped 3D rain streaks, wind-bent vegetation, and wet ground material response.
- Hook up the pooled 3D VFX (hoof clods/splashes, golden burst trails, stumble particles, finish confetti).
- Implement the 4 switchable camera rigs (`TV Broadcast`, `Close Action`, `Jockey Chase`, `Aerial`) + photo-finish slow-mo cut and trauma shake.

### Phase 4: Web Audio Engine & Broadcast Tote UI
- Add the procedural Web Audio sound effects (hoofbeats, starting bell, crowd roar, jump brush, burst whoosh) and optional voice commentary toggle.
- Upgrade the HTML/CSS overlay into the *Royal Turf Club* broadcast HUD, preserving every keyboard shortcut (`1–5` pick horse, `Space` start/replay, `F` Flat, `H` Hedges) plus new 3D controls (`C` switch camera, `M` mute audio, `V` toggle voice caller, `D` visual debug panel).

### Phase 5: Visual Validation & QA (`threejs-visual-validation`)
- Verify all race combinations (`Flat` & `Hedges`, `5f` to `18f`, all 4 weather conditions, 1-player quick pick & 5-player local multiplayer).
- Validate deterministic seed replay, reduced-motion mode, and 60 FPS frame budget.

---

## 7. Controls Summary (Planned)

| Input | Action |
| :--- | :--- |
| **`1` – `5`** / Click Row | Select horse on the Betting Board |
| **`Space`** | Start Race / Instant Replay when finished |
| **`F`** / **`H`** | Switch between **Flat Race** and **Hedges (Steeplechase)** |
| **`C`** | Cycle 3D Camera Mode (`Broadcast` → `Action` → `Jockey Chase` → `Aerial` → `Free Orbit`) |
| **`M`** | Toggle Sound Effects (Web Audio synthesizer) |
| **`V`** | Toggle Live Voice Announcer (Speech Synthesis commentary) |
| **`D`** | Toggle 3D Visual Validation & Quality Tier Drawer |
| **Mouse Drag / Wheel** | Orbit / Zoom camera during pre-race paddock view or `Free Orbit` mode |

---

## Credits

Created by [SkdSam](https://github.com/skdsam).

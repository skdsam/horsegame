/* ============================================================================
 * Horse Rally 3D — Multi-Mode Broadcast Camera Rig, Auto-Cut Action Director & Trauma Shake
 * Skills: threejs-camera-direction, build-game-camera-controls
 * ============================================================================ */

import * as THREE from "three";
import { CAMERA_MODES, LANES_Z, SIM_TO_M, START_X, STATE, clamp, lerp } from "./config.js";

const ACTION_SHOTS = [
  { id: "broadcast_wide", label: "TV Wide Tracking", minDur: 7, maxDur: 11 },
  { id: "rail_low", label: "Low Rail Sweep", minDur: 5, maxDur: 8 },
  { id: "head_on", label: "Head-On Telephoto", minDur: 5, maxDur: 7 },
  { id: "jockey_chase", label: "Jockey Silk Cam", minDur: 6, maxDur: 9 },
  { id: "infield_reverse", label: "Infield Tracking", minDur: 5, maxDur: 8 },
  { id: "helicopter", label: "Helicopter Overhead", minDur: 6, maxDur: 9 },
  { id: "pack_duel", label: "Pack Battle Close-Up", minDur: 5, maxDur: 8 }
];

export class CameraDirector3D {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modeIndex = 0; // 0 = action (Auto-Cut Action Director default), 1 = broadcast, 2 = rail, 3 = chase, 4 = aerial, 5 = orbit
    this.currentPos = new THREE.Vector3(10, 6.5, 20);
    this.currentLookAt = new THREE.Vector3(14, 1.3, 0);
    this.desiredPos = new THREE.Vector3();
    this.desiredLookAt = new THREE.Vector3();

    this.trauma = 0;
    this.reducedMotion = false;

    // Action Director Auto-Cut state
    this.actionShotIndex = 0;
    this.actionShotTimer = 8.0;
    this.actionFocusHorse = 0;
    this.justCut = false;

    // Free Orbit user controls state
    this.orbitYaw = 0.35;
    this.orbitPitch = 0.32;
    this.orbitDistance = 18.5;
    this.isPointerDown = false;
    this.lastPointer = { x: 0, y: 0 };

    this._bindPointerControls();
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex].id;
  }

  get modeInfo() {
    const base = CAMERA_MODES[this.modeIndex];
    if (base.id === "action") {
      const shot = ACTION_SHOTS[this.actionShotIndex] || ACTION_SHOTS[0];
      return {
        ...base,
        subLabel: shot.label
      };
    }
    return base;
  }

  setModeById(id) {
    const idx = CAMERA_MODES.findIndex(m => m.id === id);
    if (idx !== -1) this.modeIndex = idx;
    return this.modeInfo;
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    if (this.mode === "action") {
      this._pickNextActionShot(9);
    }
    return this.modeInfo;
  }

  _pickNextActionShot(numHorses = 9) {
    // Pick a different shot from the current one for visual variety
    let next = Math.floor(Math.random() * ACTION_SHOTS.length);
    if (next === this.actionShotIndex) {
      next = (next + 1) % ACTION_SHOTS.length;
    }
    this.actionShotIndex = next;
    const shot = ACTION_SHOTS[next];
    this.actionShotTimer = shot.minDur + Math.random() * (shot.maxDur - shot.minDur);
    this.actionFocusHorse = Math.floor(Math.random() * numHorses);
    this.justCut = true;
  }

  addTrauma(amount) {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  _bindPointerControls() {
    if (!this.domElement) return;
    this.domElement.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      this.isPointerDown = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
    });

    window.addEventListener("pointermove", e => {
      if (!this.isPointerDown) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;

      this.orbitYaw -= dx * 0.0065;
      this.orbitPitch = clamp(this.orbitPitch + dy * 0.0055, 0.08, 1.25);
    });

    window.addEventListener("pointerup", () => {
      this.isPointerDown = false;
    });

    this.domElement.addEventListener("wheel", e => {
      this.orbitDistance = clamp(this.orbitDistance + e.deltaY * 0.014, 6.5, 48);
    }, { passive: true });
  }

  /**
   * Computes camera position & look-at target independently with frame-rate-independent smoothing
   */
  update(dt, context) {
    const {
      gameState,
      horses,
      leaderIdx,
      secondIdx,
      playerPick,
      finishSimX,
      raceFurlongs,
      nowSec
    } = context;

    const startM = START_X * SIM_TO_M;
    const finishM = finishSimX * SIM_TO_M;

    // Determine authoritative subject X & Z
    const leadHorse = horses[leaderIdx >= 0 ? leaderIdx : 0] || { x: START_X };
    const leadX = leadHorse.x * SIM_TO_M;
    const leadZ = LANES_Z[leaderIdx >= 0 ? leaderIdx : 0] || 0;

    const runnerUpHorse = horses[secondIdx >= 0 ? secondIdx : 1] || leadHorse;
    const runnerUpX = runnerUpHorse.x * SIM_TO_M;
    const runnerUpZ = LANES_Z[secondIdx >= 0 ? secondIdx : 1] || 0;

    const focusIdx = (playerPick != null && horses[playerPick]) ? playerPick : (leaderIdx >= 0 ? leaderIdx : 4);
    const focusHorse = horses[focusIdx] || leadHorse;
    const focusX = focusHorse.x * SIM_TO_M;
    const focusZ = LANES_Z[focusIdx] || 0;

    // Paddock / Pre-race idle camera when on Start or Betting Board
    if (gameState === STATE.BOARD || gameState === STATE.PICK || gameState === STATE.WAIT || gameState === STATE.COUNTDOWN) {
      if (this.mode === "orbit" || this.isPointerDown) {
        this._computeOrbitShot(startM + 1.2, 0);
      } else {
        // Gentle sweeping paddock showcase around the 9-bay starting stalls
        const angle = Math.sin(nowSec * 0.35) * 0.45 + 0.55;
        const dist = 17.5;
        this.desiredPos.set(
          startM + Math.cos(angle) * dist,
          4.6 + Math.sin(nowSec * 0.5) * 0.4,
          Math.sin(angle) * dist + 6.5
        );
        this.desiredLookAt.set(startM + 1.0, 1.35, focusZ * 0.35);
      }
    } else {
      // Racing or Finished camera modes
      const progress = clamp((leadX - startM) / Math.max(1, finishM - startM), 0, 1);

      // Automatic dramatic finish-line angle in the final 2% unless user is in Chase or Orbit
      if (progress > 0.98 && (this.mode === "action" || this.mode === "broadcast" || this.mode === "rail")) {
        this.desiredPos.set(finishM + 8.5, 3.2, 14.5);
        this.desiredLookAt.set(leadX, 1.35, 0);
      } else if (this.mode === "action") {
        // Dynamic Action Director: automatically rotates through 7 cinematic camera shots during the race
        this.actionShotTimer -= dt;
        if (this.actionShotTimer <= 0) {
          this._pickNextActionShot(horses.length);
        }

        const shotId = ACTION_SHOTS[this.actionShotIndex]?.id || "broadcast_wide";
        const drift = Math.sin(nowSec * 0.6);

        if (shotId === "broadcast_wide") {
          // Classic elevated TV broadcast tracking dolly
          const distFactor = clamp((raceFurlongs - 5) / (18 - 5), 0, 1);
          const leadAhead = lerp(3.2, 5.8, distFactor);
          this.desiredPos.set(leadX + leadAhead - 4.2, 6.4, 20.5);
          this.desiredLookAt.set(leadX + leadAhead * 0.45, 1.25, -0.5);
        } else if (shotId === "rail_low") {
          // Low-angle dramatic south rail sweep looking slightly back into the thundering hooves
          this.desiredPos.set(leadX + 5.5 + drift * 1.5, 1.75, 13.8);
          this.desiredLookAt.set(leadX - 1.2, 1.3, leadZ * 0.4);
        } else if (shotId === "head_on") {
          // Dramatic head-on front tracking shot down the center of the course
          this.desiredPos.set(leadX + 16.5, 2.55, drift * 3.5);
          this.desiredLookAt.set(leadX - 2.0, 1.35, leadZ * 0.3);
        } else if (shotId === "jockey_chase") {
          // Over-the-shoulder jockey silk chase cam behind player's horse or leader
          this.desiredPos.set(focusX - 5.2, 2.75, focusZ + 0.75);
          this.desiredLookAt.set(focusX + 9.0, 1.35, focusZ);
        } else if (shotId === "infield_reverse") {
          // North infield rail tracking shot with opposite perspective
          this.desiredPos.set(leadX + 2.5, 3.1, -15.5);
          this.desiredLookAt.set(leadX - 0.5, 1.3, leadZ * 0.3);
        } else if (shotId === "helicopter") {
          // High sweeping helicopter drone shot circling slightly above the pack
          this.desiredPos.set(leadX - 5.0 + drift * 4.0, 22.5, 13.5 + Math.cos(nowSec * 0.4) * 4.0);
          this.desiredLookAt.set(leadX + 2.5, 0.8, 0);
        } else if (shotId === "pack_duel") {
          // Tight side-by-side duel shot framing 1st and 2nd place battle
          const midX = (leadX + runnerUpX) * 0.5;
          const midZ = (leadZ + runnerUpZ) * 0.5;
          const sideZ = midZ >= 0 ? 14.5 : -14.5;
          this.desiredPos.set(midX + 1.5, 2.4, sideZ);
          this.desiredLookAt.set(midX, 1.35, midZ * 0.5);
        }
      } else if (this.mode === "broadcast") {
        // Elevated rail-side tracking dolly framing all 9 lanes
        const distFactor = clamp((raceFurlongs - 5) / (18 - 5), 0, 1);
        const leadAhead = lerp(3.2, 5.8, distFactor);
        this.desiredPos.set(leadX + leadAhead - 4.2, 6.4, 20.5);
        this.desiredLookAt.set(leadX + leadAhead * 0.45, 1.25, -0.5);
      } else if (this.mode === "rail") {
        // Low-angle dramatic rail-side sweeping shot
        this.desiredPos.set(leadX + 4.2, 2.35, 14.2);
        this.desiredLookAt.set(leadX - 0.5, 1.35, focusZ * 0.35);
      } else if (this.mode === "chase") {
        // Jockey 3rd-person chase rig behind player's horse (or leader)
        this.desiredPos.set(focusX - 5.4, 2.85, focusZ + 0.65);
        this.desiredLookAt.set(focusX + 8.5, 1.35, focusZ);
      } else if (this.mode === "aerial") {
        // Helicopter overhead view showing all 9 lanes and hedge lines
        this.desiredPos.set(leadX - 4.5, 25.0, 14.5);
        this.desiredLookAt.set(leadX + 3.5, 0.5, 0);
      } else {
        // Free Orbit around current leader
        this._computeOrbitShot(leadX, focusZ);
      }
    }

    // Crisp broadcast cut or smooth damped follow
    if (this.justCut && !this.reducedMotion) {
      this.justCut = false;
      this.currentPos.lerp(this.desiredPos, 0.65);
      this.currentLookAt.lerp(this.desiredLookAt, 0.75);
    } else {
      const posAlpha = 1 - Math.exp(-dt * 6.5);
      const lookAlpha = 1 - Math.exp(-dt * 9.0);
      this.currentPos.lerp(this.desiredPos, posAlpha);
      this.currentLookAt.lerp(this.desiredLookAt, lookAlpha);
    }

    // Apply trauma shake as a temporary modifier layered over the base camera
    let shakeX = 0, shakeY = 0, shakeZ = 0;
    if (this.trauma > 0 && !this.reducedMotion) {
      const shakeAmt = this.trauma * this.trauma * 0.45;
      shakeX = (Math.random() * 2 - 1) * shakeAmt;
      shakeY = (Math.random() * 2 - 1) * shakeAmt;
      shakeZ = (Math.random() * 2 - 1) * shakeAmt;
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }

    this.camera.position.set(
      this.currentPos.x + shakeX,
      Math.max(0.6, this.currentPos.y + shakeY),
      this.currentPos.z + shakeZ
    );
    this.camera.lookAt(this.currentLookAt);
  }

  _computeOrbitShot(centerX, centerZ) {
    const horiz = Math.cos(this.orbitPitch) * this.orbitDistance;
    const vert = Math.sin(this.orbitPitch) * this.orbitDistance;
    this.desiredPos.set(
      centerX - Math.sin(this.orbitYaw) * horiz,
      Math.max(1.0, 1.2 + vert),
      centerZ + Math.cos(this.orbitYaw) * horiz
    );
    this.desiredLookAt.set(centerX, 1.3, centerZ);
  }

  snapToTarget() {
    this.currentPos.copy(this.desiredPos);
    this.currentLookAt.copy(this.desiredLookAt);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}

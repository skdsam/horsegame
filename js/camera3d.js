/* ============================================================================
 * Horse Rally 3D — Multi-Mode Broadcast Camera Rig & Trauma Shake
 * Skills: threejs-camera-direction, build-game-camera-controls
 * ============================================================================ */

import * as THREE from "three";
import { CAMERA_MODES, LANES_Z, SIM_TO_M, START_X, STATE, clamp, lerp } from "./config.js";

export class CameraDirector3D {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.modeIndex = 0; // 0 = broadcast, 1 = action, 2 = chase, 3 = aerial, 4 = orbit
    this.currentPos = new THREE.Vector3(10, 6.5, 18);
    this.currentLookAt = new THREE.Vector3(14, 1.3, 0);
    this.desiredPos = new THREE.Vector3();
    this.desiredLookAt = new THREE.Vector3();

    this.trauma = 0;
    this.reducedMotion = false;

    // Free Orbit user controls state
    this.orbitYaw = 0.35;
    this.orbitPitch = 0.32;
    this.orbitDistance = 16.5;
    this.isPointerDown = false;
    this.lastPointer = { x: 0, y: 0 };

    this._bindPointerControls();
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex].id;
  }

  get modeInfo() {
    return CAMERA_MODES[this.modeIndex];
  }

  setModeById(id) {
    const idx = CAMERA_MODES.findIndex(m => m.id === id);
    if (idx !== -1) this.modeIndex = idx;
    return this.modeInfo;
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    return this.modeInfo;
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
      this.orbitDistance = clamp(this.orbitDistance + e.deltaY * 0.014, 6.5, 42);
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

    const focusIdx = (playerPick != null && horses[playerPick]) ? playerPick : (leaderIdx >= 0 ? leaderIdx : 2);
    const focusHorse = horses[focusIdx] || leadHorse;
    const focusX = focusHorse.x * SIM_TO_M;
    const focusZ = LANES_Z[focusIdx] || 0;

    // Paddock / Pre-race idle camera when on Start or Betting Board
    if (gameState === STATE.BOARD || gameState === STATE.PICK || gameState === STATE.WAIT || gameState === STATE.COUNTDOWN) {
      if (this.mode === "orbit" || this.isPointerDown) {
        this._computeOrbitShot(startM + 1.2, 0);
      } else {
        // Gentle sweeping paddock showcase around the starting stalls
        const angle = Math.sin(nowSec * 0.35) * 0.45 + 0.55;
        const dist = 13.5;
        this.desiredPos.set(
          startM + Math.cos(angle) * dist,
          3.8 + Math.sin(nowSec * 0.5) * 0.4,
          Math.sin(angle) * dist + 4.5
        );
        this.desiredLookAt.set(startM + 1.0, 1.35, focusZ * 0.4);
      }
    } else {
      // Racing or Finished camera modes
      const progress = clamp((leadX - startM) / Math.max(1, finishM - startM), 0, 1);

      // Automatic dramatic finish-line angle in the final 3% unless user is in Chase or Orbit
      if (progress > 0.965 && (this.mode === "broadcast" || this.mode === "action")) {
        this.desiredPos.set(finishM + 7.5, 2.6, 10.8);
        this.desiredLookAt.set(leadX, 1.35, 0);
      } else if (this.mode === "broadcast") {
        // Elevated rail-side tracking dolly (preserves 2D distance-aware look-ahead feel)
        const distFactor = clamp((raceFurlongs - 5) / (18 - 5), 0, 1);
        const leadAhead = lerp(3.2, 5.8, distFactor);
        this.desiredPos.set(leadX + leadAhead - 3.5, 5.2, 16.2);
        this.desiredLookAt.set(leadX + leadAhead * 0.45, 1.25, -0.5);
      } else if (this.mode === "action") {
        // Low-angle dramatic rail-side sweeping shot
        this.desiredPos.set(leadX + 3.8, 2.05, 10.6);
        this.desiredLookAt.set(leadX - 0.5, 1.35, focusZ * 0.35);
      } else if (this.mode === "chase") {
        // Jockey 3rd-person chase rig behind player's horse (or leader)
        this.desiredPos.set(focusX - 5.4, 2.85, focusZ + 0.65);
        this.desiredLookAt.set(focusX + 8.5, 1.35, focusZ);
      } else if (this.mode === "aerial") {
        // Helicopter overhead view showing pack formation and hedge lines
        this.desiredPos.set(leadX - 4.0, 21.0, 11.5);
        this.desiredLookAt.set(leadX + 3.5, 0.5, 0);
      } else {
        // Free Orbit around current leader
        this._computeOrbitShot(leadX, focusZ);
      }
    }

    // Frame-rate-independent damped convergence
    const posAlpha = 1 - Math.exp(-dt * 6.5);
    const lookAlpha = 1 - Math.exp(-dt * 9.0);
    this.currentPos.lerp(this.desiredPos, posAlpha);
    this.currentLookAt.lerp(this.desiredLookAt, lookAlpha);

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

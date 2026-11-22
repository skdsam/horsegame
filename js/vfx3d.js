/* ============================================================================
 * Horse Rally 3D — Object-Pooled 3D VFX & Particle Systems
 * Skill: create-game-vfx
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, rand } from "./config.js";

export class VFXSystem3D {
  constructor(scene) {
    this.scene = scene;
    this.maxParticles = 360;
    this.reducedMotion = false;

    const geo = new THREE.DodecahedronGeometry(0.11, 0);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.15
    });

    this.instMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.instMesh.castShadow = false;
    this.instMesh.frustumCulled = false;
    this.scene.add(this.instMesh);

    this.pool = [];
    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();

    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 1,
        gravity: 9.8,
        life: 0,
        maxLife: 1,
        colorHex: "#ffffff"
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0.001, 0.001, 0.001);
      this.dummy.updateMatrix();
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
      this.instMesh.setColorAt(i, this.tmpColor.set("#ffffff"));
    }
    this.instMesh.instanceMatrix.needsUpdate = true;
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;

    this.nextIndex = 0;
  }

  spawn({ x, y, z, vx, vy, vz, colorHex, scale = 1.0, life = 0.5, gravity = 9.8 }) {
    if (this.reducedMotion) return;
    const idx = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % this.maxParticles;

    const p = this.pool[idx];
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.scale = scale;
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity;
    p.colorHex = colorHex;

    this.instMesh.setColorAt(idx, this.tmpColor.set(colorHex));
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Emits turf clods or wet rain spray behind a galloping horse's hooves
   */
  emitHoofClods(worldX, laneZ, isWet) {
    if (this.reducedMotion) return;
    const count = isWet ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const col = isWet
        ? (i % 2 === 0 ? "#c2e0ff" : "#3a5743")
        : (i % 2 === 0 ? "#4e3620" : "#2b6e34");
      this.spawn({
        x: worldX - 0.55 + rand(-0.2, 0.2),
        y: 0.12,
        z: laneZ + rand(-0.24, 0.24),
        vx: rand(-4.5, -1.8),
        vy: rand(1.6, 3.6),
        vz: rand(-0.9, 0.9),
        colorHex: col,
        scale: rand(0.65, 1.15),
        life: rand(0.28, 0.48),
        gravity: 11.5
      });
    }
  }

  /**
   * Emits golden & team-silk aerodynamic sparks during an AI burst surge (>>>)
   */
  emitBurstTrail(worldX, jumpY, laneZ, silkColorHex) {
    if (this.reducedMotion) return;
    for (let i = 0; i < 2; i++) {
      this.spawn({
        x: worldX - 0.65,
        y: 1.15 + jumpY + rand(-0.25, 0.35),
        z: laneZ + rand(-0.28, 0.28),
        vx: rand(-6.5, -3.2),
        vy: rand(-0.4, 0.8),
        vz: rand(-0.6, 0.6),
        colorHex: i === 0 ? "#ffd76a" : silkColorHex,
        scale: rand(0.75, 1.3),
        life: rand(0.25, 0.42),
        gravity: 0.5
      });
    }
  }

  /**
   * Emits foliage & soil burst when clearing a steeplechase hedge
   */
  emitHedgeTakeoff(worldX, laneZ) {
    if (this.reducedMotion) return;
    for (let i = 0; i < 10; i++) {
      this.spawn({
        x: worldX,
        y: 0.45 + rand(0, 0.5),
        z: laneZ + rand(-0.4, 0.4),
        vx: rand(-3.5, 1.2),
        vy: rand(1.8, 4.2),
        vz: rand(-1.6, 1.6),
        colorHex: i % 2 === 0 ? "#208c3c" : "#5e3e29",
        scale: rand(0.8, 1.35),
        life: rand(0.4, 0.75),
        gravity: 9.5
      });
    }
  }

  /**
   * Emits dramatic crimson/amber warning burst when a horse stumbles
   */
  emitStumbleBurst(worldX, laneZ) {
    for (let i = 0; i < 22; i++) {
      this.spawn({
        x: worldX + rand(-0.4, 0.4),
        y: 0.8 + rand(0, 0.8),
        z: laneZ + rand(-0.5, 0.5),
        vx: rand(-4.0, 4.0),
        vy: rand(2.2, 6.0),
        vz: rand(-4.0, 4.0),
        colorHex: i % 2 === 0 ? "#ff526d" : "#ffd76a",
        scale: rand(1.0, 1.65),
        life: rand(0.55, 1.15),
        gravity: 9.0
      });
    }
  }

  /**
   * Emits Winner's Enclosure multi-color confetti at the finish gantry
   */
  emitFinishConfetti(finishWorldX, laneZ) {
    const count = this.reducedMotion ? 16 : 65;
    for (let i = 0; i < count; i++) {
      const col = COLORS[i % COLORS.length];
      this.spawn({
        x: finishWorldX + rand(-1.5, 1.5),
        y: 2.2 + rand(0, 2.2),
        z: laneZ + rand(-3.5, 3.5),
        vx: rand(-3.5, 4.5),
        vy: rand(2.5, 7.0),
        vz: rand(-4.5, 4.5),
        colorHex: col,
        scale: rand(0.9, 1.5),
        life: rand(1.4, 2.6),
        gravity: 3.8
      });
    }
  }

  clearAll() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool[i].active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0.001, 0.001, 0.001);
      this.dummy.updateMatrix();
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.instMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      dirty = true;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0.001, 0.001, 0.001);
        this.dummy.updateMatrix();
        this.instMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= p.gravity * dt;

      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy *= -0.3;
        p.vx *= 0.7;
      }

      const lifeRatio = Math.max(0.05, p.life / p.maxLife);
      const s = p.scale * lifeRatio;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 4, p.life * 6, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
    }

    if (dirty) {
      this.instMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

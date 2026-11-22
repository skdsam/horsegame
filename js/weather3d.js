/* ============================================================================
 * Horse Rally 3D — Coupled Precipitation, Wind & Surface Wetness System
 * Skill: threejs-precipitation-surfaces
 * ============================================================================ */

import * as THREE from "three";
import { clamp, lerp } from "./config.js";

export class WeatherSystem3D {
  constructor(scene, racecourseBuilder) {
    this.scene = scene;
    this.course = racecourseBuilder;

    this.rainCount = 650;
    this.rainVolume = { width: 46, height: 18, depth: 26 };

    // Thin elongated raindrop streak geometry
    const dropGeo = new THREE.BoxGeometry(0.025, 0.72, 0.025);
    const dropMat = new THREE.MeshBasicMaterial({
      color: "#c8e0ff",
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });

    this.rainInst = new THREE.InstancedMesh(dropGeo, dropMat, this.rainCount);
    this.rainInst.visible = false;
    this.rainInst.frustumCulled = false;
    this.scene.add(this.rainInst);

    this.drops = [];
    for (let i = 0; i < this.rainCount; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * this.rainVolume.width,
        y: Math.random() * this.rainVolume.height,
        z: (Math.random() - 0.5) * this.rainVolume.depth,
        speed: 14 + Math.random() * 6
      });
    }

    // Ground splash ring pool on upward-facing wet turf
    this.splashCount = 90;
    const ringGeo = new THREE.RingGeometry(0.05, 0.16, 12);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: "#d9ecff",
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.splashInst = new THREE.InstancedMesh(ringGeo, ringMat, this.splashCount);
    this.splashInst.visible = false;
    this.splashInst.frustumCulled = false;
    this.scene.add(this.splashInst);

    this.splashes = [];
    for (let i = 0; i < this.splashCount; i++) {
      this.splashes.push({
        x: (Math.random() - 0.5) * 36,
        z: (Math.random() - 0.5) * 14,
        phase: Math.random()
      });
    }

    this.wetness = 0.0;
    this.targetWetness = 0.0;
    this.dummy = new THREE.Object3D();
  }

  /**
   * Configures weather envelope & couples surface roughness/color + lighting
   */
  applyWeatherEnvelope(weatherName, windForce, lightingRefs) {
    const isRain = weatherName.includes("Rain");
    const isWind = weatherName.includes("Wind");

    this.targetWetness = isRain ? 1.0 : 0.0;
    this.rainInst.visible = isRain;
    this.splashInst.visible = isRain;

    // Couple sky, fog, and sun intensity to weather state
    if (lightingRefs) {
      const { sunLight, hemiLight, fog, renderer } = lightingRefs;
      if (isRain && isWind) {
        sunLight.intensity = 1.35;
        sunLight.color.set("#b9cbe6");
        hemiLight.intensity = 0.85;
        fog.color.set("#28374f");
        fog.near = 45;
        fog.far = 260;
        renderer.setClearColor("#28374f");
      } else if (isRain) {
        sunLight.intensity = 1.65;
        sunLight.color.set("#c7d8f0");
        hemiLight.intensity = 0.95;
        fog.color.set("#364966");
        fog.near = 60;
        fog.far = 310;
        renderer.setClearColor("#364966");
      } else if (isWind) {
        sunLight.intensity = 2.55;
        sunLight.color.set("#fff2d6");
        hemiLight.intensity = 1.1;
        fog.color.set("#5c85b8");
        fog.near = 85;
        fog.far = 420;
        renderer.setClearColor("#5c85b8");
      } else {
        // Clear Golden-Hour Royal Turf Day
        sunLight.intensity = 2.85;
        sunLight.color.set("#fff4dc");
        hemiLight.intensity = 1.18;
        fog.color.set("#6b9cf2");
        fog.near = 95;
        fog.far = 460;
        renderer.setClearColor("#6b9cf2");
      }
    }
  }

  update(dt, cameraTargetX, weatherName, windForce) {
    // Smoothly transition surface wetness
    this.wetness = lerp(this.wetness, this.targetWetness, clamp(dt * 3.0, 0, 1));

    // Couple track surface roughness & metalness to wetness (threejs-precipitation-surfaces)
    if (this.course && this.course.turfMaterial) {
      // Wet turf becomes darker, more specular (lower roughness)
      this.course.turfMaterial.roughness = lerp(0.86, 0.24, this.wetness);
      this.course.turfMaterial.metalness = lerp(0.03, 0.18, this.wetness);
      const dryCol = new THREE.Color("#ffffff");
      const wetCol = new THREE.Color("#9ab0a2");
      this.course.turfMaterial.color.lerpColors(dryCol, wetCol, this.wetness);
    }

    if (!weatherName.includes("Rain")) return;

    const w = windForce || 0;
    const tiltAngle = clamp(w * 0.08, -0.45, 0.45);
    const halfW = this.rainVolume.width * 0.5;
    const h = this.rainVolume.height;

    // Update camera-wrapped instanced 3D rain streaks
    for (let i = 0; i < this.rainCount; i++) {
      const d = this.drops[i];
      d.y -= d.speed * dt;
      d.x += w * 1.4 * dt;

      if (d.y < 0) {
        d.y += h;
        d.x = (Math.random() - 0.5) * this.rainVolume.width;
      }
      if (d.x > halfW) d.x -= this.rainVolume.width;
      if (d.x < -halfW) d.x += this.rainVolume.width;

      this.dummy.position.set(cameraTargetX + d.x, d.y, d.z);
      this.dummy.rotation.set(0, 0, -tiltAngle);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.rainInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.rainInst.instanceMatrix.needsUpdate = true;

    // Update upward-surface splash ripples on wet turf
    for (let i = 0; i < this.splashCount; i++) {
      const s = this.splashes[i];
      s.phase += dt * 2.6;
      if (s.phase >= 1.0) {
        s.phase -= 1.0;
        s.x = (Math.random() - 0.5) * 38;
        s.z = (Math.random() - 0.5) * 14;
      }
      const scale = 0.3 + s.phase * 1.4;
      this.dummy.position.set(cameraTargetX + s.x, 0.025, s.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(scale, 1, scale);
      this.dummy.updateMatrix();
      this.splashInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.splashInst.instanceMatrix.needsUpdate = true;
  }
}

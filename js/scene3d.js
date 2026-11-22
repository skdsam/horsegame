/* ============================================================================
 * Horse Rally 3D — Three.js Scene Manager, Lighting & Visual Validation
 * Skills: threejs-skill-router, threejs-visual-validation
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, NUM_HORSES, SIM_TO_M } from "./config.js";
import { createHorseActor } from "./horse3d.js";
import { RacecourseBuilder } from "./track3d.js";
import { WeatherSystem3D } from "./weather3d.js";
import { VFXSystem3D } from "./vfx3d.js";
import { CameraDirector3D } from "./camera3d.js";

export class SceneManager3D {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;

    this.qualityTier = "high"; // "high" | "balanced" | "reduced"
    this.debugMode = "off";    // "off" | "wireframe" | "weather"

    // 1. WebGLRenderer setup with ACESFilmicToneMapping (no-post baseline that reads cleanly)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor("#6b9cf2");

    // 2. Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.fog = new THREE.Fog("#6b9cf2", 95, 460);
    this.scene.fog = this.fog;

    // 3. Perspective Camera
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.4, 700);

    // 4. Lighting System (Directional Sun following the pack + Hemisphere Sky/Turf fill)
    this.hemiLight = new THREE.HemisphereLight("#e6f2ff", "#1c5428", 1.18);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight("#fff4dc", 2.85);
    this.sunLight.position.set(30, 38, 26);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 140;
    const d = 22;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 5. Subsystems
    this.course = new RacecourseBuilder(this.scene);
    this.weatherSystem = new WeatherSystem3D(this.scene, this.course);
    this.vfx = new VFXSystem3D(this.scene);
    this.cameraDirector = new CameraDirector3D(this.camera, this.canvas);

    // 6. 5 Articulated 3D Horse & Jockey Actors
    this.horseActors = [];
    for (let i = 0; i < NUM_HORSES; i++) {
      const actor = createHorseActor(i, COLORS[i % COLORS.length]);
      this.scene.add(actor.root);
      this.horseActors.push(actor);
    }

    // Telemetry state
    this.fps = 60;
    this._frameCount = 0;
    this._fpsAccum = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const stageEl = this.canvas.parentElement;
    if (!stageEl) return;
    const w = Math.max(320, stageEl.clientWidth);
    const h = Math.max(420, stageEl.clientHeight);
    const maxDpr = this.qualityTier === "high" ? 2 : 1.25;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    if (this.minimapCanvas && this.minimapCtx) {
      const mw = this.minimapCanvas.clientWidth || 420;
      const mh = this.minimapCanvas.clientHeight || 48;
      this.minimapCanvas.width = Math.floor(mw * dpr);
      this.minimapCanvas.height = Math.floor(mh * dpr);
      this.minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.minimapW = mw;
      this.minimapH = mh;
    }
  }

  setQualityTier(tier) {
    this.qualityTier = tier;
    const isReduced = tier === "reduced";
    this.vfx.reducedMotion = isReduced;
    this.cameraDirector.reducedMotion = isReduced;
    this.renderer.shadowMap.enabled = tier !== "reduced";
    this.resize();
  }

  setDebugMode(mode) {
    this.debugMode = mode;
    const wire = mode === "wireframe";
    this.scene.traverse(obj => {
      if (obj.isMesh && obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => { m.wireframe = wire; });
        } else {
          obj.material.wireframe = wire;
        }
      }
    });
  }

  updateSunFollow(focusWorldX) {
    // Keep shadow frustum centered on the racing pack so shadows stay crisp across 18 furlongs
    this.sunLight.position.set(focusWorldX + 24, 36, 24);
    this.sunLight.target.position.set(focusWorldX, 0, 0);
    this.sunLight.target.updateMatrixWorld();
  }

  renderFrame(dt) {
    this._frameCount++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._frameCount / this._fpsAccum);
      this._frameCount = 0;
      this._fpsAccum = 0;
    }

    this.renderer.render(this.scene, this.camera);
  }

  getTelemetry() {
    const info = this.renderer.info;
    return {
      fps: this.fps,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      wetness: this.weatherSystem.wetness.toFixed(2)
    };
  }
}

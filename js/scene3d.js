/* ============================================================================
 * Horse Rally 3D — Three.js Scene Manager, Lighting & Visual Validation
 * Skills: threejs-skill-router, threejs-visual-validation
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, NUM_HORSES, SIM_TO_M, clamp, lerp } from "./config.js";
import { createHorseActor } from "./horse3d.js";
import { RacecourseBuilder } from "./track3d.js";
import { WeatherSystem3D } from "./weather3d.js";
import { VFXSystem3D } from "./vfx3d.js";
import { CameraDirector3D } from "./camera3d.js";

/**
 * Generates a procedural equirectangular gradient sky dome texture
 * transitioning from bright Royal Turf afternoon to warm Golden-Hour sunset
 */
function createSkyDomeShaderMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color("#29589e") },
      horizonColor: { value: new THREE.Color("#8ec5ff") },
      sunColor: { value: new THREE.Color("#ffe596") },
      sunDir: { value: new THREE.Vector3(0.55, 0.45, 0.4).normalize() }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 d = normalize(vWorldPos - cameraPosition);
        float h = clamp(d.y * 1.35, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.65));
        float sunAmt = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(sunAmt, 14.0) * 0.45;
        col += sunColor * smoothstep(0.996, 0.9995, sunAmt) * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}

export class SceneManager3D {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;

    this.qualityTier = "high"; // "high" | "balanced" | "reduced"
    this.debugMode = "off";    // "off" | "wireframe" | "weather"

    // 1. WebGLRenderer setup with ACESFilmicToneMapping
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor("#6b9cf2");

    // 2. Scene, Physical Sky Dome & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.fog = new THREE.Fog("#6b9cf2", 110, 520);
    this.scene.fog = this.fog;

    this.skyMat = createSkyDomeShaderMaterial();
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(580, 24, 16), this.skyMat);
    this.scene.add(this.skyDome);

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

  updateSunFollow(focusWorldX, raceProgress = 0, weatherName = "Clear") {
    // Keep sky dome centered on camera so horizon never clips across multi-kilometre courses
    this.skyDome.position.copy(this.camera.position);

    // Dynamic Time-of-Day progression: sun descends gently into Golden Hour as race progresses (0 -> 1)
    const sunElev = lerp(38, 17, clamp(raceProgress, 0, 1));
    this.sunLight.position.set(focusWorldX + 28, sunElev, 24);
    this.sunLight.target.position.set(focusWorldX, 0, 0);
    this.sunLight.target.updateMatrixWorld();

    // Update sky dome colors based on weather and golden-hour progress
    const isRain = weatherName.includes("Rain");
    if (isRain) {
      this.skyMat.uniforms.topColor.value.set("#1f2b3d");
      this.skyMat.uniforms.horizonColor.value.set("#435875");
      this.skyMat.uniforms.sunColor.value.set("#8aa0bd");
    } else {
      const topDay = new THREE.Color("#22559c");
      const topDusk = new THREE.Color("#1b2956");
      const horDay = new THREE.Color("#8ac2ff");
      const horDusk = new THREE.Color("#f59e56");
      const g = clamp(raceProgress * 1.15, 0, 1);
      this.skyMat.uniforms.topColor.value.lerpColors(topDay, topDusk, g);
      this.skyMat.uniforms.horizonColor.value.lerpColors(horDay, horDusk, g);
      this.skyMat.uniforms.sunColor.value.set("#ffd27d");
      this.sunLight.color.lerpColors(new THREE.Color("#fff5de"), new THREE.Color("#ffbe6b"), g);
      this.fog.color.lerpColors(new THREE.Color("#73a8f5"), new THREE.Color("#c98a63"), g * 0.75);
    }
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

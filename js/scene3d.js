/* ============================================================================
 * Horse Rally 3D — Three.js Scene Manager, Physical HDR PMREM Lighting,
 * Rayleigh/Mie Atmosphere, Texel-Snapped Shadows & Visual Validation
 * Skills: threejs-skill-router, 3d-metal-material, threejs-shadow-systems,
 *         threejs-atmosphere-aerial-perspective, threejs-visual-validation
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, NUM_HORSES, SIM_TO_M, clamp, lerp } from "./config.js";
import { createHorseActor } from "./horse3d.js";
import { RacecourseBuilder } from "./track3d.js";
import { WeatherSystem3D } from "./weather3d.js";
import { VFXSystem3D } from "./vfx3d.js";
import { CameraDirector3D } from "./camera3d.js";

/**
 * Builds a high-contrast HDR outdoor & studio-card scene for PMREMGenerator
 * so conductor metals (steel stirrups, brass finials, gold crowns) and
 * clearcoat equine coats reflect structured HDR highlights instead of flat grey.
 * Skill: 3d-metal-material
 */
function generatePhysicalEnvironmentMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color().setRGB(0.06, 0.11, 0.22, THREE.LinearSRGBColorSpace);

  // Sky zenith dome hemisphere
  const skyGeo = new THREE.SphereGeometry(40, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        vec3 d = normalize(vPos);
        vec3 turfBounce = vec3(0.06, 0.18, 0.07);
        vec3 horizon = vec3(0.75, 0.85, 1.15);
        vec3 zenith = vec3(0.14, 0.30, 0.68);
        vec3 col = d.y < 0.0
          ? mix(horizon * 0.4, turfBounce, clamp(-d.y * 2.5, 0.0, 1.0))
          : mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // High-radiance HDR Sun & Sky Light Cards (toneMapped: false, linear radiance > 1.0)
  const addCard = (w, h, pos, lookAt, rgb) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace),
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
  };

  // Primary solar key card (linear radiance 4.2, 3.8, 3.1)
  addCard(10, 10, [18, 22, 14], [0, 0, 0], [4.2, 3.8, 3.1]);
  // Cool sky fill card
  addCard(16, 10, [-18, 14, -12], [0, 0, 0], [0.85, 1.15, 1.65]);
  // Warm grandstand bounce card
  addCard(18, 8, [0, 8, -20], [0, 0, 0], [1.65, 1.35, 0.92]);
  // Crisp horizon rim ribbon
  addCard(28, 3.5, [12, 5, 22], [0, 0, 0], [2.4, 2.2, 1.85]);

  const rt = pmrem.fromScene(envScene, 0.008);
  pmrem.dispose();
  return rt.texture;
}

/**
 * Generates a physically motivated Rayleigh + Mie scattering sky dome shader
 * Skill: threejs-atmosphere-aerial-perspective
 */
function createSkyDomeShaderMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color("#1c4587") },
      horizonColor: { value: new THREE.Color("#9ec9ff") },
      groundColor: { value: new THREE.Color("#143b1c") },
      sunColor: { value: new THREE.Color("#fff1c2") },
      sunDir: { value: new THREE.Vector3(0.55, 0.48, 0.42).normalize() }
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
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 d = normalize(vWorldPos - cameraPosition);
        vec3 sDir = normalize(sunDir);
        float cosTheta = max(dot(d, sDir), 0.0);

        /* Rayleigh vertical gradient + horizon aerosol optical thickness */
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(horizonColor, topColor, pow(h, 0.58));
        if (d.y < 0.0) {
          sky = mix(horizonColor * 0.85, groundColor, clamp(-d.y * 4.0, 0.0, 1.0));
        }

        /* Mie forward-scattering solar aureole + crisp solar disc */
        float mieAureole = pow(cosTheta, 8.0) * 0.32 + pow(cosTheta, 64.0) * 0.55;
        float solarDisc = smoothstep(0.9982, 0.9996, cosTheta) * 1.6;
        vec3 col = sky + sunColor * (mieAureole + solarDisc);

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
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor("#6b9cf2");

    // 2. Scene, Physical PMREM Environment, Sky Dome & Aerial Perspective Fog
    this.scene = new THREE.Scene();
    this.envTexture = generatePhysicalEnvironmentMap(this.renderer);
    this.scene.environment = this.envTexture;
    if ("environmentIntensity" in this.scene) {
      this.scene.environmentIntensity = 0.85;
    }

    this.fog = new THREE.Fog("#8eb9f5", 125, 560);
    this.scene.fog = this.fog;

    this.skyMat = createSkyDomeShaderMaterial();
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), this.skyMat);
    this.scene.add(this.skyDome);

    // 3. Perspective Camera
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.4, 750);

    // 4. Physically Motivated 3-Point Outdoor Lighting (Key Sun + Sky/Turf Hemisphere + Rim Bounce)
    this.hemiLight = new THREE.HemisphereLight("#e6f2ff", "#1a4d24", 1.05);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight("#fff3d6", 3.1);
    this.sunLight.position.set(30, 38, 26);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 145;
    this.shadowHalfExtent = 26;
    const d = this.shadowHalfExtent;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    // Scale normalBias by world-space texel width to prevent shadow acne on double-sided & curved meshes
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.018;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle opposite rim directional light to separate dark coats (Black Satin / Seal Brown) from turf
    this.rimLight = new THREE.DirectionalLight("#9ec5ff", 0.65);
    this.rimLight.position.set(-25, 18, -28);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // 5. Subsystems
    this.course = new RacecourseBuilder(this.scene);
    this.weatherSystem = new WeatherSystem3D(this.scene, this.course);
    this.vfx = new VFXSystem3D(this.scene);
    this.cameraDirector = new CameraDirector3D(this.camera, this.canvas);

    // 6. 9 Articulated, Anatomically Sculpted 3D Horse & Jockey Actors
    this.horseActors = [];
    for (let i = 0; i < NUM_HORSES; i++) {
      const actor = createHorseActor(i, COLORS[i % COLORS.length]);
      this.scene.add(actor.root);
      this.horseActors.push(actor);
    }

    // Bind envMap explicitly to metallic materials for r163+ compatibility (Skill: 3d-metal-material)
    this.bindEnvironmentToSceneMaterials();

    // Telemetry state
    this.fps = 60;
    this._frameCount = 0;
    this._fpsAccum = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  bindEnvironmentToSceneMaterials() {
    if (!this.envTexture) return;
    this.scene.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
            m.envMap = this.envTexture;
            if (m.metalness > 0.5 && m.envMapIntensity === 1) {
              m.envMapIntensity = 1.15;
            }
          }
        });
      }
    });
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
    this.skyDome.position.copy(this.camera.position);

    // Snap shadow target X to shadow-map world texel grid to eliminate shadow edge shimmering (Skill: threejs-shadow-systems)
    const texelWorldSize = (this.shadowHalfExtent * 2) / 2048;
    const snappedX = Math.round(focusWorldX / texelWorldSize) * texelWorldSize;

    // Dynamic Time-of-Day progression: sun descends gently into Golden Hour as race progresses (0 -> 1)
    const sunElev = lerp(38, 17, clamp(raceProgress, 0, 1));
    const sunOffset = new THREE.Vector3(28, sunElev, 24);
    this.sunLight.position.set(snappedX + sunOffset.x, sunOffset.y, sunOffset.z);
    this.sunLight.target.position.set(snappedX, 0, 0);
    this.sunLight.target.updateMatrixWorld();

    this.rimLight.position.set(snappedX - 24, 18, -28);
    this.rimLight.target.position.set(snappedX, 1, 0);
    this.rimLight.target.updateMatrixWorld();

    // Sync sky dome sunDir with real directional light vector (Skill: threejs-atmosphere-aerial-perspective)
    this.skyMat.uniforms.sunDir.value.copy(sunOffset).normalize();

    const isRain = weatherName.includes("Rain");
    if (isRain) {
      this.skyMat.uniforms.topColor.value.set("#1b2638");
      this.skyMat.uniforms.horizonColor.value.set("#425773");
      this.skyMat.uniforms.sunColor.value.set("#859bb8");
    } else {
      const topDay = new THREE.Color("#1c4587");
      const topDusk = new THREE.Color("#19254f");
      const horDay = new THREE.Color("#96c5ff");
      const horDusk = new THREE.Color("#f09b59");
      const g = clamp(raceProgress * 1.15, 0, 1);
      this.skyMat.uniforms.topColor.value.lerpColors(topDay, topDusk, g);
      this.skyMat.uniforms.horizonColor.value.lerpColors(horDay, horDusk, g);
      this.skyMat.uniforms.sunColor.value.set("#ffd98e");
      this.sunLight.color.lerpColors(new THREE.Color("#fff5de"), new THREE.Color("#ffc373"), g);
      this.fog.color.lerpColors(new THREE.Color("#88b7f7"), new THREE.Color("#c98e68"), g * 0.72);
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

/* ============================================================================
 * Horse Rally 3D — High-Detail Procedural Racecourse Architecture, PBR Materials,
 * Starting Stalls, Multi-Layer Steeplechase Hedges, Water Jumps & Grandstands
 * Skills: threejs-procedural-geometry, threejs-procedural-architecture,
 *         threejs-procedural-materials, threejs-procedural-vegetation, 3d-metal-material
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, LANES_Z, NUM_HORSES, PX_PER_FURLONG, SIM_TO_M, START_X, clamp, lerp } from "./config.js";

/**
 * Generates coupled Albedo + Normal + Roughness procedural turf maps
 * Skill: threejs-procedural-materials (shared cause for color, normal, and roughness)
 */
function createTurfPBRTextureBundle() {
  const size = 512;
  const cAlbedo = document.createElement("canvas");
  cAlbedo.width = size;
  cAlbedo.height = size;
  const ctxA = cAlbedo.getContext("2d");

  const cNormal = document.createElement("canvas");
  cNormal.width = size;
  cNormal.height = size;
  const ctxN = cNormal.getContext("2d");

  // Base two-tone mowed turf lawn stripes along X
  ctxA.fillStyle = "#1b632c";
  ctxA.fillRect(0, 0, 256, 512);
  ctxA.fillStyle = "#227536";
  ctxA.fillRect(256, 0, 256, 512);

  // Subtle worn running paths along the 9 lanes
  ctxA.fillStyle = "rgba(42, 30, 18, 0.16)";
  for (let i = 0; i < 9; i++) {
    const y = 44 + i * 49;
    ctxA.fillRect(0, y, 512, 18);
  }

  // Flat normal baseline
  ctxN.fillStyle = "rgb(128, 128, 255)";
  ctxN.fillRect(0, 0, size, size);

  // Coupled organic turf blade micro-relief & soil grain
  for (let i = 0; i < 5500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const isLight = Math.random() > 0.48;
    ctxA.fillStyle = isLight ? "rgba(180,240,140,0.055)" : "rgba(10,25,12,0.075)";
    ctxA.fillRect(x, y, 3, 2);

    const nx = isLight ? 148 : 108;
    const ny = isLight ? 146 : 110;
    ctxN.fillStyle = `rgb(${nx}, ${ny}, 245)`;
    ctxN.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(cAlbedo);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(60, 1);
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = new THREE.CanvasTexture(cNormal);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(60, 1);

  return { map, normalMap };
}

function createCheckeredTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  const size = 32;
  for (let y = 0; y < 256; y += size) {
    for (let x = 0; x < 64; x += size) {
      const even = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = even ? "#ffffff" : "#12151f";
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBannerTexture(text, bgHex = "#102048", accentHex = "#e5c158") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d");

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 88);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 40px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 50);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RacecourseBuilder {
  constructor(scene) {
    this.scene = scene;
    this.trackGroup = new THREE.Group();
    this.trackGroup.name = "RacecourseGroup";
    this.scene.add(this.trackGroup);

    const turfBundle = createTurfPBRTextureBundle();
    this.turfTexture = turfBundle.map;
    this.turfNormalMap = turfBundle.normalMap;
    this.checkeredTexture = createCheckeredTexture();

    this.turfMaterial = new THREE.MeshStandardMaterial({
      map: this.turfTexture,
      normalMap: this.turfNormalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.84,
      metalness: 0.04
    });

    this.infieldMaterial = new THREE.MeshStandardMaterial({
      color: "#154f24",
      roughness: 0.90,
      metalness: 0.02
    });

    // Glossy UV-stabilized white PVC running rail material with clearcoat
    this.railMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f4f7ff",
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2
    });

    // Conductor Metal Materials (Skill: 3d-metal-material)
    this.steelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.56, 0.57, 0.58, THREE.LinearSRGBColorSpace),
      metalness: 1.0,
      roughness: 0.22
    });

    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.89, 0.72, 0.36, THREE.LinearSRGBColorSpace),
      metalness: 1.0,
      roughness: 0.18
    });

    this.darkIronMaterial = new THREE.MeshStandardMaterial({
      color: "#18243d",
      metalness: 0.78,
      roughness: 0.32
    });

    this.timberMaterial = new THREE.MeshStandardMaterial({
      color: "#5c3a1e",
      roughness: 0.75,
      metalness: 0.04
    });

    this.hedgeFoliageMaterial = new THREE.MeshStandardMaterial({
      color: "#155927",
      roughness: 0.78
    });

    this.hedgeTopSprigMaterial = new THREE.MeshStandardMaterial({
      color: "#227839",
      roughness: 0.72
    });

    this.takeoffBarMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f59e0b",
      roughness: 0.32,
      clearcoat: 0.35
    });

    this.waterPitMaterial = new THREE.MeshPhysicalMaterial({
      color: "#165e8f",
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06
    });

    this.floodlightBulbMat = new THREE.MeshStandardMaterial({
      color: "#fff7d6",
      emissive: "#ffcf56",
      emissiveIntensity: 0.25
    });

    // Live 3D Jumbotron Canvas Texture shared across course screens
    this.jumbotronCanvas = document.createElement("canvas");
    this.jumbotronCanvas.width = 512;
    this.jumbotronCanvas.height = 256;
    this.jumbotronTex = new THREE.CanvasTexture(this.jumbotronCanvas);
    this.jumbotronTex.colorSpace = THREE.SRGBColorSpace;
    this.jumbotronMat = new THREE.MeshBasicMaterial({ map: this.jumbotronTex });
    this._lastJumbotronUpdate = 0;

    // Camera-Wrapped 3D Waving Grass Blades along rails (threejs-procedural-vegetation)
    this.grassBladeCount = 750;
    this.grassWrapWidth = 72;
    this.grassOffsets = [];
    this._initCameraWrappedGrass();

    // Persistent 3D Hoof Divot ring buffer on the turf
    this.maxDivots = 280;
    this.divotNextIdx = 0;
    this._initDivotPool();

    this.stallGates = [];
    this.treeCrownsMesh = null;
    this.treeCrownBaseMatrices = [];
    this.furlongFlags = [];
    this.waterJumpSimXSet = new Set();
    this.fountainJets = [];
    this.cloudMesh = null;
    this.cloudData = [];
  }

  _initCameraWrappedGrass() {
    const bladeGeo = new THREE.ConeGeometry(0.06, 0.38, 3);
    bladeGeo.translate(0, 0.19, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: "#2a8c3f",
      roughness: 0.72
    });
    this.grassInst = new THREE.InstancedMesh(bladeGeo, bladeMat, this.grassBladeCount);
    this.grassInst.frustumCulled = false;
    this.scene.add(this.grassInst);

    const railHalf = 11.65;
    for (let i = 0; i < this.grassBladeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const zBand = side * (railHalf - 0.35 + (Math.random() * 4.2));
      this.grassOffsets.push({
        dx: (Math.random() - 0.5) * this.grassWrapWidth,
        z: zBand,
        scale: 0.7 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  _initDivotPool() {
    const divotGeo = new THREE.PlaneGeometry(0.32, 0.16);
    divotGeo.rotateX(-Math.PI / 2);
    const divotMat = new THREE.MeshBasicMaterial({
      color: "#2b1c10",
      transparent: true,
      opacity: 0.48,
      depthWrite: false
    });
    this.divotInst = new THREE.InstancedMesh(divotGeo, divotMat, this.maxDivots);
    this.divotInst.frustumCulled = false;
    this.scene.add(this.divotInst);
    this.clearDivots();
  }

  clearDivots() {
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -50, 0);
    dummy.scale.set(0.001, 0.001, 0.001);
    dummy.updateMatrix();
    for (let i = 0; i < this.maxDivots; i++) {
      this.divotInst.setMatrixAt(i, dummy.matrix);
    }
    this.divotInst.instanceMatrix.needsUpdate = true;
    this.divotNextIdx = 0;
  }

  addHoofDivot(worldX, laneZ) {
    const dummy = new THREE.Object3D();
    dummy.position.set(
      worldX - 0.4 + (Math.random() - 0.5) * 0.25,
      0.015,
      laneZ + (Math.random() - 0.5) * 0.32
    );
    dummy.rotation.y = (Math.random() - 0.5) * 0.4;
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    this.divotInst.setMatrixAt(this.divotNextIdx, dummy.matrix);
    this.divotInst.instanceMatrix.needsUpdate = true;
    this.divotNextIdx = (this.divotNextIdx + 1) % this.maxDivots;
  }

  /**
   * Updates the 3D Jumbotron screens in the world with live race standings & clock
   */
  updateJumbotronScreen(nowMs, { horses, order, elapsedSec, totalSec, raceFurlongs }) {
    if (nowMs - this._lastJumbotronUpdate < 350) return;
    this._lastJumbotronUpdate = nowMs;

    const ctx = this.jumbotronCanvas.getContext("2d");
    ctx.fillStyle = "#081021";
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = "#e5c158";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 248);

    ctx.fillStyle = "#132247";
    ctx.fillRect(8, 8, 496, 44);
    ctx.fillStyle = "#e5c158";
    ctx.font = "900 22px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`ROYAL TURF LIVE • ${raceFurlongs}F`, 20, 36);

    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const tMins = Math.floor(totalSec / 60);
    const clockTxt = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} / ${String(tMins).padStart(2, "0")}:00`;
    ctx.fillStyle = "#56f0c1";
    ctx.textAlign = "right";
    ctx.fillText(clockTxt, 492, 36);

    const top5 = (order || []).slice(0, 5);
    const leadX = horses[top5[0]]?.x || START_X;
    top5.forEach((hIdx, rank) => {
      const h = horses[hIdx];
      if (!h) return;
      const y = 76 + rank * 36;

      ctx.fillStyle = rank === 0 ? "rgba(229, 193, 88, 0.2)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(16, y - 22, 480, 30);

      ctx.fillStyle = h.color || COLORS[hIdx % COLORS.length];
      ctx.fillRect(22, y - 18, 26, 22);
      ctx.fillStyle = "#080c14";
      ctx.font = "900 16px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(hIdx + 1), 35, y - 2);

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 19px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${rank + 1}. ${h.name}`, 60, y - 1);

      const gapLengths = ((leadX - h.x) * SIM_TO_M) / 2.6;
      const gapTxt = rank === 0 ? "LEADER" : `+${gapLengths.toFixed(1)}L`;
      ctx.fillStyle = rank === 0 ? "#ffd76a" : "#9aa7c7";
      ctx.textAlign = "right";
      ctx.fillText(gapTxt, 484, y - 1);
    });

    this.jumbotronTex.needsUpdate = true;
  }

  /**
   * Rebuilds the 3D racecourse geometry whenever race distance or Flat/Hedges mode changes.
   */
  buildCourse({ raceFurlongs, finishSimX, hedgesSimX, useHedges, pxPerFurlong = PX_PER_FURLONG }) {
    while (this.trackGroup.children.length > 0) {
      const child = this.trackGroup.children[0];
      this.trackGroup.remove(child);
    }
    this.stallGates = [];
    this.treeCrownBaseMatrices = [];
    this.furlongFlags = [];
    this.waterJumpSimXSet.clear();
    this.fountainJets = [];
    this.cloudData = [];
    this.clearDivots();

    const startM = START_X * SIM_TO_M;
    const finishM = finishSimX * SIM_TO_M;
    const raceLengthM = finishM - startM;
    const totalCourseLength = finishM + 160;
    const laneSpan = LANES_Z[LANES_Z.length - 1] - LANES_Z[0];
    const trackWidth = laneSpan + 5.2; // 22.8m
    const railHalfWidth = trackWidth * 0.5 + 0.25; // 11.65m

    const repX = Math.max(20, Math.round(totalCourseLength / 14));
    this.turfTexture.repeat.set(repX, 1);
    this.turfNormalMap.repeat.set(repX, 1);

    // 1. Main Striped Racecourse Turf Strip
    const trackGeo = new THREE.PlaneGeometry(totalCourseLength + 120, trackWidth, 64, 8);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMesh = new THREE.Mesh(trackGeo, this.turfMaterial);
    trackMesh.position.set(totalCourseLength * 0.5 - 20, 0, 0);
    trackMesh.receiveShadow = true;
    this.trackGroup.add(trackMesh);

    // 2. Surrounding Infield & Paddock Ground Plane
    const surroundGeo = new THREE.PlaneGeometry(totalCourseLength + 1400, 620);
    surroundGeo.rotateX(-Math.PI / 2);
    const surroundMesh = new THREE.Mesh(surroundGeo, this.infieldMaterial);
    surroundMesh.position.set(totalCourseLength * 0.5, -0.03, 0);
    surroundMesh.receiveShadow = true;
    this.trackGroup.add(surroundMesh);

    // 3. Dashed White Lane Dividers between all 9 lanes
    const laneLineMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.25
    });
    for (let i = 0; i < LANES_Z.length - 1; i++) {
      const midZ = (LANES_Z[i] + LANES_Z[i + 1]) * 0.5;
      const lineGeo = new THREE.PlaneGeometry(raceLengthM + 20, 0.08);
      lineGeo.rotateX(-Math.PI / 2);
      const lineMesh = new THREE.Mesh(lineGeo, laneLineMat);
      lineMesh.position.set(startM + raceLengthM * 0.5, 0.012, midZ);
      this.trackGroup.add(lineMesh);
    }

    // 4. Start & Finish Checkered Ground Strips
    const stripGeo = new THREE.PlaneGeometry(1.1, trackWidth - 0.6);
    stripGeo.rotateX(-Math.PI / 2);
    const stripMat = new THREE.MeshStandardMaterial({
      map: this.checkeredTexture,
      roughness: 0.6
    });

    const startStrip = new THREE.Mesh(stripGeo, stripMat);
    startStrip.position.set(startM, 0.018, 0);
    this.trackGroup.add(startStrip);

    const finishStrip = new THREE.Mesh(stripGeo, stripMat);
    finishStrip.position.set(finishM, 0.02, 0);
    this.trackGroup.add(finishStrip);

    // 5. Sculpted Swan-Neck Running Rails & Posts
    this._buildPerimeterRails(totalCourseLength, railHalfWidth);

    // 6. 9-Bay Starting Stalls with Overhead Space-Frame Truss & Padded Side Walls
    this._buildStartingStalls(startM);

    // 7. Architectural Finish Archway, Brass Finials & Photo-Finish Mirror Post
    this._buildFinishGantry(finishM, trackWidth);

    // 8. Furlong Distance Marker Poles & Classic Red/White Furlong Discs
    this._buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth, pxPerFurlong);

    // 9. Multi-Layered 3D Steeplechase Hedges, Brush Aprons & Timber-Framed Water Jumps
    if (useHedges && hedgesSimX.length > 0) {
      this._buildSteeplechaseHedges(hedgesSimX, trackWidth);
    }

    // 10. Victorian-Inspired Grandstands, Jumbotron Towers, Infield Lakes, Fountains & Floodlights
    this._buildGrandstand(finishM, railHalfWidth, 62);
    this._buildCourseLandmarks(startM, finishM, railHalfWidth);

    // 11. Multi-Cluster Perimeter Trees & Drifting 3D Cloud Deck
    this._buildVegetation(totalCourseLength, railHalfWidth);
    this._buildCloudDeck(totalCourseLength);
  }

  _buildPerimeterRails(totalLength, halfWidth) {
    // Cylindrical top running rail + lower secondary rail for authentic racecourse profile
    const railLen = totalLength + 40;
    const topRailGeo = new THREE.CylinderGeometry(0.055, 0.055, railLen, 10);
    topRailGeo.rotateZ(Math.PI / 2);
    const midRailGeo = new THREE.CylinderGeometry(0.038, 0.038, railLen, 8);
    midRailGeo.rotateZ(Math.PI / 2);

    [-halfWidth, halfWidth].forEach(zPos => {
      const topRail = new THREE.Mesh(topRailGeo, this.railMaterial);
      topRail.position.set(railLen * 0.5 - 20, 1.08, zPos);
      topRail.castShadow = true;
      this.trackGroup.add(topRail);

      const midRail = new THREE.Mesh(midRailGeo, this.railMaterial);
      midRail.position.set(railLen * 0.5 - 20, 0.58, zPos);
      this.trackGroup.add(midRail);
    });

    // Angled swan-neck safety posts set slightly back from the rail face
    const postSpacing = Math.max(4.0, railLen / 1200);
    const postsPerSide = Math.floor(railLen / postSpacing);
    const postGeo = new THREE.CylinderGeometry(0.048, 0.058, 1.14, 8);
    const postInst = new THREE.InstancedMesh(postGeo, this.railMaterial, postsPerSide * 2);
    postInst.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < postsPerSide; i++) {
      const x = -20 + i * postSpacing;
      dummy.position.set(x, 0.56, -halfWidth - 0.08);
      dummy.rotation.set(0.14, 0, 0);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx++, dummy.matrix);

      dummy.position.set(x, 0.56, halfWidth + 0.08);
      dummy.rotation.set(-0.14, 0, 0);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx++, dummy.matrix);
    }
    postInst.instanceMatrix.needsUpdate = true;
    this.trackGroup.add(postInst);
  }

  _buildStartingStalls(startM) {
    const stallGroup = new THREE.Group();
    stallGroup.position.set(startM - 1.1, 0, 0);

    const lanePitch = LANES_Z.length > 1 ? (LANES_Z[1] - LANES_Z[0]) : 2.2;
    const halfPitch = lanePitch * 0.5;
    const totalStallSpan = NUM_HORSES * lanePitch + 0.8;

    // Padded Emerald Racing Stall Cushion Material
    const padMat = new THREE.MeshPhysicalMaterial({
      color: "#0e4d26",
      roughness: 0.48,
      clearcoat: 0.25
    });

    // Overhead space-frame steel truss spanning all 9 stalls
    const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.36, totalStallSpan), this.darkIronMaterial);
    headerBeam.position.set(0, 2.85, 0);
    headerBeam.castShadow = true;
    stallGroup.add(headerBeam);

    // Metallic cross-bracing bar & wheel hubs
    const topStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, totalStallSpan + 0.4, 12), this.steelMaterial);
    topStrut.rotation.x = Math.PI / 2;
    topStrut.position.set(1.28, 3.05, 0);
    stallGroup.add(topStrut);

    const signBanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.68, 11.2),
      new THREE.MeshStandardMaterial({ map: createBannerTexture("ROYAL TURF STARTING GATE", "#0d1a38", "#e5c158") })
    );
    signBanner.position.set(1.32, 3.45, 0);
    stallGroup.add(signBanner);

    const dividerWallGeo = new THREE.BoxGeometry(2.55, 1.85, 0.14);
    const pillarGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.85, 12);
    const numberPlateGeo = new THREE.BoxGeometry(0.08, 0.36, 0.56);
    const startZ = LANES_Z[0] - halfPitch;

    for (let i = 0; i <= NUM_HORSES; i++) {
      const zDiv = startZ + i * lanePitch;
      const wall = new THREE.Mesh(dividerWallGeo, padMat);
      wall.position.set(0, 1.12, zDiv);
      wall.castShadow = true;
      stallGroup.add(wall);

      const frontPillar = new THREE.Mesh(pillarGeo, this.steelMaterial);
      frontPillar.position.set(1.25, 1.42, zDiv);
      stallGroup.add(frontPillar);

      const rearPillar = new THREE.Mesh(pillarGeo, this.steelMaterial);
      rearPillar.position.set(-1.25, 1.42, zDiv);
      stallGroup.add(rearPillar);
    }

    // Individual numbered bay plaques (1-9) & grilled swinging double doors per lane
    const doorWidth = halfPitch - 0.08;
    const doorGeo = new THREE.BoxGeometry(0.06, 1.85, doorWidth);
    LANES_Z.forEach((laneZ, idx) => {
      const plaqueMat = new THREE.MeshStandardMaterial({
        map: createBannerTexture(String(idx + 1), "#101b3b", COLORS[idx % COLORS.length])
      });
      const plaque = new THREE.Mesh(numberPlateGeo, plaqueMat);
      plaque.position.set(1.36, 2.85, laneZ);
      stallGroup.add(plaque);

      const leftHinge = new THREE.Group();
      leftHinge.position.set(1.25, 1.25, laneZ - doorWidth);
      const leftDoor = new THREE.Mesh(doorGeo, this.steelMaterial);
      leftDoor.position.set(0, 0, doorWidth * 0.5);
      leftHinge.add(leftDoor);
      stallGroup.add(leftHinge);

      const rightHinge = new THREE.Group();
      rightHinge.position.set(1.25, 1.25, laneZ + doorWidth);
      const rightDoor = new THREE.Mesh(doorGeo, this.steelMaterial);
      rightDoor.position.set(0, 0, -doorWidth * 0.5);
      rightHinge.add(rightDoor);
      stallGroup.add(rightHinge);

      this.stallGates.push({ leftHinge, rightHinge });
    });

    this.trackGroup.add(stallGroup);
  }

  setStartingGatesOpen(openProgress) {
    const angle = openProgress * 1.52;
    this.stallGates.forEach(g => {
      g.leftHinge.rotation.y = angle;
      g.rightHinge.rotation.y = -angle;
    });
  }

  _buildFinishGantry(finishM, trackWidth) {
    const gantry = new THREE.Group();
    gantry.position.set(finishM, 0, 0);

    const crimsonEnamelMat = new THREE.MeshPhysicalMaterial({
      color: "#b81d3a",
      roughness: 0.25,
      metalness: 0.15,
      clearcoat: 0.8
    });

    const spanZ = trackWidth * 0.5 + 0.6;
    [-spanZ, spanZ].forEach(zSide => {
      // Twin architectural lattice columns per side
      [-0.35, 0.35].forEach(xOff => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.2, 12), crimsonEnamelMat);
        pillar.position.set(xOff, 2.6, zSide);
        pillar.castShadow = true;
        gantry.add(pillar);
      });

      // Plinth base & Conductor Brass Finial Crown (Skill: 3d-metal-material)
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.85), this.darkIronMaterial);
      plinth.position.set(0, 0.32, zSide);
      gantry.add(plinth);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), this.brassMaterial);
      finial.position.set(0, 5.4, zSide);
      gantry.add(finial);
    });

    // Classic Red-and-White Bullseye Mirror Finish Post on the inner rail
    const discPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 10), this.steelMaterial);
    discPost.position.set(0, 1.3, -spanZ + 0.85);
    gantry.add(discPost);

    const outerDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), crimsonEnamelMat);
    outerDisc.rotation.z = Math.PI / 2;
    outerDisc.position.set(0, 2.5, -spanZ + 0.85);
    gantry.add(outerDisc);

    // Overhead Finish Banner with Brass Trim Cornice
    const bannerTex = createBannerTexture("🏁 ROYAL TURF FINISH 🏁", "#0f1833", "#e5c158");
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.35 });
    const bannerBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, spanZ * 2 + 0.5), bannerMat);
    bannerBox.position.set(0, 4.7, 0);
    bannerBox.castShadow = true;
    gantry.add(bannerBox);

    const topBrassBar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, spanZ * 2 + 0.8), this.brassMaterial);
    topBrassBar.position.set(0, 5.28, 0);
    gantry.add(topBrassBar);

    this.trackGroup.add(gantry);
  }

  _buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth = 11.65, pxPerFurlong = PX_PER_FURLONG) {
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.25, 10);
    const flagGeo = new THREE.PlaneGeometry(0.82, 0.46, 4, 1);
    flagGeo.translate(0.41, 0, 0);
    const ringGeo = new THREE.TorusGeometry(0.09, 0.022, 8, 14);
    const zPole = -(railHalfWidth + 0.32);

    for (let f = 1; f < raceFurlongs; f++) {
      const distFromFinishFurlongs = raceFurlongs - f;
      const xPos = startM + f * pxPerFurlong * SIM_TO_M;
      if (xPos >= finishM - 4) continue;

      const pole = new THREE.Mesh(poleGeo, this.railMaterial);
      pole.position.set(xPos, 1.12, zPole);
      pole.castShadow = true;
      this.trackGroup.add(pole);

      const brassCollar = new THREE.Mesh(ringGeo, this.brassMaterial);
      brassCollar.rotation.x = Math.PI / 2;
      brassCollar.position.set(xPos, 2.22, zPole);
      this.trackGroup.add(brassCollar);

      const flagMat = new THREE.MeshStandardMaterial({
        map: createBannerTexture(`${distFromFinishFurlongs}F`, "#b91c1c", "#e5c158"),
        side: THREE.DoubleSide,
        roughness: 0.45
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(xPos, 1.92, zPole);
      this.trackGroup.add(flag);
      this.furlongFlags.push(flag);
    }
  }

  _buildSteeplechaseHedges(hedgesSimX, trackWidth) {
    const hedgeWidth = trackWidth - 1.2;
    // Layered hedge profile: timber baseboard, dense dark-spruce core, sloped birch brush apron, and top foliage crown
    const timberBaseGeo = new THREE.BoxGeometry(1.35, 0.28, hedgeWidth + 0.1);
    const baseBoxGeo = new THREE.BoxGeometry(1.15, 0.92, hedgeWidth);
    const topRollGeo = new THREE.CylinderGeometry(0.56, 0.56, hedgeWidth, 14);
    topRollGeo.rotateX(Math.PI / 2);
    const brushApronGeo = new THREE.BoxGeometry(0.45, 0.72, hedgeWidth - 0.1);
    const takeoffBarGeo = new THREE.CylinderGeometry(0.095, 0.095, hedgeWidth + 0.2, 12);
    takeoffBarGeo.rotateX(Math.PI / 2);

    const waterPitGeo = new THREE.PlaneGeometry(2.8, hedgeWidth - 0.3);
    waterPitGeo.rotateX(-Math.PI / 2);
    const waterCurbGeo = new THREE.BoxGeometry(3.0, 0.12, hedgeWidth);

    hedgesSimX.forEach((hx, idx) => {
      const xM = hx * SIM_TO_M;
      const hGroup = new THREE.Group();
      hGroup.position.set(xM, 0, 0);

      const timberBase = new THREE.Mesh(timberBaseGeo, this.timberMaterial);
      timberBase.position.set(-0.08, 0.14, 0);
      hGroup.add(timberBase);

      const baseMesh = new THREE.Mesh(baseBoxGeo, this.hedgeFoliageMaterial);
      baseMesh.position.set(0, 0.62, 0);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      hGroup.add(baseMesh);

      const apronMesh = new THREE.Mesh(brushApronGeo, this.hedgeTopSprigMaterial);
      apronMesh.position.set(-0.48, 0.56, 0);
      apronMesh.rotation.z = 0.38;
      apronMesh.castShadow = true;
      hGroup.add(apronMesh);

      const topRoll = new THREE.Mesh(topRollGeo, this.hedgeTopSprigMaterial);
      topRoll.position.set(0, 1.08, 0);
      topRoll.castShadow = true;
      hGroup.add(topRoll);

      const bar = new THREE.Mesh(takeoffBarGeo, this.takeoffBarMaterial);
      bar.position.set(-0.74, 0.42, 0);
      bar.castShadow = true;
      hGroup.add(bar);

      // Every 3rd hedge is a Royal Steeplechase Water Jump with a timber-framed reflective water pit
      if ((idx + 1) % 3 === 0) {
        this.waterJumpSimXSet.add(hx);
        const curb = new THREE.Mesh(waterCurbGeo, this.timberMaterial);
        curb.position.set(1.85, 0.01, 0);
        hGroup.add(curb);

        const pit = new THREE.Mesh(waterPitGeo, this.waterPitMaterial);
        pit.position.set(1.85, 0.075, 0);
        hGroup.add(pit);
      }

      // White architectural wing standards with brass caps on left & right edges
      [-hedgeWidth * 0.5, hedgeWidth * 0.5].forEach(zEdge => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.42, 0.16), this.railMaterial);
        wing.position.set(-0.05, 0.71, zEdge);
        wing.castShadow = true;
        hGroup.add(wing);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.22), this.brassMaterial);
        cap.position.set(-0.05, 1.45, zEdge);
        hGroup.add(cap);
      });

      this.trackGroup.add(hGroup);
    });
  }

  _buildCourseLandmarks(startM, finishM, railHalfWidth) {
    const courseSpan = finishM - startM;

    // 1. Infield Lakes with Specular Clearcoat Water & Animated Fountains
    const lakeMat = new THREE.MeshPhysicalMaterial({
      color: "#12527a",
      roughness: 0.07,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });
    const bankMat = new THREE.MeshStandardMaterial({
      color: "#b8a672",
      roughness: 0.85
    });
    const jetMat = new THREE.MeshStandardMaterial({
      color: "#e0f5ff",
      emissive: "#8ec5ff",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.85
    });

    [0.18, 0.42, 0.66, 0.86].forEach((pct, idx) => {
      const lx = startM + courseSpan * pct;
      const side = idx % 2 === 0 ? -1 : 1;
      const lz = side * (railHalfWidth + 28);

      const bankGeo = new THREE.CircleGeometry(28, 28);
      bankGeo.rotateX(-Math.PI / 2);
      const bank = new THREE.Mesh(bankGeo, bankMat);
      bank.position.set(lx, 0.01, lz);
      bank.scale.set(2.4, 1, 0.85);
      this.trackGroup.add(bank);

      const lakeGeo = new THREE.CircleGeometry(25, 28);
      lakeGeo.rotateX(-Math.PI / 2);
      const lake = new THREE.Mesh(lakeGeo, lakeMat);
      lake.position.set(lx, 0.035, lz);
      lake.scale.set(2.4, 1, 0.85);
      this.trackGroup.add(lake);

      [-22, 0, 22].forEach((dx, fIdx) => {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.4, 12), this.steelMaterial);
        nozzle.position.set(lx + dx, 0.2, lz);
        this.trackGroup.add(nozzle);

        const jet = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7.5, 12), jetMat);
        jet.position.set(lx + dx, 3.7, lz);
        this.trackGroup.add(jet);
        this.fountainJets.push({ mesh: jet, phase: idx * 2.1 + fIdx });
      });
    });

    // 2. Giant 3D Stadium Jumbotron Screens with Steel Support Gantries & Brass Trim
    const jumboStep = Math.max(240, courseSpan / 10);
    for (let x = startM + 140; x < finishM - 70; x += jumboStep) {
      const jGroup = new THREE.Group();
      jGroup.position.set(x, 0, -(railHalfWidth + 6.5));
      jGroup.rotation.y = 0.25;

      [-3.6, 3.6].forEach(zLeg => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, 6.6, 10), this.steelMaterial);
        leg.position.set(zLeg, 3.3, 0);
        leg.castShadow = true;
        jGroup.add(leg);
      });

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(10.8, 5.8, 0.52), this.darkIronMaterial);
      bezel.position.set(0, 6.6, 0);
      bezel.castShadow = true;
      jGroup.add(bezel);

      const brassCrown = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.22, 0.62), this.brassMaterial);
      brassCrown.position.set(0, 9.55, 0);
      jGroup.add(brassCrown);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 4.9), this.jumbotronMat);
      screen.position.set(0, 6.6, 0.28);
      jGroup.add(screen);

      this.trackGroup.add(jGroup);
    }

    // 3. Stadium Floodlight Towers spaced along the outer & inner course
    const towerCount = Math.min(28, Math.max(10, Math.floor(courseSpan / 180)));
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.28, 13.5, 10);
    const headGeo = new THREE.BoxGeometry(1.2, 1.4, 3.6);
    const bulbGeo = new THREE.PlaneGeometry(1.0, 3.2);

    for (let i = 0; i < towerCount; i++) {
      const tx = startM + ((i + 0.5) / towerCount) * courseSpan;
      const side = i % 2 === 0 ? -1 : 1;
      const tz = side * (railHalfWidth + 4.8);

      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);

      const pole = new THREE.Mesh(poleGeo, this.steelMaterial);
      pole.position.set(0, 6.75, 0);
      tGroup.add(pole);

      const head = new THREE.Mesh(headGeo, this.darkIronMaterial);
      head.position.set(0, 13.6, 0);
      head.rotation.z = side * 0.35;
      tGroup.add(head);

      const bulb = new THREE.Mesh(bulbGeo, this.floodlightBulbMat);
      bulb.position.set(0, 13.3, -side * 0.62);
      bulb.rotation.x = side * 1.1;
      tGroup.add(bulb);

      this.trackGroup.add(tGroup);
    }

    // 4. Mid-Course Viewing Pavilions at Quarter, Halfway, and Three-Quarter marks
    [0.25, 0.50, 0.75].forEach(pct => {
      this._buildGrandstand(startM + courseSpan * pct, railHalfWidth, 36);
    });
  }

  /**
   * Builds a multi-bay Victorian Royal Turf Club Grandstand following threejs-procedural-architecture
   * (massing tiers -> colonnade bays -> VIP glass box -> cantilevered canopy & brass cornice)
   */
  _buildGrandstand(anchorX, railHalfWidth = 11.65, standLen = 58) {
    const standGroup = new THREE.Group();
    standGroup.position.set(anchorX - standLen * 0.42, 0, -(railHalfWidth + 9.8));

    const stoneMat = new THREE.MeshStandardMaterial({ color: "#222c42", roughness: 0.68 });
    const roofMat = new THREE.MeshPhysicalMaterial({ color: "#0b4723", roughness: 0.38, metalness: 0.15, clearcoat: 0.35 });
    const vipGlassMat = new THREE.MeshPhysicalMaterial({
      color: "#9ec5ff",
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.55,
      transparent: true,
      opacity: 0.75
    });

    // 1. Stepped Spectator Seating Tiers
    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(standLen, 1.15, 2.2), stoneMat);
      tier.position.set(0, 0.58 + t * 1.05, -t * 1.9);
      tier.castShadow = true;
      tier.receiveShadow = true;
      standGroup.add(tier);
    }

    // 2. Upper VIP Hospitality Glass Gallery & Back Colonnade Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(standLen, 7.6, 0.85), stoneMat);
    backWall.position.set(0, 3.8, -7.8);
    backWall.castShadow = true;
    standGroup.add(backWall);

    const vipGlass = new THREE.Mesh(new THREE.BoxGeometry(standLen - 2.4, 2.1, 1.6), vipGlassMat);
    vipGlass.position.set(0, 5.75, -6.5);
    standGroup.add(vipGlass);

    // 3. Structural Bay Columns supporting the cantilevered roof every ~7m
    const bayCount = Math.max(4, Math.floor(standLen / 7.2));
    const colGeo = new THREE.CylinderGeometry(0.14, 0.16, 7.4, 10);
    for (let b = 0; b <= bayCount; b++) {
      const bx = -standLen * 0.48 + (b / bayCount) * (standLen * 0.96);
      const col = new THREE.Mesh(colGeo, this.steelMaterial);
      col.position.set(bx, 3.7, -1.6);
      col.castShadow = true;
      standGroup.add(col);
    }

    // 4. Cantilevered Canopy Roof, Conductor Brass Cornice & Roof Gables
    const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 2.4, 0.48, 12.2), roofMat);
    roof.position.set(0, 7.65, -3.2);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    standGroup.add(roof);

    const fascia = new THREE.Mesh(new THREE.BoxGeometry(standLen + 2.6, 0.30, 0.28), this.brassMaterial);
    fascia.position.set(0, 7.38, 2.85);
    standGroup.add(fascia);

    // 5. Instanced Spectators seated along the tiers
    const crowdCount = Math.floor(standLen * 3.8);
    const personGeo = new THREE.BoxGeometry(0.42, 0.75, 0.42);
    const personMat = new THREE.MeshStandardMaterial({ roughness: 0.58 });
    const crowdInst = new THREE.InstancedMesh(personGeo, personMat, crowdCount);
    const dummy = new THREE.Object3D();
    const palette = COLORS.map(c => new THREE.Color(c));

    for (let i = 0; i < crowdCount; i++) {
      const tierIdx = i % 4;
      const xOff = ((i / crowdCount) - 0.5) * (standLen - 3);
      dummy.position.set(xOff, 1.35 + tierIdx * 1.05, -tierIdx * 1.9 + 0.35);
      dummy.updateMatrix();
      crowdInst.setMatrixAt(i, dummy.matrix);
      crowdInst.setColorAt(i, palette[i % palette.length]);
    }
    crowdInst.instanceMatrix.needsUpdate = true;
    if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
    standGroup.add(crowdInst);

    this.trackGroup.add(standGroup);
  }

  _buildVegetation(totalCourseLength, railHalfWidth = 11.65) {
    const treeCount = Math.min(340, Math.max(80, Math.floor(totalCourseLength / 18)));
    const trunkGeo = new THREE.CylinderGeometry(0.20, 0.36, 2.4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a321f", roughness: 0.88 });
    const crownGeo = new THREE.IcosahedronGeometry(1.85, 1);
    const crownMat = new THREE.MeshStandardMaterial({ color: "#1c6b31", roughness: 0.76 });

    const trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const crownsMesh = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
    trunksMesh.castShadow = true;
    crownsMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = (i / treeCount) * (totalCourseLength + 40) - 10;
      const z = side * (railHalfWidth + 4.5 + ((i * 7) % 16));
      const isGrandstandZone = side < 0 && x > totalCourseLength - 210 && x < totalCourseLength - 135;
      const finalZ = isGrandstandZone ? z - 18 : z;
      const scale = 0.8 + ((i * 13) % 7) * 0.14;

      dummy.position.set(x, 1.2 * scale, finalZ);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, i * 1.1, 0);
      dummy.updateMatrix();
      trunksMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 2.95 * scale, finalZ);
      dummy.scale.set(scale, scale * 1.24, scale);
      dummy.updateMatrix();
      crownsMesh.setMatrixAt(i, dummy.matrix);
      this.treeCrownBaseMatrices.push({
        x,
        y: 2.95 * scale,
        z: finalZ,
        scale,
        phase: i * 0.7
      });
    }
    trunksMesh.instanceMatrix.needsUpdate = true;
    crownsMesh.instanceMatrix.needsUpdate = true;
    this.treeCrownsMesh = crownsMesh;
    this.trackGroup.add(trunksMesh);
    this.trackGroup.add(crownsMesh);
  }

  _buildCloudDeck(totalCourseLength) {
    const cloudCount = 65;
    const cloudGeo = new THREE.DodecahedronGeometry(9.0, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: "#f4f8ff",
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85
    });
    this.cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    this.cloudMesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < cloudCount; i++) {
      const x = (i / cloudCount) * (totalCourseLength + 300) - 80;
      const y = 38 + (i % 5) * 7;
      const z = ((i * 19) % 160) - 80;
      const sx = 1.6 + (i % 4) * 0.65;
      const sy = 0.55 + (i % 3) * 0.15;
      const sz = 1.1 + (i % 3) * 0.4;

      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, dummy.matrix);
      this.cloudData.push({ x, y, z, sx, sy, sz });
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    this.trackGroup.add(this.cloudMesh);
  }

  /**
   * Animates rooted wind deformation on camera-wrapped 3D grass blades, trees, clouds, fountains & flags
   */
  updateVegetationWind(nowSec, windForce, cameraFocusX = 20, raceProgress = 0) {
    const w = windForce || 0;
    const dummy = new THREE.Object3D();

    if (this.grassInst) {
      const halfW = this.grassWrapWidth * 0.5;
      for (let i = 0; i < this.grassBladeCount; i++) {
        const g = this.grassOffsets[i];
        let worldX = cameraFocusX + g.dx;
        const wrappedDx = ((((worldX - cameraFocusX) % this.grassWrapWidth) + this.grassWrapWidth) % this.grassWrapWidth) - halfW;
        worldX = cameraFocusX + wrappedDx;

        const bend = Math.sin(nowSec * 3.8 + worldX * 0.25 + g.phase) * (0.18 + Math.abs(w) * 0.08) + w * 0.09;
        dummy.position.set(worldX, 0, g.z);
        dummy.rotation.set(0, g.phase, -bend);
        dummy.scale.set(g.scale, g.scale, g.scale);
        dummy.updateMatrix();
        this.grassInst.setMatrixAt(i, dummy.matrix);
      }
      this.grassInst.instanceMatrix.needsUpdate = true;
    }

    if (this.treeCrownsMesh && this.treeCrownBaseMatrices.length > 0) {
      for (let i = 0; i < this.treeCrownBaseMatrices.length; i++) {
        const b = this.treeCrownBaseMatrices[i];
        const gust = Math.sin(nowSec * 2.2 + b.phase) * (0.04 + Math.abs(w) * 0.025);
        const leanX = w * 0.08 + gust;
        dummy.position.set(b.x + leanX * 0.45, b.y, b.z);
        dummy.scale.set(b.scale, b.scale * 1.24, b.scale);
        dummy.rotation.set(0, b.phase, -leanX * 0.35);
        dummy.updateMatrix();
        this.treeCrownsMesh.setMatrixAt(i, dummy.matrix);
      }
      this.treeCrownsMesh.instanceMatrix.needsUpdate = true;
    }

    this.furlongFlags.forEach((flag, idx) => {
      flag.rotation.y = Math.sin(nowSec * 6.0 + idx) * (0.12 + Math.abs(w) * 0.06);
    });

    this.fountainJets.forEach(f => {
      const pulse = 0.82 + Math.sin(nowSec * 4.5 + f.phase) * 0.22;
      f.mesh.scale.set(1, pulse, 1);
      f.mesh.rotation.z = -w * 0.05;
    });

    if (this.floodlightBulbMat) {
      this.floodlightBulbMat.emissiveIntensity = lerp(0.25, 2.8, clamp(raceProgress * 1.25, 0, 1));
    }
  }
}

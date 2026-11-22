/* ============================================================================
 * Horse Rally 3D — Procedural 3D Racecourse, Sky Dome, Water Jumps, Lakes,
 * Jumbotrons, Floodlights, Grandstands & Camera-Wrapped 3D Waving Grass
 * Skills: threejs-procedural-geometry, threejs-procedural-vegetation,
 *         threejs-procedural-architecture
 * ============================================================================ */

import * as THREE from "three";
import { COLORS, LANES_Z, NUM_HORSES, PX_PER_FURLONG, SIM_TO_M, START_X, clamp, lerp } from "./config.js";

/**
 * Generates a rich procedural striped turf & worn running lane texture
 */
function createTurfCanvasTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");

  // Two-tone mowed turf lawn stripes along X
  ctx.fillStyle = "#1d6b30";
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "#247c39";
  ctx.fillRect(256, 0, 256, 512);

  // Subtle worn running paths along the 9 lanes
  ctx.fillStyle = "rgba(45, 34, 20, 0.14)";
  for (let i = 0; i < 9; i++) {
    const y = 48 + i * 48;
    ctx.fillRect(0, y, 512, 16);
  }

  // Organic turf blade grain & clover speckles
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(x, y, 3, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

    this.turfTexture = createTurfCanvasTexture();
    this.checkeredTexture = createCheckeredTexture();

    this.turfMaterial = new THREE.MeshStandardMaterial({
      map: this.turfTexture,
      roughness: 0.85,
      metalness: 0.04
    });

    this.infieldMaterial = new THREE.MeshStandardMaterial({
      color: "#154f24",
      roughness: 0.92,
      metalness: 0.02
    });

    this.railMaterial = new THREE.MeshStandardMaterial({
      color: "#f4f7ff",
      roughness: 0.35,
      metalness: 0.1
    });

    this.hedgeFoliageMaterial = new THREE.MeshStandardMaterial({
      color: "#165c29",
      roughness: 0.82
    });

    this.takeoffBarMaterial = new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      roughness: 0.4
    });

    this.waterPitMaterial = new THREE.MeshStandardMaterial({
      color: "#1d6fa3",
      roughness: 0.12,
      metalness: 0.55
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
      // Place dense grass tufts along the inner and outer fence lines and verges
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
  updateJumbotronScreen(nowMs, { horses, order, elapsedSec, totalSec, weather, raceFurlongs }) {
    if (nowMs - this._lastJumbotronUpdate < 350) return;
    this._lastJumbotronUpdate = nowMs;

    const ctx = this.jumbotronCanvas.getContext("2d");
    ctx.fillStyle = "#081021";
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = "#e5c158";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 248);

    // Header bar
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

    // Top 5 Live Leaderboard rows
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

    // 1. Main Striped Racecourse Turf Strip
    this.turfTexture.repeat.set(Math.max(20, Math.round(totalCourseLength / 14)), 1);
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

    // 5. Continuous Post-and-Rail Perimeter Fences
    this._buildPerimeterRails(totalCourseLength, railHalfWidth);

    // 6. 9-Bay Starting Stalls with Animated Front Gates at startM
    this._buildStartingStalls(startM);

    // 7. Finish Archway & Photo-Finish Tower at finishM
    this._buildFinishGantry(finishM, trackWidth);

    // 8. Furlong Distance Marker Poles along the inner rail
    this._buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth, pxPerFurlong);

    // 9. 3D Steeplechase Hedges & Water Jumps (every 3rd hedge features a gleaming water pit!)
    if (useHedges && hedgesSimX.length > 0) {
      this._buildSteeplechaseHedges(hedgesSimX, trackWidth);
    }

    // 10. Grandstands, Jumbotron Towers, Infield Lakes, Fountains & Floodlights along the course
    this._buildGrandstand(finishM, railHalfWidth);
    this._buildCourseLandmarks(startM, finishM, railHalfWidth);

    // 11. Instanced Perimeter Trees & Drifting 3D Volumetric-Style Cloud Deck
    this._buildVegetation(totalCourseLength, railHalfWidth);
    this._buildCloudDeck(totalCourseLength);
  }

  _buildPerimeterRails(totalLength, halfWidth) {
    const railLen = totalLength + 40;
    const railGeo = new THREE.BoxGeometry(railLen, 0.10, 0.08);
    [-halfWidth, halfWidth].forEach(zPos => {
      const topRail = new THREE.Mesh(railGeo, this.railMaterial);
      topRail.position.set(railLen * 0.5 - 20, 1.08, zPos);
      topRail.castShadow = true;
      this.trackGroup.add(topRail);
    });

    const postSpacing = Math.max(4.0, railLen / 1200);
    const postsPerSide = Math.floor(railLen / postSpacing);
    const postGeo = new THREE.BoxGeometry(0.11, 1.15, 0.11);
    const postInst = new THREE.InstancedMesh(postGeo, this.railMaterial, postsPerSide * 2);
    postInst.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < postsPerSide; i++) {
      const x = -20 + i * postSpacing;
      dummy.position.set(x, 0.57, -halfWidth);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx++, dummy.matrix);

      dummy.position.set(x, 0.57, halfWidth);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx++, dummy.matrix);
    }
    postInst.instanceMatrix.needsUpdate = true;
    this.trackGroup.add(postInst);
  }

  _buildStartingStalls(startM) {
    const stallGroup = new THREE.Group();
    stallGroup.position.set(startM - 1.1, 0, 0);

    const frameMat = new THREE.MeshStandardMaterial({
      color: "#1b315e",
      metalness: 0.55,
      roughness: 0.35
    });
    const gateMat = new THREE.MeshStandardMaterial({
      color: "#dce4f5",
      metalness: 0.4,
      roughness: 0.4
    });

    const lanePitch = LANES_Z.length > 1 ? (LANES_Z[1] - LANES_Z[0]) : 2.2;
    const halfPitch = lanePitch * 0.5;
    const totalStallSpan = NUM_HORSES * lanePitch + 0.8;

    const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, totalStallSpan), frameMat);
    headerBeam.position.set(0, 2.75, 0);
    headerBeam.castShadow = true;
    stallGroup.add(headerBeam);

    const signBanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.65, 10.5),
      new THREE.MeshStandardMaterial({ map: createBannerTexture("STARTING STALLS", "#101b3b", "#56f0c1") })
    );
    signBanner.position.set(1.28, 3.25, 0);
    stallGroup.add(signBanner);

    const dividerWallGeo = new THREE.BoxGeometry(2.6, 2.1, 0.10);
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.75, 8);
    const startZ = LANES_Z[0] - halfPitch;

    for (let i = 0; i <= NUM_HORSES; i++) {
      const zDiv = startZ + i * lanePitch;
      const wall = new THREE.Mesh(dividerWallGeo, frameMat);
      wall.position.set(0, 1.15, zDiv);
      wall.castShadow = true;
      stallGroup.add(wall);

      const frontPillar = new THREE.Mesh(pillarGeo, frameMat);
      frontPillar.position.set(1.25, 1.37, zDiv);
      stallGroup.add(frontPillar);
    }

    const doorWidth = halfPitch - 0.08;
    const doorGeo = new THREE.BoxGeometry(0.07, 1.85, doorWidth);
    LANES_Z.forEach((laneZ) => {
      const leftHinge = new THREE.Group();
      leftHinge.position.set(1.25, 1.25, laneZ - doorWidth);
      const leftDoor = new THREE.Mesh(doorGeo, gateMat);
      leftDoor.position.set(0, 0, doorWidth * 0.5);
      leftHinge.add(leftDoor);
      stallGroup.add(leftHinge);

      const rightHinge = new THREE.Group();
      rightHinge.position.set(1.25, 1.25, laneZ + doorWidth);
      const rightDoor = new THREE.Mesh(doorGeo, gateMat);
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

    const postMat = new THREE.MeshStandardMaterial({
      color: "#d92b4b",
      roughness: 0.3,
      metalness: 0.25
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: "#ffd76a",
      roughness: 0.25,
      metalness: 0.75
    });

    const spanZ = trackWidth * 0.5 + 0.5;
    [-spanZ, spanZ].forEach(zSide => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 4.8, 12), postMat);
      pillar.position.set(0, 2.4, zSide);
      pillar.castShadow = true;
      gantry.add(pillar);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), goldMat);
      finial.position.set(0, 4.95, zSide);
      gantry.add(finial);
    });

    const bannerTex = createBannerTexture("🏁 FINISH LINE 🏁", "#131c38", "#ffd76a");
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.4 });
    const bannerBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.92, spanZ * 2 + 0.4), bannerMat);
    bannerBox.position.set(0, 4.4, 0);
    bannerBox.castShadow = true;
    gantry.add(bannerBox);

    this.trackGroup.add(gantry);
  }

  _buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth = 11.65, pxPerFurlong = PX_PER_FURLONG) {
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8);
    const flagGeo = new THREE.PlaneGeometry(0.75, 0.42, 4, 1);
    flagGeo.translate(0.375, 0, 0);
    const zPole = -(railHalfWidth + 0.25);

    for (let f = 1; f < raceFurlongs; f++) {
      const distFromFinishFurlongs = raceFurlongs - f;
      const xPos = startM + f * pxPerFurlong * SIM_TO_M;
      if (xPos >= finishM - 4) continue;

      const pole = new THREE.Mesh(poleGeo, this.railMaterial);
      pole.position.set(xPos, 0.95, zPole);
      this.trackGroup.add(pole);

      const flagMat = new THREE.MeshStandardMaterial({
        map: createBannerTexture(`${distFromFinishFurlongs}F`, "#b91c1c", "#ffffff"),
        side: THREE.DoubleSide
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(xPos, 1.72, zPole);
      this.trackGroup.add(flag);
      this.furlongFlags.push(flag);
    }
  }

  _buildSteeplechaseHedges(hedgesSimX, trackWidth) {
    const hedgeWidth = trackWidth - 1.2;
    const baseBoxGeo = new THREE.BoxGeometry(1.15, 1.05, hedgeWidth);
    const topRollGeo = new THREE.CylinderGeometry(0.58, 0.58, hedgeWidth, 12);
    topRollGeo.rotateX(Math.PI / 2);
    const takeoffBarGeo = new THREE.CylinderGeometry(0.09, 0.09, hedgeWidth + 0.15, 10);
    takeoffBarGeo.rotateX(Math.PI / 2);

    const waterPitGeo = new THREE.PlaneGeometry(2.6, hedgeWidth - 0.4);
    waterPitGeo.rotateX(-Math.PI / 2);

    hedgesSimX.forEach((hx, idx) => {
      const xM = hx * SIM_TO_M;
      const hGroup = new THREE.Group();
      hGroup.position.set(xM, 0, 0);

      const baseMesh = new THREE.Mesh(baseBoxGeo, this.hedgeFoliageMaterial);
      baseMesh.position.set(0, 0.52, 0);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      hGroup.add(baseMesh);

      const topRoll = new THREE.Mesh(topRollGeo, this.hedgeFoliageMaterial);
      topRoll.position.set(0, 1.05, 0);
      topRoll.castShadow = true;
      hGroup.add(topRoll);

      const bar = new THREE.Mesh(takeoffBarGeo, this.takeoffBarMaterial);
      bar.position.set(-0.62, 0.42, 0);
      bar.castShadow = true;
      hGroup.add(bar);

      // Every 3rd hedge is a Royal Steeplechase Water Jump with a gleaming water pit on the landing side
      if ((idx + 1) % 3 === 0) {
        this.waterJumpSimXSet.add(hx);
        const pit = new THREE.Mesh(waterPitGeo, this.waterPitMaterial);
        pit.position.set(1.75, 0.025, 0);
        hGroup.add(pit);
      }

      [-hedgeWidth * 0.5, hedgeWidth * 0.5].forEach(zEdge => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 0.14), this.railMaterial);
        wing.position.set(0, 0.67, zEdge);
        hGroup.add(wing);
      });

      this.trackGroup.add(hGroup);
    });
  }

  _buildCourseLandmarks(startM, finishM, railHalfWidth) {
    const courseSpan = finishM - startM;

    // 1. Infield Lakes with Animated Vertical Water Fountains at 25%, 55%, 82% of the course
    const lakeMat = new THREE.MeshStandardMaterial({
      color: "#186496",
      roughness: 0.10,
      metalness: 0.65
    });
    const bankMat = new THREE.MeshStandardMaterial({
      color: "#c2b280",
      roughness: 0.85
    });
    const jetMat = new THREE.MeshStandardMaterial({
      color: "#d9f2ff",
      emissive: "#8ec5ff",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.85
    });

    [0.18, 0.42, 0.66, 0.86].forEach((pct, idx) => {
      const lx = startM + courseSpan * pct;
      const side = idx % 2 === 0 ? -1 : 1;
      const lz = side * (railHalfWidth + 28);

      const bankGeo = new THREE.CircleGeometry(28, 24);
      bankGeo.rotateX(-Math.PI / 2);
      const bank = new THREE.Mesh(bankGeo, bankMat);
      bank.position.set(lx, 0.01, lz);
      bank.scale.set(2.4, 1, 0.85);
      this.trackGroup.add(bank);

      const lakeGeo = new THREE.CircleGeometry(25, 24);
      lakeGeo.rotateX(-Math.PI / 2);
      const lake = new THREE.Mesh(lakeGeo, lakeMat);
      lake.position.set(lx, 0.03, lz);
      lake.scale.set(2.4, 1, 0.85);
      this.trackGroup.add(lake);

      // 3 fountain spouts per lake
      [-22, 0, 22].forEach((dx, fIdx) => {
        const jet = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7.5, 10), jetMat);
        jet.position.set(lx + dx, 3.7, lz);
        this.trackGroup.add(jet);
        this.fountainJets.push({ mesh: jet, phase: idx * 2.1 + fIdx });
      });
    });

    // 2. Giant 3D Stadium Jumbotron Screens every ~280 metres down the inner rail
    const frameMat = new THREE.MeshStandardMaterial({ color: "#151d30", metalness: 0.6, roughness: 0.35 });
    const jumboStep = Math.max(240, courseSpan / 10);
    for (let x = startM + 140; x < finishM - 70; x += jumboStep) {
      const jGroup = new THREE.Group();
      jGroup.position.set(x, 0, -(railHalfWidth + 6.5));
      jGroup.rotation.y = 0.25; // angled slightly toward approaching camera

      // Support legs
      [-3.5, 3.5].forEach(zLeg => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.5, 8), frameMat);
        leg.position.set(zLeg, 3.25, 0);
        jGroup.add(leg);
      });

      // Screen bezel & live canvas screen
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(10.6, 5.6, 0.45), frameMat);
      bezel.position.set(0, 6.6, 0);
      bezel.castShadow = true;
      jGroup.add(bezel);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 4.9), this.jumbotronMat);
      screen.position.set(0, 6.6, 0.26);
      jGroup.add(screen);

      this.trackGroup.add(jGroup);
    }

    // 3. Stadium Floodlight Towers spaced along the outer & inner course
    const towerCount = Math.min(28, Math.max(10, Math.floor(courseSpan / 180)));
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.28, 13.5, 8);
    const headGeo = new THREE.BoxGeometry(1.2, 1.4, 3.6);
    const bulbGeo = new THREE.PlaneGeometry(1.0, 3.2);

    for (let i = 0; i < towerCount; i++) {
      const tx = startM + ((i + 0.5) / towerCount) * courseSpan;
      const side = i % 2 === 0 ? -1 : 1;
      const tz = side * (railHalfWidth + 4.8);

      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);

      const pole = new THREE.Mesh(poleGeo, frameMat);
      pole.position.set(0, 6.75, 0);
      tGroup.add(pole);

      const head = new THREE.Mesh(headGeo, frameMat);
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
      this._buildGrandstand(startM + courseSpan * pct, railHalfWidth, 34);
    });
  }

  _buildGrandstand(anchorX, railHalfWidth = 11.65, standLen = 58) {
    const standGroup = new THREE.Group();
    standGroup.position.set(anchorX - standLen * 0.42, 0, -(railHalfWidth + 9.8));

    const concreteMat = new THREE.MeshStandardMaterial({ color: "#1d263b", roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: "#0e4f28", roughness: 0.45, metalness: 0.2 });
    const brassTrimMat = new THREE.MeshStandardMaterial({ color: "#e5c158", metalness: 0.6, roughness: 0.3 });

    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(standLen, 1.15, 2.2), concreteMat);
      tier.position.set(0, 0.58 + t * 1.05, -t * 1.9);
      tier.castShadow = true;
      tier.receiveShadow = true;
      standGroup.add(tier);
    }

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(standLen, 7.2, 0.8), concreteMat);
    backWall.position.set(0, 3.6, -7.6);
    backWall.castShadow = true;
    standGroup.add(backWall);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 2, 0.45, 11.5), roofMat);
    roof.position.set(0, 7.35, -3.2);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    standGroup.add(roof);

    const fascia = new THREE.Mesh(new THREE.BoxGeometry(standLen + 2.1, 0.28, 0.25), brassTrimMat);
    fascia.position.set(0, 7.1, 2.5);
    standGroup.add(fascia);

    const crowdCount = Math.floor(standLen * 3.8);
    const personGeo = new THREE.BoxGeometry(0.42, 0.75, 0.42);
    const personMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
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
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a321f", roughness: 0.9 });
    const crownGeo = new THREE.DodecahedronGeometry(1.75, 1);
    const crownMat = new THREE.MeshStandardMaterial({ color: "#1c6b31", roughness: 0.78 });

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

      dummy.position.set(x, 1.1 * scale, finalZ);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, i * 1.1, 0);
      dummy.updateMatrix();
      trunksMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 2.85 * scale, finalZ);
      dummy.scale.set(scale, scale * 1.22, scale);
      dummy.updateMatrix();
      crownsMesh.setMatrixAt(i, dummy.matrix);
      this.treeCrownBaseMatrices.push({
        x,
        y: 2.85 * scale,
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

    // 1. Update camera-wrapped 3D waving grass blades around cameraFocusX
    if (this.grassInst) {
      const halfW = this.grassWrapWidth * 0.5;
      for (let i = 0; i < this.grassBladeCount; i++) {
        const g = this.grassOffsets[i];
        let worldX = cameraFocusX + g.dx;
        // Wrap deterministically
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

    // 2. Tree canopy wind sway
    if (this.treeCrownsMesh && this.treeCrownBaseMatrices.length > 0) {
      for (let i = 0; i < this.treeCrownBaseMatrices.length; i++) {
        const b = this.treeCrownBaseMatrices[i];
        const gust = Math.sin(nowSec * 2.2 + b.phase) * (0.04 + Math.abs(w) * 0.025);
        const leanX = w * 0.08 + gust;
        dummy.position.set(b.x + leanX * 0.45, b.y, b.z);
        dummy.scale.set(b.scale, b.scale * 1.22, b.scale);
        dummy.rotation.set(0, b.phase, -leanX * 0.35);
        dummy.updateMatrix();
        this.treeCrownsMesh.setMatrixAt(i, dummy.matrix);
      }
      this.treeCrownsMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Furlong flags flutter
    this.furlongFlags.forEach((flag, idx) => {
      flag.rotation.y = Math.sin(nowSec * 6.0 + idx) * (0.12 + Math.abs(w) * 0.06);
    });

    // 4. Infield lake fountain jets pulse
    this.fountainJets.forEach(f => {
      const pulse = 0.82 + Math.sin(nowSec * 4.5 + f.phase) * 0.22;
      f.mesh.scale.set(1, pulse, 1);
      f.mesh.rotation.z = -w * 0.05;
    });

    // 5. Floodlight emissive glow intensifies as the race enters Golden Hour / Dusk
    if (this.floodlightBulbMat) {
      this.floodlightBulbMat.emissiveIntensity = lerp(0.25, 2.8, clamp(raceProgress * 1.25, 0, 1));
    }
  }
}

/* ============================================================================
 * Horse Rally 3D — Procedural 3D Racecourse, Starting Stalls, Hedges & Grandstand
 * Skills: threejs-procedural-geometry, threejs-procedural-vegetation
 * ============================================================================ */

import * as THREE from "three";
import { LANES_Z, NUM_HORSES, PX_PER_FURLONG, SIM_TO_M, START_X } from "./config.js";

/**
 * Generates a procedural striped turf & worn running lane texture
 */
function createTurfCanvasTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");

  // Two-tone mowed turf lawn stripes along X
  ctx.fillStyle = "#1f6e32";
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "#257d3b";
  ctx.fillRect(256, 0, 256, 512);

  // Subtle organic turf grain
  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(x, y, 3, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 8);
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

    this.stallGates = [];
    this.treeCrownsMesh = null;
    this.treeCrownBaseMatrices = [];
    this.grassBladesMesh = null;
    this.furlongFlags = [];
  }

  /**
   * Rebuilds the 3D racecourse geometry whenever race distance or Flat/Hedges mode changes.
   */
  buildCourse({ raceFurlongs, finishSimX, hedgesSimX, useHedges }) {
    // Clear existing children
    while (this.trackGroup.children.length > 0) {
      const child = this.trackGroup.children[0];
      this.trackGroup.remove(child);
    }
    this.stallGates = [];
    this.treeCrownBaseMatrices = [];
    this.furlongFlags = [];

    const startM = START_X * SIM_TO_M;
    const finishM = finishSimX * SIM_TO_M;
    const raceLengthM = finishM - startM;
    const totalCourseLength = finishM + 140;
    const laneSpan = LANES_Z[LANES_Z.length - 1] - LANES_Z[0];
    const trackWidth = laneSpan + 5.2; // 9 lanes (-8.8..+8.8 = 17.6m) plus turf margins -> 22.8m
    const railHalfWidth = trackWidth * 0.5 + 0.25; // 11.65m

    // 1. Main Striped Racecourse Turf Strip
    this.turfTexture.repeat.set(Math.round(totalCourseLength / 14), 1);
    const trackGeo = new THREE.PlaneGeometry(totalCourseLength + 80, trackWidth, 64, 8);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMesh = new THREE.Mesh(trackGeo, this.turfMaterial);
    trackMesh.position.set(totalCourseLength * 0.5 - 20, 0, 0);
    trackMesh.receiveShadow = true;
    this.trackGroup.add(trackMesh);

    // 2. Surrounding Infield & Paddock Ground Plane
    const surroundGeo = new THREE.PlaneGeometry(totalCourseLength + 600, 360);
    surroundGeo.rotateX(-Math.PI / 2);
    const surroundMesh = new THREE.Mesh(surroundGeo, this.infieldMaterial);
    surroundMesh.position.set(totalCourseLength * 0.5, -0.03, 0);
    surroundMesh.receiveShadow = true;
    this.trackGroup.add(surroundMesh);

    // 3. Dashed White Lane Dividers between all lanes
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
    this._buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth);

    // 9. 3D Steeplechase Hedges (when useHedges === true)
    if (useHedges && hedgesSimX.length > 0) {
      this._buildSteeplechaseHedges(hedgesSimX, trackWidth);
    }

    // 10. Grandstand & Crowd along the Final Furlong
    this._buildGrandstand(finishM, railHalfWidth);

    // 11. Instanced 3D Turf Grass Tuft Clusters & Perimeter Trees (threejs-procedural-vegetation)
    this._buildVegetation(totalCourseLength, railHalfWidth);
  }

  _buildPerimeterRails(totalLength, halfWidth) {
    // Horizontal top rails
    const railLen = totalLength + 40;
    const railGeo = new THREE.BoxGeometry(railLen, 0.10, 0.08);
    [-halfWidth, halfWidth].forEach(zPos => {
      const topRail = new THREE.Mesh(railGeo, this.railMaterial);
      topRail.position.set(railLen * 0.5 - 20, 1.08, zPos);
      topRail.castShadow = true;
      this.trackGroup.add(topRail);
    });

    // Instanced vertical fence posts every 3.5 metres
    const postSpacing = 3.5;
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

    // Overhead header truss spanning all 9 stalls
    const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, totalStallSpan), frameMat);
    headerBeam.position.set(0, 2.75, 0);
    headerBeam.castShadow = true;
    stallGroup.add(headerBeam);

    // Top banner sign
    const signBanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.65, 10.5),
      new THREE.MeshStandardMaterial({ map: createBannerTexture("STARTING STALLS", "#101b3b", "#56f0c1") })
    );
    signBanner.position.set(1.28, 3.25, 0);
    stallGroup.add(signBanner);

    // Dividers and swinging front gates for each of the 9 lanes
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

    // Swinging double doors per lane
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
    // openProgress: 0 (closed) -> 1 (flung open 88 degrees forward)
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
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 4.6, 12), postMat);
      pillar.position.set(0, 2.3, zSide);
      pillar.castShadow = true;
      gantry.add(pillar);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), goldMat);
      finial.position.set(0, 4.75, zSide);
      gantry.add(finial);
    });

    // Overhead Finish Banner
    const bannerTex = createBannerTexture("🏁 FINISH LINE 🏁", "#131c38", "#ffd76a");
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.4 });
    const bannerBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.92, spanZ * 2 + 0.4), bannerMat);
    bannerBox.position.set(0, 4.25, 0);
    bannerBox.castShadow = true;
    gantry.add(bannerBox);

    this.trackGroup.add(gantry);
  }

  _buildFurlongMarkers(startM, finishM, raceFurlongs, railHalfWidth = 11.65) {
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8);
    const flagGeo = new THREE.PlaneGeometry(0.75, 0.42, 4, 1);
    flagGeo.translate(0.375, 0, 0);
    const zPole = -(railHalfWidth + 0.25);

    for (let f = 1; f < raceFurlongs; f++) {
      const distFromFinishFurlongs = raceFurlongs - f;
      const xPos = startM + f * PX_PER_FURLONG * SIM_TO_M;
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

    hedgesSimX.forEach(hx => {
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

      // Sloped orange/white timber takeoff guard bar on approach side
      const bar = new THREE.Mesh(takeoffBarGeo, this.takeoffBarMaterial);
      bar.position.set(-0.62, 0.42, 0);
      bar.castShadow = true;
      hGroup.add(bar);

      // White wing standards on left and right edges of the jump
      [-hedgeWidth * 0.5, hedgeWidth * 0.5].forEach(zEdge => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 0.14), this.railMaterial);
        wing.position.set(0, 0.67, zEdge);
        hGroup.add(wing);
      });

      this.trackGroup.add(hGroup);
    });
  }

  _buildGrandstand(finishM, railHalfWidth = 11.65) {
    // Low-poly Royal Turf Club Grandstand lining the North infield side near the finish line
    const standLen = 58;
    const standGroup = new THREE.Group();
    standGroup.position.set(finishM - standLen * 0.42, 0, -(railHalfWidth + 9.8));

    const concreteMat = new THREE.MeshStandardMaterial({ color: "#1d263b", roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: "#0e4f28", roughness: 0.45, metalness: 0.2 });
    const brassTrimMat = new THREE.MeshStandardMaterial({ color: "#e5c158", metalness: 0.6, roughness: 0.3 });

    // 4 stepped spectator tiers
    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(standLen, 1.15, 2.2),
        concreteMat
      );
      tier.position.set(0, 0.58 + t * 1.05, -t * 1.9);
      tier.castShadow = true;
      tier.receiveShadow = true;
      standGroup.add(tier);
    }

    // Back wall & cantilevered canopy roof
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

    // Instanced colorful spectator dots seated along the tiers
    const crowdCount = 220;
    const personGeo = new THREE.BoxGeometry(0.42, 0.75, 0.42);
    const personMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const crowdInst = new THREE.InstancedMesh(personGeo, personMat, crowdCount);
    const dummy = new THREE.Object3D();
    const palette = [
      new THREE.Color("#ff526d"),
      new THREE.Color("#61a0ff"),
      new THREE.Color("#ffd85a"),
      new THREE.Color("#56f0c1"),
      new THREE.Color("#f070ff"),
      new THREE.Color("#ffffff")
    ];

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
    // 1. Instanced Perimeter Trees along the infield & backdrop
    const treeCount = Math.min(90, Math.max(36, Math.floor(totalCourseLength / 10)));
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
      const z = side * (railHalfWidth + 4.0 + ((i * 7) % 14));
      // Leave clearing in front of grandstand
      const isGrandstandZone = side < 0 && x > totalCourseLength - 210 && x < totalCourseLength - 135;
      const finalZ = isGrandstandZone ? z - 18 : z;
      const scale = 0.8 + ((i * 13) % 7) * 0.12;

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

  /**
   * Animates rooted wind deformation on tree canopies and furlong flags
   */
  updateVegetationWind(nowSec, windForce) {
    const w = windForce || 0;
    if (this.treeCrownsMesh && this.treeCrownBaseMatrices.length > 0) {
      const dummy = new THREE.Object3D();
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

    this.furlongFlags.forEach((flag, idx) => {
      flag.rotation.y = Math.sin(nowSec * 6.0 + idx) * (0.12 + Math.abs(w) * 0.06);
    });
  }
}

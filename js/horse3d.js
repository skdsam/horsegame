/* ============================================================================
 * Horse Rally 3D — Sculpted Anatomical 3D Horse & Jockey Assembly + Animator
 * Skills: threejs-procedural-geometry, threejs-procedural-animation,
 *         3d-cloth-material, 3d-metal-material
 * ============================================================================ */

import * as THREE from "three";
import { EQUINE_COATS, JUMP_DUR, JUMP_H, LANES_Z, SIM_TO_M, clamp, lerp } from "./config.js";

const SILK_SECONDARIES = [
  "#ffffff", // 1 White chevrons
  "#ffd76a", // 2 Gold hoops
  "#10182b", // 3 Navy diamonds
  "#56f0c1", // 4 Mint stars
  "#ffffff", // 5 White quarters
  "#141824", // 6 Obsidian stripes
  "#132247", // 7 Royal sash
  "#ffd76a", // 8 Gold crossbelts
  "#ffffff"  // 9 White polka spots
];

/**
 * Generates an anatomical lofted BufferGeometry from cross-section ring profiles.
 * Skills: threejs-procedural-geometry (semantic profile lofting with distance-based UVs)
 */
function createLoftedMeshGeometry(sections, radialSegments = 16, capEnds = true) {
  const numSections = sections.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < numSections; i++) {
    const s = sections[i];
    const v = i / Math.max(1, numSections - 1);
    const tilt = s.tilt || 0;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const cosA = Math.cos(theta);
      const sinA = Math.sin(theta);

      // Asymmetric dorsal/ventral & ribcage shaping
      const rY = sinA >= 0 ? (s.ryTop ?? s.ry) : (s.ryBot ?? s.ry);
      const localY = sinA * rY;
      const localZ = cosA * s.rz;

      // Rotate cross-section by tilt angle in XY plane
      const px = s.x - localY * sinT;
      const py = s.y + localY * cosT;
      const pz = (s.z || 0) + localZ;

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < numSections - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (capEnds && numSections >= 2) {
    const first = sections[0];
    const last = sections[numSections - 1];
    const startCenterIdx = positions.length / 3;
    positions.push(first.x, first.y, first.z || 0);
    uvs.push(0.5, 0);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(startCenterIdx, j + 1, j);
    }

    const endCenterIdx = positions.length / 3;
    const lastRingOffset = (numSections - 1) * stride;
    positions.push(last.x, last.y, last.z || 0);
    uvs.push(0.5, 1);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(endCenterIdx, lastRingOffset + j, lastRingOffset + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sculpted equine barrel, deep brisket, ribcage, and muscular croup
 */
function buildEquineTorsoGeometry() {
  return createLoftedMeshGeometry([
    { x: -0.78, y: 0.02, ryTop: 0.14, ryBot: 0.14, rz: 0.13, tilt: 0.35 },  // dock of tail
    { x: -0.66, y: 0.08, ryTop: 0.33, ryBot: 0.32, rz: 0.33, tilt: 0.18 },  // muscular croup
    { x: -0.45, y: 0.10, ryTop: 0.38, ryBot: 0.36, rz: 0.38, tilt: 0.05 },  // hindquarters / hip
    { x: -0.22, y: 0.04, ryTop: 0.34, ryBot: 0.36, rz: 0.35, tilt: 0.0 },   // loin / flank
    { x:  0.04, y: 0.02, ryTop: 0.36, ryBot: 0.41, rz: 0.39, tilt: 0.0 },   // mid barrel / saddle bed
    { x:  0.30, y: 0.06, ryTop: 0.43, ryBot: 0.43, rz: 0.37, tilt: -0.06 }, // prominent withers & deep heart girth
    { x:  0.54, y: 0.04, ryTop: 0.37, ryBot: 0.38, rz: 0.34, tilt: -0.15 }, // muscular breast / shoulder point
    { x:  0.70, y: 0.06, ryTop: 0.20, ryBot: 0.21, rz: 0.19, tilt: -0.25 }  // anterior chest closure
  ], 20, true);
}

/**
 * Builds a sculpted, arched thoroughbred neck from chest/withers to poll
 */
function buildEquineNeckGeometry() {
  return createLoftedMeshGeometry([
    { x: -0.04, y: -0.04, ryTop: 0.28, ryBot: 0.27, rz: 0.24, tilt: 0.25 }, // base of neck into shoulder
    { x:  0.00, y:  0.22, ryTop: 0.25, ryBot: 0.23, rz: 0.20, tilt: 0.20 }, // mid-lower neck
    { x:  0.04, y:  0.48, ryTop: 0.22, ryBot: 0.19, rz: 0.17, tilt: 0.12 }, // arched crest
    { x:  0.06, y:  0.72, ryTop: 0.17, ryBot: 0.15, rz: 0.14, tilt: 0.02 }, // throatlatch
    { x:  0.06, y:  0.86, ryTop: 0.13, ryBot: 0.12, rz: 0.12, tilt: -0.05 } // poll junction
  ], 16, true);
}

/**
 * Builds a sculpted equine head with broad forehead, Cheek/jowl, dished bridge, and tapered muzzle
 */
function buildEquineHeadGeometry() {
  return createLoftedMeshGeometry([
    { x: -0.08, y:  0.03, ryTop: 0.12, ryBot: 0.13, rz: 0.12, tilt: -0.1 }, // poll back
    { x:  0.04, y:  0.02, ryTop: 0.15, ryBot: 0.19, rz: 0.15, tilt: 0.0 },  // deep jowl / jaw & cranium
    { x:  0.18, y:  0.01, ryTop: 0.14, ryBot: 0.14, rz: 0.145, tilt: 0.05 },// eye socket & broad forehead
    { x:  0.34, y: -0.03, ryTop: 0.10, ryBot: 0.10, rz: 0.105, tilt: 0.10 },// nasal bridge
    { x:  0.49, y: -0.06, ryTop: 0.085, ryBot: 0.08, rz: 0.095, tilt: 0.12 },// flared nostrils / muzzle
    { x:  0.56, y: -0.08, ryTop: 0.055, ryBot: 0.055, rz: 0.068, tilt: 0.15 } // upper/lower lip tip
  ], 16, true);
}

/**
 * Builds a sculpted S-curve flowing equine tail with volume
 */
function buildEquineTailGeometry() {
  return createLoftedMeshGeometry([
    { x:  0.00, y:  0.00, ryTop: 0.07, ryBot: 0.07, rz: 0.07, tilt: -0.3 },
    { x: -0.08, y: -0.14, ryTop: 0.11, ryBot: 0.11, rz: 0.11, tilt: -0.5 },
    { x: -0.16, y: -0.36, ryTop: 0.14, ryBot: 0.14, rz: 0.15, tilt: -0.3 },
    { x: -0.22, y: -0.60, ryTop: 0.12, ryBot: 0.12, rz: 0.13, tilt: -0.1 },
    { x: -0.28, y: -0.82, ryTop: 0.05, ryBot: 0.05, rz: 0.06, tilt: 0.1 },
    { x: -0.32, y: -0.94, ryTop: 0.01, ryBot: 0.01, rz: 0.01, tilt: 0.2 }
  ], 12, true);
}

// Shared static procedural geometries (built once for all 9 horses)
let SHARED_GEOS = null;
let SHARED_CLOTH_NORMAL_TEX = null;

/**
 * Generates a thread-level 5-harness satin weave normal map for jockey silks (Skill: 3d-cloth-material)
 */
function getSharedClothNormalMap() {
  if (SHARED_CLOTH_NORMAL_TEX) return SHARED_CLOTH_NORMAL_TEX;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = x % 8;
      const ty = y % 8;
      const nx = Math.sin((tx / 8) * Math.PI * 2) * 0.35;
      const ny = Math.sin((ty / 8) * Math.PI * 2) * 0.35;
      const idx = (y * size + x) * 4;
      d[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = 235;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  SHARED_CLOTH_NORMAL_TEX = tex;
  return tex;
}

function getSharedEquineGeometries() {
  if (SHARED_GEOS) return SHARED_GEOS;

  // Tapered muscular gaskin/forearm (upper leg) & cannon bone/fetlock (lower leg)
  const upperForeLeg = createLoftedMeshGeometry([
    { x: 0.02, y:  0.04, ryTop: 0.14, ryBot: 0.13, rz: 0.12 }, // muscular elbow/shoulder blend
    { x: 0.00, y: -0.22, ryTop: 0.095, ryBot: 0.09, rz: 0.085 },
    { x: 0.00, y: -0.48, ryTop: 0.068, ryBot: 0.068, rz: 0.068 },
    { x: 0.00, y: -0.54, ryTop: 0.076, ryBot: 0.076, rz: 0.074 }  // knee joint swelling
  ], 12, true);

  const upperHindLeg = createLoftedMeshGeometry([
    { x: -0.04, y:  0.06, ryTop: 0.19, ryBot: 0.17, rz: 0.15 }, // powerful stifle / gaskin thigh
    { x: -0.02, y: -0.24, ryTop: 0.12, ryBot: 0.11, rz: 0.10 },
    { x: -0.01, y: -0.48, ryTop: 0.072, ryBot: 0.075, rz: 0.07 },
    { x: -0.02, y: -0.54, ryTop: 0.088, ryBot: 0.085, rz: 0.076 } // point of hock joint
  ], 12, true);

  const lowerCannonLeg = createLoftedMeshGeometry([
    { x: 0.00, y:  0.00, ryTop: 0.066, ryBot: 0.066, rz: 0.064 },
    { x: 0.00, y: -0.22, ryTop: 0.052, ryBot: 0.052, rz: 0.050 }, // slender cannon bone
    { x: 0.00, y: -0.40, ryTop: 0.064, ryBot: 0.064, rz: 0.062 }, // fetlock joint
    { x: 0.03, y: -0.49, ryTop: 0.052, ryBot: 0.052, rz: 0.054 }  // sloped pastern
  ], 12, true);

  const hoof = createLoftedMeshGeometry([
    { x: 0.02, y:  0.00, ryTop: 0.056, ryBot: 0.056, rz: 0.058 }, // coronet band
    { x: 0.05, y: -0.10, ryTop: 0.076, ryBot: 0.070, rz: 0.078 }  // flared hoof wall at turf contact
  ], 12, true);

  SHARED_GEOS = {
    torso: buildEquineTorsoGeometry(),
    neck: buildEquineNeckGeometry(),
    head: buildEquineHeadGeometry(),
    tail: buildEquineTailGeometry(),
    upperForeLeg,
    upperHindLeg,
    lowerCannonLeg,
    hoof
  };
  return SHARED_GEOS;
}

/**
 * Generates patterned woven silk cloth texture (stripes, hoops, diamonds, chevrons, quarters, sash)
 */
function makePatternedSilkTexture(index, primaryHex) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");

  const secondaryHex = SILK_SECONDARIES[index % SILK_SECONDARIES.length];
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = secondaryHex;
  ctx.strokeStyle = secondaryHex;
  const patternType = index % 6;

  if (patternType === 0) {
    for (let x = 16; x < 256; x += 48) {
      ctx.fillRect(x, 0, 20, 256);
    }
  } else if (patternType === 1) {
    for (let y = 18; y < 256; y += 52) {
      ctx.fillRect(0, y, 256, 22);
    }
  } else if (patternType === 2) {
    const s = 48;
    for (let y = 0; y < 256; y += s) {
      for (let x = 0; x < 256; x += s) {
        if (((x / s) + (y / s)) % 2 === 0) {
          ctx.beginPath();
          ctx.moveTo(x + s * 0.5, y);
          ctx.lineTo(x + s, y + s * 0.5);
          ctx.lineTo(x + s * 0.5, y + s);
          ctx.lineTo(x, y + s * 0.5);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  } else if (patternType === 3) {
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(128, 128, 128, 128);
  } else if (patternType === 4) {
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(-20, 20);
    ctx.lineTo(276, 236);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-20, 130);
    ctx.lineTo(276, 346);
    ctx.stroke();
  } else {
    for (let y = 28; y < 256; y += 56) {
      for (let x = 28; x < 256; x += 56) {
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Subtle thread-level dye variation
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let y = 0; y < 256; y += 4) {
    ctx.fillRect(0, y, 256, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a canvas-backed texture for numbered saddlecloths
 */
function makeSaddleNumberTexture(number, silkColor) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = silkColor;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 114, 114);

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, 96, 96);

  ctx.fillStyle = "#0e1324";
  ctx.font = "900 70px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 64, 68);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNameplateCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

export function updateNameplateSprite(actor, horseName, silkColor, isLeader, isFallen) {
  const stateKey = `${horseName}|${silkColor}|${isLeader ? 1 : 0}|${isFallen ? 1 : 0}`;
  if (actor.lastLabelState === stateKey) return;
  actor.lastLabelState = stateKey;

  const { canvas, texture } = actor.labelData;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pill background
  const bgX = 24, bgY = 28, bgW = 464, bgH = 74, r = 22;
  ctx.fillStyle = isFallen ? "rgba(75, 14, 28, 0.88)" : "rgba(11, 16, 32, 0.84)";
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, r);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = isLeader ? "#ffd76a" : silkColor;
  ctx.stroke();

  // Silk color badge circle
  ctx.fillStyle = silkColor;
  ctx.beginPath();
  ctx.arc(66, 65, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0b0e17";
  ctx.font = "900 28px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(actor.index + 1), 66, 66);

  // Horse name
  ctx.fillStyle = "#f4f7ff";
  ctx.font = "800 29px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  const displayTitle = horseName.length > 18 ? horseName.slice(0, 17) + "…" : horseName;
  ctx.fillText(displayTitle, 102, 65);

  // Status right-aligned icon (clean: only FELL or Leader Crown, no boost chevrons)
  ctx.textAlign = "right";
  if (isFallen) {
    ctx.fillStyle = "#ff6b8a";
    ctx.font = "900 26px Inter, system-ui, sans-serif";
    ctx.fillText("FELL!", 468, 66);
  } else if (isLeader) {
    ctx.font = "34px serif";
    ctx.fillText("👑", 468, 66);
  }

  texture.needsUpdate = true;
}

/**
 * Builds an articulated, anatomically sculpted 3D Horse & Jockey actor facing +X in Y-up metre coordinates.
 * Ground contact is at local Y = 0. Total height ~2.3m, length ~2.6m.
 */
export function createHorseActor(index, silkColorHex) {
  const coat = EQUINE_COATS[index % EQUINE_COATS.length];
  const geos = getSharedEquineGeometries();
  const clothNormalMap = getSharedClothNormalMap();

  const root = new THREE.Group();
  root.name = `HorseActor_${index + 1}`;
  root.position.set(0, 0, LANES_Z[index]);

  // Body pivot at hip/chest level (Y = 1.15m) for pitch, bounce, and jump rotation
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 1.15, 0);
  root.add(bodyPivot);

  // Physically based Equine Coat with Clearcoat Sweat Gloss & Velvet Fur Sheen (MeshPhysicalMaterial)
  const coatColor = new THREE.Color(coat.body);
  const coatSheenColor = coatColor.clone().lerp(new THREE.Color("#ffffff"), 0.35);
  const coatMat = new THREE.MeshPhysicalMaterial({
    color: coatColor,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.24,
    clearcoatRoughness: 0.32,
    sheen: 0.65,
    sheenRoughness: 0.48,
    sheenColor: coatSheenColor
  });

  const maneMat = new THREE.MeshPhysicalMaterial({
    color: coat.mane,
    roughness: 0.72,
    metalness: 0.02,
    sheen: 0.45,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(coat.mane).lerp(new THREE.Color("#ffffff"), 0.25)
  });

  const muzzleMat = new THREE.MeshPhysicalMaterial({
    color: coat.muzzle,
    roughness: 0.36,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4
  });

  const sockMat = new THREE.MeshStandardMaterial({
    color: coat.socks,
    roughness: 0.58
  });

  const wrapMat = new THREE.MeshPhysicalMaterial({
    color: silkColorHex,
    roughness: 0.78,
    sheen: 0.6,
    sheenRoughness: 0.65,
    normalMap: clothNormalMap,
    normalScale: new THREE.Vector2(0.35, 0.35)
  });

  const hoofMat = new THREE.MeshPhysicalMaterial({
    color: coat.hooves,
    roughness: 0.24,
    metalness: 0.15,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22
  });

  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: "#2b170b",
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.38,
    clearcoatRoughness: 0.28
  });

  // Conductor Steel Material for Stirrup Irons & Bit Rings (Skill: 3d-metal-material, F0 = 0.56, 0.57, 0.58)
  const metalIronMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.56, 0.57, 0.58, THREE.LinearSRGBColorSpace),
    roughness: 0.16,
    metalness: 1.0
  });

  // Woven Satin Jockey Silk Material (Skill: 3d-cloth-material)
  const patternedSilkTex = makePatternedSilkTexture(index, silkColorHex);
  const silkBaseCol = new THREE.Color(silkColorHex);
  const silkMat = new THREE.MeshPhysicalMaterial({
    map: patternedSilkTex,
    normalMap: clothNormalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.34,
    metalness: 0.05,
    sheen: 0.75,
    sheenRoughness: 0.28,
    sheenColor: silkBaseCol.clone().multiplyScalar(0.62).addScalar(0.25),
    clearcoat: 0.15,
    clearcoatRoughness: 0.35
  });

  const solidSilkMat = new THREE.MeshPhysicalMaterial({
    color: silkColorHex,
    normalMap: clothNormalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.36,
    sheen: 0.65,
    sheenRoughness: 0.30
  });

  const breechesMat = new THREE.MeshPhysicalMaterial({
    color: "#f2f4f8",
    roughness: 0.62,
    sheen: 0.45,
    sheenRoughness: 0.55
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: "#e0ac8b",
    roughness: 0.52
  });

  const saddleClothMat = new THREE.MeshStandardMaterial({
    map: makeSaddleNumberTexture(index + 1, silkColorHex),
    roughness: 0.52
  });

  // 1. Anatomically Sculpted Equine Torso (Barrel, Brisket, Withers & Croup)
  const torso = new THREE.Mesh(geos.torso, coatMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // Numbered Saddlecloth, Girth Strap & Sculpted Leather Racing Saddle
  const clothGeo = new THREE.BoxGeometry(0.66, 0.46, 0.78);
  const saddleCloth = new THREE.Mesh(clothGeo, saddleClothMat);
  saddleCloth.position.set(0.02, 0.19, 0);
  saddleCloth.castShadow = true;
  bodyPivot.add(saddleCloth);

  const girthGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.09, 16);
  girthGeo.rotateZ(Math.PI / 2);
  const girth = new THREE.Mesh(girthGeo, leatherMat);
  girth.position.set(0.18, -0.01, 0);
  bodyPivot.add(girth);

  const saddleGeo = new THREE.CapsuleGeometry(0.14, 0.34, 6, 12);
  saddleGeo.rotateZ(Math.PI / 2);
  saddleGeo.scale(1, 0.55, 1.85);
  const saddle = new THREE.Mesh(saddleGeo, leatherMat);
  saddle.position.set(0.0, 0.38, 0);
  bodyPivot.add(saddle);

  // Stirrup leathers & conductor steel stirrup irons
  [-0.37, 0.37].forEach(zSide => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.015), leatherMat);
    strap.position.set(0.06, 0.15, zSide);
    bodyPivot.add(strap);

    const iron = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.011, 8, 14), metalIronMat);
    iron.position.set(0.06, -0.05, zSide);
    iron.rotation.y = Math.PI / 2;
    bodyPivot.add(iron);
  });

  // 2. Articulated Sculpted Neck, Head, Braided Mane & Bridle
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.56, 0.18, 0);
  neckPivot.rotation.z = -0.56;
  bodyPivot.add(neckPivot);

  const neckMesh = new THREE.Mesh(geos.neck, coatMat);
  neckMesh.castShadow = true;
  neckMesh.receiveShadow = true;
  neckPivot.add(neckMesh);

  // Sculpted Mane Crest along back of neck
  const maneGeo = new THREE.BoxGeometry(0.11, 0.78, 0.07);
  const maneMesh = new THREE.Mesh(maneGeo, maneMat);
  maneMesh.position.set(-0.12, 0.44, 0);
  maneMesh.rotation.z = -0.08;
  neckPivot.add(maneMesh);

  // Sculpted Equine Head at top of neck
  const headPivot = new THREE.Group();
  headPivot.position.set(0.06, 0.84, 0);
  headPivot.rotation.z = 0.44;
  neckPivot.add(headPivot);

  const headMesh = new THREE.Mesh(geos.head, coatMat);
  headMesh.castShadow = true;
  headPivot.add(headMesh);

  // Soft velvet muzzle tip highlight
  const muzzleCap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), muzzleMat);
  muzzleCap.scale.set(1.15, 0.9, 1.05);
  muzzleCap.position.set(0.51, -0.07, 0);
  headPivot.add(muzzleCap);

  // Expressive dark glossy eyes
  const eyeGeo = new THREE.SphereGeometry(0.028, 10, 10);
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: "#120c08",
    roughness: 0.08,
    clearcoat: 1.0
  });
  [-0.135, 0.135].forEach(zSide => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.18, 0.06, zSide);
    headPivot.add(eye);
  });

  // Blaze stripe on nasal bridge
  const blazeGeo = new THREE.BoxGeometry(0.28, 0.03, 0.07);
  const blaze = new THREE.Mesh(blazeGeo, sockMat);
  blaze.position.set(0.28, 0.07, 0);
  blaze.rotation.z = -0.25;
  headPivot.add(blaze);

  // Silk Racing Hood, White Blinker Eye-Cups & Steel Bit Rings
  const hoodGeo = new THREE.SphereGeometry(0.155, 14, 12);
  hoodGeo.scale(1.15, 0.98, 0.98);
  const hood = new THREE.Mesh(hoodGeo, solidSilkMat);
  hood.position.set(0.11, 0.02, 0);
  headPivot.add(hood);

  const cupGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.032, 12);
  cupGeo.rotateX(Math.PI / 2);
  [-0.142, 0.142].forEach(zSide => {
    const cup = new THREE.Mesh(cupGeo, breechesMat);
    cup.position.set(0.17, 0.06, zSide);
    headPivot.add(cup);

    const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12), metalIronMat);
    bitRing.position.set(0.46, -0.08, zSide * 0.74);
    headPivot.add(bitRing);
  });

  // Leather noseband & browband
  const noseband = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.015, 8, 16), leatherMat);
  noseband.position.set(0.36, -0.03, 0);
  noseband.rotation.y = Math.PI / 2;
  headPivot.add(noseband);

  // Alert Sculpted Ears
  const earGeo = new THREE.ConeGeometry(0.042, 0.17, 8);
  [-0.085, 0.085].forEach(zOff => {
    const ear = new THREE.Mesh(earGeo, coatMat);
    ear.position.set(-0.01, 0.21, zOff);
    ear.rotation.z = -0.18;
    ear.rotation.x = zOff > 0 ? 0.12 : -0.12;
    headPivot.add(ear);
  });

  // 3D Leather Reins connecting Bridle Bit back to Jockey's Hands
  const reinGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.92, 6);
  reinGeo.rotateZ(Math.PI / 2);
  [-0.14, 0.14].forEach(zSide => {
    const rein = new THREE.Mesh(reinGeo, leatherMat);
    rein.position.set(0.55, 0.66, zSide);
    rein.rotation.z = 0.22;
    bodyPivot.add(rein);
  });

  // 3. Sculpted Flowing S-Curve Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.76, 0.10, 0);
  tailPivot.rotation.z = -0.45;
  bodyPivot.add(tailPivot);

  const tailMesh = new THREE.Mesh(geos.tail, maneMat);
  tailMesh.castShadow = true;
  tailPivot.add(tailMesh);

  // 4. Four Articulated Anatomically Tapered Legs (FL, FR, BL, BR)
  const legs = [];
  const legConfigs = [
    { name: "FL", isFront: true,  x:  0.54, z: -0.20, phase: 0.0 },
    { name: "FR", isFront: true,  x:  0.54, z:  0.20, phase: 0.25 },
    { name: "BL", isFront: false, x: -0.54, z: -0.21, phase: 0.52 },
    { name: "BR", isFront: false, x: -0.54, z:  0.21, phase: 0.77 }
  ];

  const wrapGeo = new THREE.CylinderGeometry(0.068, 0.058, 0.26, 10);

  legConfigs.forEach(cfg => {
    const shoulder = new THREE.Group();
    shoulder.position.set(cfg.x, -0.08, cfg.z);
    bodyPivot.add(shoulder);

    const upperMesh = new THREE.Mesh(cfg.isFront ? geos.upperForeLeg : geos.upperHindLeg, coatMat);
    upperMesh.castShadow = true;
    shoulder.add(upperMesh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.52, 0);
    shoulder.add(knee);

    const lowerMesh = new THREE.Mesh(geos.lowerCannonLeg, sockMat);
    lowerMesh.castShadow = true;
    knee.add(lowerMesh);

    // Woven cannon-bone racing wrap bandage
    const legWrap = new THREE.Mesh(wrapGeo, wrapMat);
    legWrap.position.set(0, -0.20, 0);
    knee.add(legWrap);

    const hoofMesh = new THREE.Mesh(geos.hoof, hoofMat);
    hoofMesh.position.set(0.01, -0.48, 0);
    knee.add(hoofMesh);

    legs.push({
      name: cfg.name,
      isFront: cfg.isFront,
      phase: cfg.phase,
      shoulder,
      knee
    });
  });

  // 5. Jockey Assembly crouched in aerodynamic thoroughbred stance
  const jockeyPivot = new THREE.Group();
  jockeyPivot.position.set(0.06, 0.44, 0);
  bodyPivot.add(jockeyPivot);

  const jTorsoPivot = new THREE.Group();
  jTorsoPivot.rotation.z = -0.78;
  jockeyPivot.add(jTorsoPivot);

  const jTorsoGeo = new THREE.CapsuleGeometry(0.16, 0.34, 8, 12);
  const jTorso = new THREE.Mesh(jTorsoGeo, silkMat);
  jTorso.position.set(0, 0.26, 0);
  jTorso.castShadow = true;
  jTorsoPivot.add(jTorso);

  // Jockey head, silk helmet & racing goggles
  const jHeadGroup = new THREE.Group();
  jHeadGroup.position.set(0.06, 0.56, 0);
  jHeadGroup.rotation.z = 0.65;
  jTorsoPivot.add(jHeadGroup);

  const jFace = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), skinMat);
  jHeadGroup.add(jFace);

  const helmetGeo = new THREE.SphereGeometry(0.132, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
  const helmet = new THREE.Mesh(helmetGeo, silkMat);
  helmet.position.set(-0.01, 0.02, 0);
  helmet.castShadow = true;
  jHeadGroup.add(helmet);

  // Jockey Goggles
  const goggles = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.045, 0.19),
    new THREE.MeshPhysicalMaterial({ color: "#111622", metalness: 0.4, roughness: 0.15, clearcoat: 1.0 })
  );
  goggles.position.set(0.095, 0.01, 0);
  jHeadGroup.add(goggles);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.16), leatherMat);
  visor.position.set(0.11, 0.04, 0);
  jHeadGroup.add(visor);

  // Jockey arms reaching toward reins
  const armGeo = new THREE.CapsuleGeometry(0.048, 0.34, 6, 10);
  armGeo.rotateZ(Math.PI / 2);
  let rightArmMesh = null;
  [-0.17, 0.17].forEach((zOff, idx) => {
    const arm = new THREE.Mesh(armGeo, silkMat);
    arm.position.set(0.22, 0.34, zOff);
    arm.rotation.z = -0.25;
    jTorsoPivot.add(arm);
    if (idx === 1) rightArmMesh = arm;

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.24, 6, 10), breechesMat);
    thigh.position.set(-0.04, -0.02, zOff * 1.35);
    thigh.rotation.z = 0.55;
    jockeyPivot.add(thigh);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.26, 10), leatherMat);
    boot.position.set(-0.12, -0.22, zOff * 1.45);
    boot.rotation.z = -0.35;
    jockeyPivot.add(boot);
  });

  // 6. 3D Golden Leader Crown (Skill: 3d-metal-material conductor gold F0 = 1.00, 0.71, 0.29)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0.2, 2.55, 0);
  crownGroup.visible = false;
  root.add(crownGroup);

  const crownMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(1.00, 0.71, 0.29, THREE.LinearSRGBColorSpace),
    metalness: 1.0,
    roughness: 0.14
  });
  const crownRing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.18, 6, 1, false), crownMat);
  crownGroup.add(crownRing);

  // 7. Floating Nameplate Sprite above horse
  const labelData = makeNameplateCanvas();
  const spriteMat = new THREE.SpriteMaterial({
    map: labelData.texture,
    transparent: true,
    depthTest: false
  });
  const labelSprite = new THREE.Sprite(spriteMat);
  labelSprite.position.set(0.0, 2.95, 0);
  labelSprite.scale.set(2.9, 0.72, 1);
  labelSprite.renderOrder = 10;
  root.add(labelSprite);

  return {
    index,
    silkColor: silkColorHex,
    root,
    bodyPivot,
    neckPivot,
    headPivot,
    tailPivot,
    jockeyPivot,
    jTorsoPivot,
    rightArmMesh,
    crownGroup,
    labelSprite,
    labelData,
    lastLabelState: "",
    legs,
    gaitPhase: index * 1.35,
    stumbleTilt: 0,
    lastHoofCycle: -1
  };
}

/**
 * Frame-rate-independent procedural animation update for an individual horse actor.
 */
export function updateHorseActorAnimation(actor, horseState, modelState, simContext, dt, nowMs) {
  const { isRacing, isJumpActive, jumpT, isFallen, isLeader, windForce } = simContext;

  const worldX = horseState.x * SIM_TO_M;
  actor.root.position.x = worldX;
  actor.root.position.z = LANES_Z[actor.index];

  const speedPx = isRacing && !isFallen ? clamp(modelState.momentum || horseState.speed || 115, 0, 230) : 0;
  const speedNorm = clamp(speedPx / 135, 0, 1.85);

  if (isRacing && !isFallen) {
    actor.gaitPhase += dt * (7.5 + speedNorm * 8.2);
  } else if (!isFallen) {
    actor.gaitPhase += dt * 1.8;
  }

  const p = actor.gaitPhase;

  let jumpY = 0;
  let targetPitch = 0;

  if (isJumpActive && !isFallen) {
    const arc = Math.sin(jumpT * Math.PI);
    jumpY = arc * (JUMP_H * 0.082);
    targetPitch = Math.cos(jumpT * Math.PI) * 0.44;
  } else if (isRacing && !isFallen) {
    jumpY = Math.abs(Math.sin(p)) * 0.14 * clamp(speedNorm, 0.4, 1.4);
    targetPitch = Math.cos(p) * 0.09 * clamp(speedNorm, 0.4, 1.3);
  } else if (!isFallen) {
    jumpY = Math.sin(p) * 0.025;
    targetPitch = Math.sin(p * 0.5) * 0.02;
  }

  // Handle Stumble / Pull-up animation
  if (isFallen) {
    actor.stumbleTilt = lerp(actor.stumbleTilt, 1.0, clamp(dt * 5.0, 0, 1));
    actor.bodyPivot.position.y = lerp(1.15, 0.68, actor.stumbleTilt);
    actor.bodyPivot.rotation.z = lerp(actor.bodyPivot.rotation.z, -0.35, clamp(dt * 6, 0, 1));
    actor.bodyPivot.rotation.x = lerp(actor.bodyPivot.rotation.x, 0.55, clamp(dt * 6, 0, 1));
    actor.neckPivot.rotation.z = -0.25 + Math.sin(nowMs * 0.008) * 0.12;
  } else {
    actor.stumbleTilt = 0;
    actor.bodyPivot.position.y = 1.15 + jumpY;
    actor.bodyPivot.rotation.z = lerp(actor.bodyPivot.rotation.z, targetPitch, clamp(dt * 16, 0, 1));
    actor.bodyPivot.rotation.x = 0;

    if (isRacing) {
      const neckSwing = Math.sin(p - 0.6) * 0.18 * clamp(speedNorm, 0.5, 1.4);
      actor.neckPivot.rotation.z = -0.56 + neckSwing;
      actor.headPivot.rotation.z = 0.44 - neckSwing * 0.6;
      actor.jockeyPivot.position.y = 0.44 + Math.sin(p * 2) * 0.04;
      actor.jTorsoPivot.rotation.z = -0.78 + Math.sin(p) * 0.07;

      if (actor.rightArmMesh) {
        actor.rightArmMesh.rotation.z = -0.25 + Math.sin(p) * 0.09;
      }
    } else {
      actor.neckPivot.rotation.z = -0.52 + Math.sin(p) * 0.05;
      actor.headPivot.rotation.z = 0.42 + Math.cos(p * 0.7) * 0.05;
      actor.jTorsoPivot.rotation.z = -0.62;
    }
  }

  // Tail streaming in gallop + windForce lateral sway
  const tailSpeedLift = isRacing && !isFallen ? clamp(speedNorm * 0.55, 0, 0.75) : 0.05;
  actor.tailPivot.rotation.z = -0.45 + tailSpeedLift + Math.sin(p * 1.5) * 0.14;
  actor.tailPivot.rotation.x = clamp((windForce || 0) * 0.06, -0.35, 0.35) + Math.cos(p) * 0.06;

  // 4-Beat Articulated Leg Kinematics
  actor.legs.forEach(leg => {
    const legAnglePhase = p + leg.phase * Math.PI * 2;
    if (isJumpActive && !isFallen) {
      if (leg.isFront) {
        leg.shoulder.rotation.z = 0.75;
        leg.knee.rotation.z = -1.35;
      } else {
        const pushToTuck = lerp(-0.85, 0.45, jumpT);
        leg.shoulder.rotation.z = pushToTuck;
        leg.knee.rotation.z = lerp(0.2, 1.0, jumpT);
      }
    } else if (isRacing && !isFallen) {
      const amp = 0.72 * clamp(speedNorm, 0.55, 1.35);
      const sRot = Math.sin(legAnglePhase) * amp;
      leg.shoulder.rotation.z = sRot;

      const bend = Math.max(0, Math.cos(legAnglePhase));
      leg.knee.rotation.z = leg.isFront ? -bend * 1.12 : bend * 0.95;
    } else if (isFallen) {
      leg.shoulder.rotation.z = leg.isFront ? 0.65 : -0.65;
      leg.knee.rotation.z = leg.isFront ? -1.1 : 0.9;
    } else {
      leg.shoulder.rotation.z = Math.sin(legAnglePhase) * 0.04;
      leg.knee.rotation.z = 0;
    }
  });

  // Leader Crown rotation & visibility
  const showCrown = isLeader && !isFallen && simContext.hasStarted;
  actor.crownGroup.visible = showCrown;
  if (showCrown) {
    actor.crownGroup.rotation.y += dt * 2.6;
    actor.crownGroup.position.y = 2.55 + jumpY + Math.sin(nowMs * 0.006) * 0.07;
  }

  // Update overhead nameplate sprite (no boost chevrons)
  actor.labelSprite.position.y = 2.95 + jumpY * 0.75;
  updateNameplateSprite(
    actor,
    horseState.name,
    actor.silkColor,
    showCrown,
    isFallen
  );

  // Detect hoof strike event once per stride cycle for audio & turf particles
  const currentCycle = Math.floor(p / (Math.PI * 2));
  let hoofStrike = false;
  if (isRacing && !isFallen && !isJumpActive && currentCycle > actor.lastHoofCycle) {
    actor.lastHoofCycle = currentCycle;
    hoofStrike = true;
  }

  return { hoofStrike, worldX, jumpY };
}

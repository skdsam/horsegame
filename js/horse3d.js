/* ============================================================================
 * Horse Rally 3D — Articulated 3D Horse & Jockey Procedural Assembly + Animator
 * Skills: threejs-procedural-geometry, threejs-procedural-animation
 * ============================================================================ */

import * as THREE from "three";
import { EQUINE_COATS, JUMP_DUR, JUMP_H, LANES_Z, SIM_TO_M, clamp, lerp } from "./config.js";

/**
 * Creates a canvas-backed texture for numbered saddlecloths & overhead badges
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

  ctx.fillStyle = "#0e1324";
  ctx.font = "900 72px Inter, system-ui, sans-serif";
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

export function updateNameplateSprite(actor, horseName, silkColor, isLeader, isBursting, isFallen) {
  const stateKey = `${horseName}|${silkColor}|${isLeader ? 1 : 0}|${isBursting ? 1 : 0}|${isFallen ? 1 : 0}`;
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

  // Status right-aligned icon
  ctx.textAlign = "right";
  if (isFallen) {
    ctx.fillStyle = "#ff6b8a";
    ctx.font = "900 26px Inter, system-ui, sans-serif";
    ctx.fillText("FELL!", 468, 66);
  } else if (isBursting) {
    ctx.fillStyle = "#ffd76a";
    ctx.font = "900 30px Inter, system-ui, sans-serif";
    ctx.fillText(">>>", 468, 66);
  } else if (isLeader) {
    ctx.font = "34px serif";
    ctx.fillText("👑", 468, 66);
  }

  texture.needsUpdate = true;
}

/**
 * Builds an articulated 3D Horse & Jockey actor facing +X in Y-up metre coordinates.
 * Ground contact is at local Y = 0. Total height ~2.3m, length ~2.6m.
 */
export function createHorseActor(index, silkColorHex) {
  const coat = EQUINE_COATS[index % EQUINE_COATS.length];

  const root = new THREE.Group();
  root.name = `HorseActor_${index + 1}`;
  root.position.set(0, 0, LANES_Z[index]);

  // Body pivot at hip/chest level (Y = 1.15m) for pitch, bounce, and jump rotation
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 1.15, 0);
  root.add(bodyPivot);

  // Shared PBR Materials
  const coatMat = new THREE.MeshStandardMaterial({
    color: coat.body,
    roughness: 0.52,
    metalness: 0.05
  });
  const maneMat = new THREE.MeshStandardMaterial({
    color: coat.mane,
    roughness: 0.78,
    metalness: 0.02
  });
  const muzzleMat = new THREE.MeshStandardMaterial({
    color: coat.muzzle,
    roughness: 0.45
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: coat.socks,
    roughness: 0.6
  });
  const hoofMat = new THREE.MeshStandardMaterial({
    color: coat.hooves,
    roughness: 0.35,
    metalness: 0.15
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: "#2b180c",
    roughness: 0.42,
    metalness: 0.12
  });
  const silkMat = new THREE.MeshStandardMaterial({
    color: silkColorHex,
    roughness: 0.32,
    metalness: 0.12,
    emissive: silkColorHex,
    emissiveIntensity: 0.08
  });
  const breechesMat = new THREE.MeshStandardMaterial({
    color: "#f2f4f8",
    roughness: 0.55
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: "#e0ac8b",
    roughness: 0.55
  });
  const saddleClothMat = new THREE.MeshStandardMaterial({
    map: makeSaddleNumberTexture(index + 1, silkColorHex),
    roughness: 0.5
  });

  // 1. Torso Barrel (oriented along X)
  const torsoGeo = new THREE.CapsuleGeometry(0.36, 0.92, 8, 16);
  torsoGeo.rotateZ(Math.PI / 2);
  const torso = new THREE.Mesh(torsoGeo, coatMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // Chest & Hindquarters muscular volume spheres
  const chestGeo = new THREE.SphereGeometry(0.39, 14, 12);
  chestGeo.scale(1.15, 1.05, 0.96);
  const chest = new THREE.Mesh(chestGeo, coatMat);
  chest.position.set(0.45, 0.03, 0);
  chest.castShadow = true;
  bodyPivot.add(chest);

  const croupGeo = new THREE.SphereGeometry(0.38, 14, 12);
  croupGeo.scale(1.12, 1.05, 0.95);
  const croup = new THREE.Mesh(croupGeo, coatMat);
  croup.position.set(-0.48, 0.06, 0);
  croup.castShadow = true;
  bodyPivot.add(croup);

  // Numbered Saddlecloth & Leather Saddle
  const clothGeo = new THREE.BoxGeometry(0.68, 0.48, 0.78);
  const saddleCloth = new THREE.Mesh(clothGeo, saddleClothMat);
  saddleCloth.position.set(0.02, 0.19, 0);
  saddleCloth.castShadow = true;
  bodyPivot.add(saddleCloth);

  const saddleGeo = new THREE.BoxGeometry(0.50, 0.14, 0.52);
  const saddle = new THREE.Mesh(saddleGeo, leatherMat);
  saddle.position.set(0.0, 0.36, 0);
  bodyPivot.add(saddle);

  // 2. Articulated Neck, Head, Mane & Bridle
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.62, 0.22, 0);
  neckPivot.rotation.z = -0.58; // Angled forward and up
  bodyPivot.add(neckPivot);

  const neckGeo = new THREE.CylinderGeometry(0.15, 0.27, 0.86, 12);
  const neckMesh = new THREE.Mesh(neckGeo, coatMat);
  neckMesh.position.set(0, 0.38, 0);
  neckMesh.castShadow = true;
  neckPivot.add(neckMesh);

  // Mane crest along back of neck
  const maneGeo = new THREE.BoxGeometry(0.12, 0.80, 0.08);
  const maneMesh = new THREE.Mesh(maneGeo, maneMat);
  maneMesh.position.set(-0.14, 0.40, 0);
  neckPivot.add(maneMesh);

  // Head group at top of neck
  const headPivot = new THREE.Group();
  headPivot.position.set(0.05, 0.78, 0);
  headPivot.rotation.z = 0.45;
  neckPivot.add(headPivot);

  const skullGeo = new THREE.BoxGeometry(0.42, 0.26, 0.26);
  const skull = new THREE.Mesh(skullGeo, coatMat);
  skull.position.set(0.12, 0, 0);
  skull.castShadow = true;
  headPivot.add(skull);

  const snoutGeo = new THREE.CylinderGeometry(0.10, 0.14, 0.34, 10);
  snoutGeo.rotateZ(-Math.PI / 2);
  const snout = new THREE.Mesh(snoutGeo, muzzleMat);
  snout.position.set(0.42, -0.03, 0);
  snout.castShadow = true;
  headPivot.add(snout);

  // Blaze stripe on forehead
  const blazeGeo = new THREE.BoxGeometry(0.32, 0.04, 0.08);
  const blaze = new THREE.Mesh(blazeGeo, sockMat);
  blaze.position.set(0.28, 0.12, 0);
  blaze.rotation.z = -0.22;
  headPivot.add(blaze);

  // Silk Blinkers / Hood on horse head
  const hoodGeo = new THREE.BoxGeometry(0.26, 0.28, 0.28);
  const hood = new THREE.Mesh(hoodGeo, silkMat);
  hood.position.set(0.08, 0.01, 0);
  headPivot.add(hood);

  // Ears
  const earGeo = new THREE.ConeGeometry(0.045, 0.16, 6);
  [-0.09, 0.09].forEach(zOff => {
    const ear = new THREE.Mesh(earGeo, coatMat);
    ear.position.set(-0.02, 0.20, zOff);
    ear.rotation.z = -0.2;
    headPivot.add(ear);
  });

  // 3. Articulated Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.84, 0.18, 0);
  tailPivot.rotation.z = -0.65;
  bodyPivot.add(tailPivot);

  const tailGeo = new THREE.ConeGeometry(0.13, 0.85, 8);
  tailGeo.rotateZ(Math.PI); // tip pointing down/back
  const tailMesh = new THREE.Mesh(tailGeo, maneMat);
  tailMesh.position.set(-0.12, -0.36, 0);
  tailMesh.castShadow = true;
  tailPivot.add(tailMesh);

  // 4. Four Articulated Two-Segment Legs (FL, FR, BL, BR)
  const legs = [];
  const legConfigs = [
    { name: "FL", x: 0.56, z: -0.20, phase: 0.0 },
    { name: "FR", x: 0.56, z: 0.20, phase: 0.25 },
    { name: "BL", x: -0.58, z: -0.21, phase: 0.52 },
    { name: "BR", x: -0.58, z: 0.21, phase: 0.77 }
  ];

  const upperLegGeo = new THREE.CylinderGeometry(0.095, 0.072, 0.56, 8);
  const lowerLegGeo = new THREE.CylinderGeometry(0.068, 0.052, 0.54, 8);
  const hoofGeo = new THREE.CylinderGeometry(0.065, 0.082, 0.11, 8);

  legConfigs.forEach(cfg => {
    const shoulder = new THREE.Group();
    shoulder.position.set(cfg.x, -0.10, cfg.z);
    bodyPivot.add(shoulder);

    const upperMesh = new THREE.Mesh(upperLegGeo, coatMat);
    upperMesh.position.set(0, -0.26, 0);
    upperMesh.castShadow = true;
    shoulder.add(upperMesh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.52, 0);
    shoulder.add(knee);

    const lowerMesh = new THREE.Mesh(lowerLegGeo, sockMat);
    lowerMesh.position.set(0, -0.25, 0);
    lowerMesh.castShadow = true;
    knee.add(lowerMesh);

    const hoofMesh = new THREE.Mesh(hoofGeo, hoofMat);
    hoofMesh.position.set(0.02, -0.52, 0);
    knee.add(hoofMesh);

    legs.push({
      name: cfg.name,
      isFront: cfg.x > 0,
      phase: cfg.phase,
      shoulder,
      knee
    });
  });

  // 5. Jockey Assembly crouched in racing stance
  const jockeyPivot = new THREE.Group();
  jockeyPivot.position.set(0.06, 0.44, 0);
  bodyPivot.add(jockeyPivot);

  // Jockey torso leaning forward
  const jTorsoPivot = new THREE.Group();
  jTorsoPivot.rotation.z = -0.78;
  jockeyPivot.add(jTorsoPivot);

  const jTorsoGeo = new THREE.CapsuleGeometry(0.16, 0.34, 6, 10);
  const jTorso = new THREE.Mesh(jTorsoGeo, silkMat);
  jTorso.position.set(0, 0.26, 0);
  jTorso.castShadow = true;
  jTorsoPivot.add(jTorso);

  // Jockey head & silk helmet
  const jHeadGroup = new THREE.Group();
  jHeadGroup.position.set(0.06, 0.56, 0);
  jHeadGroup.rotation.z = 0.65;
  jTorsoPivot.add(jHeadGroup);

  const jFace = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), skinMat);
  jHeadGroup.add(jFace);

  const helmetGeo = new THREE.SphereGeometry(0.13, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65);
  const helmet = new THREE.Mesh(helmetGeo, silkMat);
  helmet.position.set(-0.01, 0.02, 0);
  helmet.castShadow = true;
  jHeadGroup.add(helmet);

  // Helmet visor peak
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.16), leatherMat);
  visor.position.set(0.11, 0.03, 0);
  jHeadGroup.add(visor);

  // Jockey arms reaching toward reins
  const armGeo = new THREE.CapsuleGeometry(0.048, 0.34, 4, 8);
  armGeo.rotateZ(Math.PI / 2);
  [-0.17, 0.17].forEach(zOff => {
    const arm = new THREE.Mesh(armGeo, silkMat);
    arm.position.set(0.22, 0.34, zOff);
    arm.rotation.z = -0.25;
    jTorsoPivot.add(arm);

    // Thighs & boots in stirrups
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.24, 4, 8), breechesMat);
    thigh.position.set(-0.04, -0.02, zOff * 1.35);
    thigh.rotation.z = 0.55;
    jockeyPivot.add(thigh);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.26, 8), leatherMat);
    boot.position.set(-0.12, -0.22, zOff * 1.45);
    boot.rotation.z = -0.35;
    jockeyPivot.add(boot);
  });

  // 6. 3D Golden Leader Crown (visible when currentLeader === index)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0.2, 2.55, 0);
  crownGroup.visible = false;
  root.add(crownGroup);

  const crownMat = new THREE.MeshStandardMaterial({
    color: "#ffd76a",
    emissive: "#ffb300",
    emissiveIntensity: 0.45,
    metalness: 0.85,
    roughness: 0.18
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

  // Convert simulation X coordinate into 3D metres
  const worldX = horseState.x * SIM_TO_M;
  actor.root.position.x = worldX;
  actor.root.position.z = LANES_Z[actor.index];

  // Speed ratio (typical sim speed is 80..210 px/s)
  const speedPx = isRacing && !isFallen ? clamp(modelState.momentum || horseState.speed || 115, 0, 230) : 0;
  const speedNorm = clamp(speedPx / 135, 0, 1.85);

  // Advance gait cycle phase proportional to real elapsed time and speed
  if (isRacing && !isFallen) {
    actor.gaitPhase += dt * (7.5 + speedNorm * 8.2);
  } else if (!isFallen) {
    // Idle breathing / pawing phase
    actor.gaitPhase += dt * 1.8;
  }

  const p = actor.gaitPhase;

  // Jump vertical elevation & body pitch kinematics
  let jumpY = 0;
  let targetPitch = 0;

  if (isJumpActive && !isFallen) {
    // Smooth parabolic trajectory over hedge
    const arc = Math.sin(jumpT * Math.PI);
    jumpY = arc * (JUMP_H * 0.082); // ~1.8m peak height in 3D
    // Pitch nose up on takeoff (+0.48 rad), level at apex, pitch nose down on landing (-0.38 rad)
    targetPitch = Math.cos(jumpT * Math.PI) * 0.44;
  } else if (isRacing && !isFallen) {
    // Gallop suspension bounce & subtle rocking pitch
    jumpY = Math.abs(Math.sin(p)) * 0.14 * clamp(speedNorm, 0.4, 1.4);
    targetPitch = Math.cos(p) * 0.09 * clamp(speedNorm, 0.4, 1.3);
  } else if (!isFallen) {
    // Idle breathing bob
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

    // Neck and Jockey rhythm
    if (isRacing) {
      const neckSwing = Math.sin(p - 0.6) * 0.18 * clamp(speedNorm, 0.5, 1.4);
      actor.neckPivot.rotation.z = -0.58 + neckSwing - (modelState.boostT > 0 ? 0.12 : 0);
      actor.headPivot.rotation.z = 0.45 - neckSwing * 0.6;
      actor.jockeyPivot.position.y = 0.44 + Math.sin(p * 2) * 0.04;
      actor.jTorsoPivot.rotation.z = -0.78 - (modelState.boostT > 0 ? 0.20 : 0) + Math.sin(p) * 0.07;
    } else {
      actor.neckPivot.rotation.z = -0.54 + Math.sin(p) * 0.05;
      actor.headPivot.rotation.z = 0.42 + Math.cos(p * 0.7) * 0.05;
      actor.jTorsoPivot.rotation.z = -0.62;
    }
  }

  // Tail streaming in gallop + windForce lateral sway
  const tailSpeedLift = isRacing && !isFallen ? clamp(speedNorm * 0.55, 0, 0.75) : 0.05;
  actor.tailPivot.rotation.z = -0.65 + tailSpeedLift + Math.sin(p * 1.5) * 0.14;
  actor.tailPivot.rotation.x = clamp((windForce || 0) * 0.06, -0.35, 0.35) + Math.cos(p) * 0.06;

  // 4-Beat Articulated Leg Kinematics
  actor.legs.forEach(leg => {
    const legAnglePhase = p + leg.phase * Math.PI * 2;
    if (isJumpActive && !isFallen) {
      // Forelegs tuck forward and fold at the knee; hindlegs push back then tuck
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

      // Knee bends naturally during the recovery forward swing
      const bend = Math.max(0, Math.cos(legAnglePhase));
      leg.knee.rotation.z = leg.isFront ? -bend * 1.12 : bend * 0.95;
    } else if (isFallen) {
      leg.shoulder.rotation.z = leg.isFront ? 0.65 : -0.65;
      leg.knee.rotation.z = leg.isFront ? -1.1 : 0.9;
    } else {
      // Idle standing stance
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

  // Update overhead nameplate sprite
  actor.labelSprite.position.y = 2.95 + jumpY * 0.75;
  updateNameplateSprite(
    actor,
    horseState.name,
    actor.silkColor,
    showCrown,
    modelState.boostT > 0 && !isFallen,
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

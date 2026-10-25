import * as THREE from "three";

export type AnimState =
  | "idle"
  | "walk"
  | "run"
  | "sidestep"
  | "ready"
  | "bump"
  | "set"
  | "approach"
  | "serveUnder"
  | "serveJump"
  | "spike"
  | "block"
  | "dive"
  | "kneel"
  | "getup"
  | "celebrate"
  | "huddle"
  | "sit";

export interface CharacterOptions {
  skin: number;
  hair: number;
  jersey: number;
  shorts: number;
  sock: number;
  headband?: boolean;
  wristband?: boolean;
  kneepad?: boolean;
  number?: number;
}

const boxGeoCache = new Map<string, THREE.BoxGeometry>();
function box(w: number, h: number, d: number) {
  const key = `${w}_${h}_${d}`;
  let g = boxGeoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxGeoCache.set(key, g);
  }
  return g;
}

function mat(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

export interface CharacterParts {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
}

export function buildCharacter(opts: CharacterOptions): { group: THREE.Group; parts: CharacterParts } {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  const torso = new THREE.Mesh(box(0.46, 0.55, 0.26), mat(opts.jersey));
  torso.position.y = 0.33;
  torso.castShadow = true;
  hips.add(torso);

  // number on back (simple colored patch)
  const patch = new THREE.Mesh(box(0.22, 0.22, 0.02), mat(0xffffff));
  patch.position.set(0, 0.33, -0.14);
  torso.add(patch);

  const hipBlock = new THREE.Mesh(box(0.4, 0.22, 0.24), mat(opts.shorts));
  hipBlock.position.y = 0.0;
  hipBlock.castShadow = true;
  hips.add(hipBlock);

  // head group (neck pivot)
  const head = new THREE.Group();
  head.position.y = 0.62;
  hips.add(head);
  const headMesh = new THREE.Mesh(box(0.34, 0.32, 0.32), mat(opts.skin));
  headMesh.position.y = 0.16;
  headMesh.castShadow = true;
  head.add(headMesh);
  const hair = new THREE.Mesh(box(0.36, 0.14, 0.34), mat(opts.hair));
  hair.position.y = 0.3;
  head.add(hair);
  // face dot eyes
  const eyeGeo = box(0.045, 0.045, 0.02);
  const eyeMat = mat(0x201c14);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 0.17, 0.165);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;
  head.add(eyeR);
  if (opts.headband) {
    const band = new THREE.Mesh(box(0.37, 0.07, 0.35), mat(0xffffff));
    band.position.y = 0.24;
    head.add(band);
  }

  function buildArm(side: 1 | -1) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 0.52, 0);
    hips.add(shoulder);
    const upper = new THREE.Mesh(box(0.14, 0.28, 0.14), mat(opts.skin));
    upper.position.y = -0.14;
    upper.castShadow = true;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    const lower = new THREE.Mesh(box(0.12, 0.26, 0.12), mat(opts.skin));
    lower.position.y = -0.13;
    lower.castShadow = true;
    elbow.add(lower);
    if (opts.wristband) {
      const wb = new THREE.Mesh(box(0.14, 0.05, 0.14), mat(0xffffff));
      wb.position.y = -0.24;
      elbow.add(wb);
    }
    const hand = new THREE.Mesh(box(0.11, 0.1, 0.11), mat(opts.skin));
    hand.position.y = -0.27;
    elbow.add(hand);
    return { shoulder, elbow };
  }

  function buildLeg(side: 1 | -1) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, -0.11, 0);
    hips.add(hip);
    const upper = new THREE.Mesh(box(0.16, 0.3, 0.16), mat(opts.shorts));
    upper.position.y = -0.15;
    upper.castShadow = true;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.3;
    hip.add(knee);
    const lower = new THREE.Mesh(box(0.14, 0.28, 0.14), mat(opts.sock));
    lower.position.y = -0.14;
    lower.castShadow = true;
    knee.add(lower);
    if (opts.kneepad) {
      const kp = new THREE.Mesh(box(0.16, 0.08, 0.16), mat(0xe8e4d8));
      kp.position.y = -0.03;
      knee.add(kp);
    }
    const shoe = new THREE.Mesh(box(0.16, 0.09, 0.22), mat(0x201c18));
    shoe.position.set(0, -0.3, 0.03);
    shoe.castShadow = true;
    knee.add(shoe);
    return { hip, knee };
  }

  const armL = buildArm(-1);
  const armR = buildArm(1);
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  const parts: CharacterParts = {
    root,
    hips,
    torso,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
  };

  return { group: root, parts };
}

// --- Procedural animation controller -------------------------------------

export class CharacterAnimator {
  parts: CharacterParts;
  state: AnimState = "idle";
  prevState: AnimState = "idle";
  phase = 0;
  blend = 0; // 0..1 transition progress
  actionTimer = 0;
  speedFactor = 0; // 0..1 locomotion intensity
  baseHipY: number;

  constructor(parts: CharacterParts) {
    this.parts = parts;
    this.baseHipY = parts.hips.position.y;
  }

  setState(state: AnimState) {
    if (this.state !== state) {
      this.prevState = this.state;
      this.state = state;
      this.phase = 0;
      this.blend = 0;
      this.actionTimer = 0;
    }
  }

  update(dt: number, speed01: number) {
    this.phase += dt;
    this.actionTimer += dt;
    this.speedFactor = THREE.MathUtils.damp(this.speedFactor, speed01, 6, dt);
    const p = this.parts;
    const t = this.phase;

    // reset to neutral each frame then layer pose
    p.shoulderL.rotation.set(0, 0, 0);
    p.shoulderR.rotation.set(0, 0, 0);
    p.elbowL.rotation.set(0, 0, 0);
    p.elbowR.rotation.set(0, 0, 0);
    p.hipL.rotation.set(0, 0, 0);
    p.hipR.rotation.set(0, 0, 0);
    p.kneeL.rotation.set(0, 0, 0);
    p.kneeR.rotation.set(0, 0, 0);
    p.torso.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
    p.hips.position.y = this.baseHipY;
    p.hips.rotation.set(0, 0, 0);

    switch (this.state) {
      case "idle": {
        const breathe = Math.sin(t * 1.6) * 0.02;
        p.hips.position.y = this.baseHipY + breathe * 0.3;
        p.shoulderL.rotation.z = 0.08 + Math.sin(t * 1.4) * 0.02;
        p.shoulderR.rotation.z = -0.08 - Math.sin(t * 1.4) * 0.02;
        p.torso.rotation.y = Math.sin(t * 0.8) * 0.03;
        break;
      }
      case "walk":
      case "run": {
        const speedMul = this.state === "run" ? 1.9 : 1.1;
        const freq = (2.2 + this.speedFactor * 1.5) * speedMul;
        const swing = (this.state === "run" ? 0.9 : 0.55) * (0.4 + this.speedFactor * 0.6);
        const s = Math.sin(t * freq);
        const c = Math.cos(t * freq);
        p.hipL.rotation.x = s * swing;
        p.hipR.rotation.x = -s * swing;
        p.kneeL.rotation.x = Math.max(0, -s * swing * 1.4) + 0.15;
        p.kneeR.rotation.x = Math.max(0, s * swing * 1.4) + 0.15;
        p.shoulderL.rotation.x = -s * swing * 0.8;
        p.shoulderR.rotation.x = s * swing * 0.8;
        p.elbowL.rotation.x = 0.4;
        p.elbowR.rotation.x = 0.4;
        p.hips.position.y = this.baseHipY + Math.abs(c) * 0.035 * (0.5 + this.speedFactor);
        p.torso.rotation.z = s * 0.03;
        break;
      }
      case "sidestep": {
        const freq = 6.5;
        const s = Math.sin(t * freq);
        p.hipL.rotation.z = s * 0.3;
        p.hipR.rotation.z = -s * 0.3;
        p.kneeL.rotation.x = 0.35 + Math.abs(s) * 0.15;
        p.kneeR.rotation.x = 0.35 + Math.abs(s) * 0.15;
        p.shoulderL.rotation.z = 0.5;
        p.shoulderR.rotation.z = -0.5;
        p.hips.position.y = this.baseHipY - 0.04;
        break;
      }
      case "ready": {
        p.hipL.rotation.x = 0.25;
        p.hipR.rotation.x = 0.25;
        p.kneeL.rotation.x = 0.5;
        p.kneeR.rotation.x = 0.5;
        p.shoulderL.rotation.x = -0.9;
        p.shoulderR.rotation.x = -0.9;
        p.shoulderL.rotation.z = 0.25;
        p.shoulderR.rotation.z = -0.25;
        p.elbowL.rotation.x = 0.5;
        p.elbowR.rotation.x = 0.5;
        p.hips.position.y = this.baseHipY - 0.12;
        p.torso.rotation.x = 0.08;
        break;
      }
      case "bump": {
        const k = Math.min(1, this.actionTimer / 0.22);
        const swing = Math.sin(Math.min(k, 1) * Math.PI) * 1.1;
        p.hipL.rotation.x = 0.3 - k * 0.2;
        p.hipR.rotation.x = 0.3 - k * 0.2;
        p.kneeL.rotation.x = 0.45;
        p.kneeR.rotation.x = 0.45;
        p.shoulderL.rotation.x = -1.3 + swing * 0.5;
        p.shoulderR.rotation.x = -1.3 + swing * 0.5;
        p.shoulderL.rotation.z = 0.12;
        p.shoulderR.rotation.z = -0.12;
        p.elbowL.rotation.x = 0.1;
        p.elbowR.rotation.x = 0.1;
        p.torso.rotation.x = -0.25 + k * 0.25;
        p.hips.position.y = this.baseHipY - 0.08 + k * 0.08;
        break;
      }
      case "set": {
        const k = Math.min(1, this.actionTimer / 0.26);
        const ext = Math.sin(Math.min(k, 1) * Math.PI);
        p.hipL.rotation.x = 0.15 - k * 0.1;
        p.hipR.rotation.x = 0.15 - k * 0.1;
        p.kneeL.rotation.x = 0.3 - ext * 0.15;
        p.kneeR.rotation.x = 0.3 - ext * 0.15;
        p.shoulderL.rotation.x = -2.3 + ext * 0.3;
        p.shoulderR.rotation.x = -2.3 + ext * 0.3;
        p.elbowL.rotation.x = 0.3 + ext * 0.3;
        p.elbowR.rotation.x = 0.3 + ext * 0.3;
        p.torso.rotation.x = -0.1 - ext * 0.1;
        p.hips.position.y = this.baseHipY + ext * 0.12;
        break;
      }
      case "approach": {
        const freq = 8;
        const s = Math.sin(t * freq);
        p.hipL.rotation.x = s * 0.7;
        p.hipR.rotation.x = -s * 0.7;
        p.kneeL.rotation.x = Math.max(0, -s) * 0.9 + 0.1;
        p.kneeR.rotation.x = Math.max(0, s) * 0.9 + 0.1;
        p.shoulderL.rotation.x = -s * 0.9 - 0.4;
        p.shoulderR.rotation.x = s * 0.9 - 0.4;
        p.torso.rotation.x = 0.15;
        break;
      }
      case "serveUnder": {
        const k = Math.min(1, this.actionTimer / 0.3);
        const swing = Math.sin(Math.min(k, 1) * Math.PI);
        p.shoulderR.rotation.x = -1.6 + swing * 2.0;
        p.shoulderL.rotation.x = -0.4;
        p.hipR.rotation.x = 0.2 - k * 0.2;
        p.hipL.rotation.x = 0.1;
        p.torso.rotation.x = 0.1 - swing * 0.2;
        break;
      }
      case "serveJump": {
        const k = Math.min(1, this.actionTimer / 0.5);
        const jump = Math.sin(Math.min(k, 1) * Math.PI);
        p.hips.position.y = this.baseHipY + jump * 0.55;
        p.shoulderR.rotation.x = -2.6 + jump * 1.6;
        p.shoulderL.rotation.x = -1.6 + jump * 0.6;
        p.kneeL.rotation.x = 0.3 - jump * 0.3;
        p.kneeR.rotation.x = 0.3 - jump * 0.3;
        p.torso.rotation.x = -0.15 + jump * 0.1;
        break;
      }
      case "spike": {
        const k = Math.min(1, this.actionTimer / 0.45);
        const jump = Math.sin(Math.min(k, 1) * Math.PI);
        p.hips.position.y = this.baseHipY + jump * 0.7;
        const swingPhase = Math.min(1, (this.actionTimer - 0.18) / 0.15);
        const swing = swingPhase > 0 ? Math.sin(Math.min(swingPhase, 1) * Math.PI) : 0;
        p.shoulderR.rotation.x = -2.8 + swing * 3.2;
        p.shoulderR.rotation.z = -0.3;
        p.shoulderL.rotation.x = -1.8 + jump * 0.5;
        p.elbowR.rotation.x = 0.2 + swing * 0.6;
        p.kneeL.rotation.x = 0.4 - jump * 0.4;
        p.kneeR.rotation.x = 0.4 - jump * 0.4;
        p.torso.rotation.x = -0.2 + swing * 0.45;
        p.torso.rotation.y = -swing * 0.2;
        break;
      }
      case "block": {
        const k = Math.min(1, this.actionTimer / 0.35);
        const jump = Math.sin(Math.min(k, 1) * Math.PI);
        p.hips.position.y = this.baseHipY + jump * 0.45;
        p.shoulderL.rotation.x = -2.7;
        p.shoulderR.rotation.x = -2.7;
        p.shoulderL.rotation.z = 0.15;
        p.shoulderR.rotation.z = -0.15;
        p.elbowL.rotation.x = 0.1;
        p.elbowR.rotation.x = 0.1;
        p.kneeL.rotation.x = 0.35 - jump * 0.35;
        p.kneeR.rotation.x = 0.35 - jump * 0.35;
        break;
      }
      case "dive": {
        const k = Math.min(1, this.actionTimer / 0.5);
        const fall = Math.min(1, k * 1.6);
        p.hips.position.y = this.baseHipY - fall * 0.6;
        p.torso.rotation.x = -fall * 1.1;
        p.shoulderL.rotation.x = -1.4 - fall * 0.6;
        p.shoulderR.rotation.x = -1.4 - fall * 0.6;
        p.hipL.rotation.x = -fall * 0.5;
        p.hipR.rotation.x = -fall * 0.5;
        p.kneeL.rotation.x = fall * 0.6;
        p.kneeR.rotation.x = fall * 0.6;
        break;
      }
      case "kneel": {
        p.hips.position.y = this.baseHipY - 0.4;
        p.hipL.rotation.x = 1.3;
        p.hipR.rotation.x = 0.3;
        p.kneeL.rotation.x = 1.6;
        p.kneeR.rotation.x = 0.4;
        p.torso.rotation.x = 0.2;
        break;
      }
      case "getup": {
        const k = Math.min(1, this.actionTimer / 0.5);
        p.hips.position.y = this.baseHipY - 0.4 * (1 - k);
        p.hipL.rotation.x = 1.3 * (1 - k);
        p.kneeL.rotation.x = 1.6 * (1 - k);
        p.torso.rotation.x = 0.2 * (1 - k);
        break;
      }
      case "celebrate": {
        const bounce = Math.abs(Math.sin(t * 7));
        p.hips.position.y = this.baseHipY + bounce * 0.2;
        p.shoulderL.rotation.x = -2.6;
        p.shoulderR.rotation.x = -2.6;
        p.shoulderL.rotation.z = 0.3 + Math.sin(t * 7) * 0.1;
        p.shoulderR.rotation.z = -0.3 - Math.sin(t * 7) * 0.1;
        p.kneeL.rotation.x = bounce * 0.3;
        p.kneeR.rotation.x = bounce * 0.3;
        break;
      }
      case "huddle": {
        p.shoulderL.rotation.x = -0.6;
        p.shoulderR.rotation.x = -0.6;
        p.shoulderL.rotation.z = 0.5;
        p.shoulderR.rotation.z = -0.5;
        p.torso.rotation.x = 0.15;
        p.head.rotation.x = 0.2;
        break;
      }
      case "sit": {
        p.hips.position.y = this.baseHipY - 0.45;
        p.hipL.rotation.x = 1.5;
        p.hipR.rotation.x = 1.5;
        p.kneeL.rotation.x = -1.5;
        p.kneeR.rotation.x = -1.5;
        p.shoulderL.rotation.x = -0.2 + Math.sin(t * 1.2) * 0.05;
        p.shoulderR.rotation.x = -0.2 - Math.sin(t * 1.2) * 0.05;
        break;
      }
    }
  }
}

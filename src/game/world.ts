import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Rng } from "./rng";
import { COURT } from "./constants";
import {
  makeCourtTexture,
  makeWallTexture,
  makeWindowTexture,
  makeNetTexture,
  makeGrassTexture,
  makeNoticeboardTexture,
} from "./textures";
import { buildCharacter, CharacterAnimator } from "./character";
import type { Season } from "./constants";

export interface SpectatorEntry {
  group: THREE.Group;
  animator: CharacterAnimator;
  kind: "sit" | "walk" | "stand";
  walkT?: number;
  waypoints?: THREE.Vector3[];
}

export interface WorldRefs {
  scene: THREE.Scene;
  netMesh: THREE.Mesh;
  windowMats: THREE.MeshBasicMaterial[];
  foliageMeshes: THREE.Mesh[];
  lamps: THREE.PointLight[];
  entranceLight: THREE.PointLight;
  spectators: SpectatorEntry[];
  dog: { group: THREE.Group; tail: THREE.Mesh };
  groundTop: THREE.Mesh;
  restingBall: THREE.Group;
  setSeason: (s: Season) => void;
  setNight: (isNight: boolean) => void;
  update: (dt: number, elapsed: number) => void;
}

function lambert(color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export function buildCampusWorld(scene: THREE.Scene, rng: Rng, season: Season): WorldRefs {
  const foliageMeshes: THREE.Mesh[] = [];
  const windowMats: THREE.MeshBasicMaterial[] = [];
  const lamps: THREE.PointLight[] = [];

  // ---------- Floating island ground slab ----------
  const islandGroup = new THREE.Group();
  scene.add(islandGroup);

  const topW = COURT.halfWidth * 2 + 14;
  const topL = COURT.halfLength * 2 + 16;
  const grassTex = makeGrassTexture(rng, season);
  grassTex.repeat.set(topW / 4, topL / 4);
  const groundTop = new THREE.Mesh(
    new THREE.BoxGeometry(topW, 1, topL),
    lambert(0xffffff, { map: grassTex })
  );
  groundTop.position.y = -0.5;
  groundTop.receiveShadow = true;
  islandGroup.add(groundTop);

  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(topW, topL) * 0.42, Math.max(topW, topL) * 0.3, 2.4, 8, 1),
    lambert(0x6b4a30)
  );
  soil.position.y = -2.1;
  soil.rotation.y = Math.PI / 8;
  islandGroup.add(soil);

  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(topW, topL) * 0.3, 3.2, 7, 1),
    lambert(0x6f695f)
  );
  rock.position.y = -4.6;
  rock.rotation.y = Math.PI / 5;
  islandGroup.add(rock);

  // concrete walkway ring around court
  const walkway = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.halfWidth * 2 + 4, 0.12, COURT.halfLength * 2 + 4),
    lambert(0x8f897c)
  );
  walkway.position.y = 0.0;
  walkway.receiveShadow = true;
  islandGroup.add(walkway);

  // ---------- Court ----------
  const courtTex = makeCourtTexture(rng);
  const court = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.halfWidth * 2 + 1.2, 0.08, COURT.halfLength * 2 + 1.2),
    lambert(0xffffff, { map: courtTex })
  );
  court.position.y = 0.05;
  court.receiveShadow = true;
  islandGroup.add(court);

  // ---------- Net ----------
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, COURT.netHeight + 0.5, 8);
  const poleMat = lambert(0x3c3934);
  const poleL = new THREE.Mesh(poleGeo, poleMat);
  poleL.position.set(-COURT.poleX, (COURT.netHeight + 0.5) / 2, 0);
  poleL.castShadow = true;
  islandGroup.add(poleL);
  const poleR = poleL.clone();
  poleR.position.x = COURT.poleX;
  islandGroup.add(poleR);

  const netTex = makeNetTexture();
  netTex.repeat.set((COURT.poleX * 2) / 2, 1);
  const netWidth = COURT.poleX * 2 - 0.3;
  const netMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(netWidth, COURT.netHeight),
    new THREE.MeshLambertMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05 })
  );
  netMesh.position.set(0, COURT.netHeight / 2, 0);
  islandGroup.add(netMesh);

  // tension cables
  const cableMat = lambert(0x1a1a1a);
  for (const sign of [-1, 1]) {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4),
      cableMat
    );
    cable.position.set(sign * (COURT.poleX - 0.3), COURT.netHeight + 0.2, 0);
    cable.rotation.z = Math.PI / 2;
    islandGroup.add(cable);
  }

  // ---------- Hostel building ----------
  const hostelGroup = new THREE.Group();
  hostelGroup.position.set(0, 0, -COURT.halfLength - 10);
  islandGroup.add(hostelGroup);

  const wallTex = makeWallTexture(rng);
  wallTex.repeat.set(4, 2);
  const floors = 4;
  const floorH = 2.6;
  const buildingW = 20;
  const buildingD = 6;
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(buildingW, floorH * floors, buildingD),
    lambert(0xffffff, { map: wallTex })
  );
  building.position.y = (floorH * floors) / 2;
  building.castShadow = true;
  building.receiveShadow = true;
  hostelGroup.add(building);

  // windows + balconies (merged geometry for perf)
  const balconyGeoms: THREE.BufferGeometry[] = [];
  const winsPerFloor = 7;
  const litWindowSet = new Set<number>();
  for (let i = 0; i < floors * winsPerFloor; i++) {
    if (rng.next() > 0.55) litWindowSet.add(i);
  }
  let winIdx = 0;
  for (let f = 0; f < floors; f++) {
    for (let w = 0; w < winsPerFloor; w++) {
      const x = -buildingW / 2 + (buildingW / winsPerFloor) * (w + 0.5);
      const y = floorH * f + floorH * 0.55;
      const lit = litWindowSet.has(winIdx);
      winIdx++;
      const winTex = makeWindowTexture(lit);
      const winMat = new THREE.MeshBasicMaterial({ map: winTex });
      windowMats.push(winMat);
      const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), winMat);
      winMesh.position.set(x, y, buildingD / 2 + 0.02);
      hostelGroup.add(winMesh);

      if (f > 0) {
        const g = new THREE.BoxGeometry(1.8, 0.1, 0.6);
        g.translate(x, floorH * f - 0.05, buildingD / 2 + 0.3);
        balconyGeoms.push(g);
        const rail = new THREE.BoxGeometry(1.8, 0.5, 0.05);
        rail.translate(x, floorH * f + 0.2, buildingD / 2 + 0.58);
        balconyGeoms.push(rail);
      }
    }
  }
  if (balconyGeoms.length) {
    const merged = mergeGeometries(balconyGeoms, false);
    const balconyMesh = new THREE.Mesh(merged, lambert(0xb4aea0));
    balconyMesh.castShadow = true;
    hostelGroup.add(balconyMesh);
  }

  // entrance
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, buildingD / 2 + 0.05);
  hostelGroup.add(doorGroup);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.1), lambert(0x5a4328));
  door.position.y = 1.1;
  doorGroup.add(door);
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), lambert(0xcac2b2));
    col.position.set(sx * 1.2, 1.3, 0.2);
    doorGroup.add(col);
  }
  const entranceLight = new THREE.PointLight(0xffd27a, 0, 6, 2);
  entranceLight.position.set(0, 2.4, buildingD / 2 + 1.2);
  hostelGroup.add(entranceLight);
  const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdf8a }));
  lampMesh.position.copy(entranceLight.position);
  hostelGroup.add(lampMesh);

  // noticeboard
  const noticeTex = makeNoticeboardTexture();
  const notice = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.0),
    new THREE.MeshLambertMaterial({ map: noticeTex })
  );
  notice.position.set(3.2, 1.1, buildingD / 2 + 0.06);
  hostelGroup.add(notice);

  // rooftop water tanks
  for (let i = 0; i < 2; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10),
      lambert(0x7a9aa8)
    );
    tank.position.set(-5 + i * 10, floorH * floors + 0.7, 0);
    tank.castShadow = true;
    hostelGroup.add(tank);
  }

  // ---------- Trees ----------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.8, 6);
  const foliageColor = () =>
    season === "summer" ? [0x3c7a42, 0x4f9a52, 0x2e5e36] : season === "autumn" ? [0xb3792a, 0xd4972f, 0xe9b94a] : [0x587a3a, 0x3a5a2a, 0x4f6a3f];
  const treePositions: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const side = rng.next() > 0.5 ? 1 : -1;
    const x = side * rng.range(COURT.halfWidth + 3.5, COURT.halfWidth + 8.5);
    const z = rng.range(-COURT.halfLength - 7, COURT.halfLength + 2);
    treePositions.push([x, z]);
  }
  for (const [x, z] of treePositions) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);
    const trunk = new THREE.Mesh(trunkGeo, lambert(0x5a4328));
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    treeGroup.add(trunk);
    const colors = foliageColor();
    const foliageGeoms: THREE.BufferGeometry[][] = [[], [], []];
    for (let c = 0; c < 3; c++) {
      const geo = new THREE.IcosahedronGeometry(0.75 - c * 0.08, 0);
      geo.translate(rng.range(-0.3, 0.3), 1.9 + c * 0.45, rng.range(-0.3, 0.3));
      foliageGeoms[c % colors.length].push(geo);
    }
    colors.forEach((col, ci) => {
      if (!foliageGeoms[ci].length) return;
      const merged = mergeGeometries(foliageGeoms[ci], false);
      const mesh = new THREE.Mesh(merged, lambert(col));
      mesh.castShadow = true;
      treeGroup.add(mesh);
      foliageMeshes.push(mesh);
    });
    islandGroup.add(treeGroup);
  }

  // hedges along walkway
  const hedgeGeoms: THREE.BufferGeometry[] = [];
  for (let i = -3; i <= 3; i++) {
    const g = new THREE.BoxGeometry(1.4, 0.5, 0.5);
    g.translate(i * 1.5, 0.25, -COURT.halfLength - 2.2);
    hedgeGeoms.push(g);
  }
  const hedgeMesh = new THREE.Mesh(mergeGeometries(hedgeGeoms, false), lambert(0x3c7a42));
  hedgeMesh.castShadow = true;
  islandGroup.add(hedgeMesh);
  foliageMeshes.push(hedgeMesh);

  // ---------- Benches + spectators ----------
  const spectators: SpectatorEntry[] = [];
  function buildBench(x: number, z: number, rotY: number) {
    const bg = new THREE.Group();
    bg.position.set(x, 0, z);
    bg.rotation.y = rotY;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), lambert(0x8a6a3f));
    seat.position.y = 0.45;
    seat.castShadow = true;
    bg.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), lambert(0x8a6a3f));
    back.position.set(0, 0.7, -0.21);
    bg.add(back);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.45), lambert(0x3c3934));
      leg.position.set(sx, 0.22, 0);
      bg.add(leg);
    }
    islandGroup.add(bg);
    return bg;
  }

  const benchSpots: [number, number, number][] = [
    [-COURT.halfWidth - 3, -2, Math.PI / 2],
    [-COURT.halfWidth - 3, 2.5, Math.PI / 2],
    [COURT.halfWidth + 3, 0, -Math.PI / 2],
  ];
  const skinTones = [0xf2c49b, 0xdba06f, 0xb87b4d, 0x8c5a35];
  const hairTones = [0x201c14, 0x3a2a1a, 0x1a1a1a, 0x4a3524];
  const casualShirts = [0x3a7fc1, 0xe9b94a, 0x7a4a8a, 0x4f9a52, 0xc0362c];

  benchSpots.forEach(([x, z, rot], i) => {
    buildBench(x, z, rot);
    const seatsOnBench = i === 2 ? 1 : 2;
    for (let s = 0; s < seatsOnBench; s++) {
      const { group, parts } = buildCharacter({
        skin: rng.pick(skinTones),
        hair: rng.pick(hairTones),
        jersey: rng.pick(casualShirts),
        shorts: 0x3c3934,
        sock: 0xe8e4d8,
      });
      group.scale.setScalar(0.92);
      const offset = seatsOnBench === 2 ? (s === 0 ? -0.4 : 0.4) : 0;
      const dir = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      const perp = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
      const pos = new THREE.Vector3(x, 0, z).addScaledVector(perp, offset).addScaledVector(dir, 0.25);
      group.position.copy(pos);
      group.rotation.y = rot + Math.PI;
      islandGroup.add(group);
      const animator = new CharacterAnimator(parts);
      animator.setState("sit");
      spectators.push({ group, animator, kind: "sit" });
    }
  });

  // one walking student on a loop path
  {
    const { group, parts } = buildCharacter({
      skin: rng.pick(skinTones),
      hair: rng.pick(hairTones),
      jersey: rng.pick(casualShirts),
      shorts: 0x565249,
      sock: 0xe8e4d8,
    });
    islandGroup.add(group);
    const animator = new CharacterAnimator(parts);
    animator.setState("walk");
    const waypoints = [
      new THREE.Vector3(-COURT.halfWidth - 6, 0, -COURT.halfLength - 6),
      new THREE.Vector3(COURT.halfWidth + 6, 0, -COURT.halfLength - 6),
      new THREE.Vector3(COURT.halfWidth + 6, 0, -COURT.halfLength - 9),
      new THREE.Vector3(-COURT.halfWidth - 6, 0, -COURT.halfLength - 9),
    ];
    group.position.copy(waypoints[0]);
    spectators.push({ group, animator, kind: "walk", walkT: 0, waypoints });
  }

  // ---------- Dog ----------
  const dogGroup = new THREE.Group();
  dogGroup.position.set(-COURT.halfWidth - 2.6, 0, -1.2);
  const dogBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), lambert(0xa68a5c));
  dogBody.position.y = 0.25;
  dogGroup.add(dogBody);
  const dogHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), lambert(0xa68a5c));
  dogHead.position.set(0.35, 0.3, 0);
  dogGroup.add(dogHead);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), lambert(0x8a7f6a));
  tail.position.set(-0.32, 0.3, 0);
  tail.geometry.translate(0, 0, -0.15);
  dogGroup.add(tail);
  for (const [sx, sz] of [
    [0.2, 0.12],
    [0.2, -0.12],
    [-0.2, 0.12],
    [-0.2, -0.12],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), lambert(0x7a6243));
    leg.position.set(sx, 0.1, sz);
    dogGroup.add(leg);
  }
  islandGroup.add(dogGroup);

  // ---------- Bicycles + scooter ----------
  function buildBicycle(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const wheelGeo = new THREE.TorusGeometry(0.33, 0.035, 6, 14);
    const wheelMat = lambert(0x1a1a1a);
    const wF = new THREE.Mesh(wheelGeo, wheelMat);
    wF.rotation.y = Math.PI / 2;
    wF.position.set(0.55, 0.33, 0);
    g.add(wF);
    const wB = wF.clone();
    wB.position.x = -0.55;
    g.add(wB);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), lambert(0x3a7fc1));
    frame.position.y = 0.5;
    g.add(frame);
    const seatPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), lambert(0x3c3934));
    seatPost.position.set(-0.4, 0.68, 0);
    g.add(seatPost);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), lambert(0x3c3934));
    handle.position.set(0.55, 0.62, 0);
    g.add(handle);
    islandGroup.add(g);
  }
  buildBicycle(COURT.halfWidth + 4.5, -COURT.halfLength + 1, Math.PI / 2 + 0.2);
  buildBicycle(COURT.halfWidth + 4.9, -COURT.halfLength + 1.8, Math.PI / 2 - 0.1);

  function buildScooter(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.4), lambert(0xe2493b));
    body.position.y = 0.45;
    g.add(body);
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10);
    const wF = new THREE.Mesh(wheelGeo, lambert(0x1a1a1a));
    wF.rotation.z = Math.PI / 2;
    wF.position.set(0.55, 0.28, 0);
    g.add(wF);
    const wB = wF.clone();
    wB.position.x = -0.55;
    g.add(wB);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.35), lambert(0x3c3934));
    handle.position.set(0.6, 0.7, 0);
    g.add(handle);
    islandGroup.add(g);
  }
  buildScooter(COURT.halfWidth + 4.5, -COURT.halfLength + 3, Math.PI / 2);

  // ---------- Streetlights ----------
  const lampPositions: [number, number][] = [
    [-COURT.halfWidth - 2.5, -4],
    [COURT.halfWidth + 2.5, -4],
    [-COURT.halfWidth - 2.5, 4],
    [COURT.halfWidth + 2.5, 4],
  ];
  for (const [x, z] of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), lambert(0x3c3934));
    pole.position.set(x, 1.7, z);
    pole.castShadow = true;
    islandGroup.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), lambert(0x3c3934));
    arm.position.set(x - Math.sign(x) * 0.3, 3.35, z);
    islandGroup.add(arm);
    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.22), lambert(0x1a1a1a));
    lampHead.position.set(x - Math.sign(x) * 0.58, 3.3, z);
    islandGroup.add(lampHead);
    const light = new THREE.PointLight(0xfff0c8, 0, 9, 2);
    light.position.set(x - Math.sign(x) * 0.58, 3.2, z);
    islandGroup.add(light);
    lamps.push(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
    bulb.position.copy(light.position);
    islandGroup.add(bulb);
  }

  // ---------- Resting ball placeholder (shown between rallies near court) ----------
  const restingBall = new THREE.Group();
  restingBall.position.set(COURT.halfWidth + 1.2, 0.21, COURT.halfLength + 1.5);
  islandGroup.add(restingBall);

  // ---------- leaves particles ----------
  const leafCount = 40;
  const leafGeo = new THREE.PlaneGeometry(0.1, 0.1);
  const leafMeshes: THREE.Mesh[] = [];
  const leafMat = lambert(0xd4972f, { side: THREE.DoubleSide });
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(rng.range(-14, 14), rng.range(0.5, 6), rng.range(-18, 10));
    leaf.userData.speed = rng.range(0.2, 0.6);
    leaf.userData.sway = rng.range(0.5, 1.5);
    leaf.userData.seed = rng.range(0, 100);
    islandGroup.add(leaf);
    leafMeshes.push(leaf);
  }

  function setSeason(_s: Season) {
    // Lightweight: season primarily affects new texture gen at build time; live palette swap for foliage:
  }

  function setNight(isNight: boolean) {
    entranceLight.intensity = isNight ? 2.2 : 0;
    lamps.forEach((l) => (l.intensity = isNight ? 1.6 : 0));
  }

  function update(dt: number, elapsed: number) {
    for (const leaf of leafMeshes) {
      leaf.position.y -= leaf.userData.speed * dt;
      leaf.position.x += Math.sin(elapsed * leaf.userData.sway + leaf.userData.seed) * dt * 0.3;
      if (leaf.position.y < 0.05) leaf.position.y = 6;
      leaf.rotation.z += dt * 0.6;
    }
    // tail wag
    tail.rotation.y = Math.sin(elapsed * 4) * 0.4;

    for (const spec of spectators) {
      if (spec.kind === "walk" && spec.waypoints) {
        spec.walkT = (spec.walkT ?? 0) + dt * 0.5;
        const path = spec.waypoints;
        const total = path.length;
        const f = spec.walkT % total;
        const i0 = Math.floor(f) % total;
        const i1 = (i0 + 1) % total;
        const localT = f - Math.floor(f);
        const p0 = path[i0];
        const p1 = path[i1];
        spec.group.position.lerpVectors(p0, p1, localT);
        const dir = new THREE.Vector3().subVectors(p1, p0);
        if (dir.lengthSq() > 0.0001) {
          spec.group.rotation.y = Math.atan2(dir.x, dir.z);
        }
      }
      spec.animator.update(dt, 0.6);
    }
  }

  return {
    scene,
    netMesh,
    windowMats,
    foliageMeshes,
    lamps,
    entranceLight,
    spectators,
    dog: { group: dogGroup, tail },
    groundTop,
    restingBall,
    setSeason,
    setNight,
    update,
  };
}

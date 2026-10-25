import * as THREE from "three";
import { COURT, PHYSICS } from "./constants";
import { makeBallTexture } from "./textures";

export type BallEvent =
  | { type: "ground"; x: number; z: number; inBounds: boolean }
  | { type: "net" }
  | { type: "net-top-cross" };

export class Ball {
  mesh: THREE.Mesh;
  velocity = new THREE.Vector3();
  angularVel = new THREE.Vector3(2, 3, 1);
  radius = PHYSICS.ballRadius;
  held = true; // true while resting/served position controlled externally
  lastToucherTeam: "RED" | "BLUE" | null = null;
  lastToucherSide: 1 | -1 | null = null; // -1 = red side (z<0), 1 = blue side
  grounded = false;

  constructor() {
    const geo = new THREE.SphereGeometry(this.radius, 14, 10);
    const tex = makeBallTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.position.set(0, 1.2, -5.2);
  }

  setPosition(x: number, y: number, z: number) {
    this.mesh.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  launch(target: THREE.Vector3, apexHeight: number, fromOverride?: THREE.Vector3) {
    const from = fromOverride ?? this.mesh.position;
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const dy = target.y - from.y;
    const g = Math.abs(PHYSICS.gravity);
    const h = Math.max(apexHeight, 0.3);
    // time to apex then to target using simple two-phase kinematics
    const vy0 = Math.sqrt(2 * g * h);
    const tUp = vy0 / g;
    const hRemain = h - dy;
    const tDown = Math.sqrt(Math.max(2 * Math.max(hRemain, 0.05) / g, 0.001));
    const tTotal = tUp + tDown;
    this.velocity.set(dx / tTotal, vy0, dz / tTotal);
  }

  step(dt: number, netX: number): BallEvent[] {
    const events: BallEvent[] = [];
    const sub = PHYSICS.substeps;
    const h = dt / sub;
    const pos = this.mesh.position;
    for (let i = 0; i < sub; i++) {
      const prevZ = pos.z;
      const prevY = pos.y;
      // integrate
      this.velocity.y += PHYSICS.gravity * h;
      const speed = this.velocity.length();
      if (speed > 0.001) {
        const drag = PHYSICS.airDrag * speed * h;
        const dragVec = this.velocity.clone().normalize().multiplyScalar(-drag);
        this.velocity.add(dragVec);
      }
      pos.addScaledVector(this.velocity, h);

      // net collision: crossing z=0 plane
      if ((prevZ < 0 && pos.z >= 0) || (prevZ > 0 && pos.z <= 0)) {
        const tFrac = Math.abs(prevZ) / (Math.abs(prevZ) + Math.abs(pos.z) + 1e-6);
        const crossY = THREE.MathUtils.lerp(prevY, pos.y, tFrac);
        const crossX = THREE.MathUtils.lerp(
          pos.x - this.velocity.x * h,
          pos.x,
          tFrac
        );
        const netTop = COURT.netHeight + COURT.netTopExtra;
        if (Math.abs(crossX) < netX && crossY < netTop) {
          // net hit: kill forward momentum, drop ball near net on the side it came from
          events.push({ type: "net" });
          pos.z = prevZ + (pos.z > prevZ ? -0.05 : 0.05);
          this.velocity.z *= -0.15;
          this.velocity.x *= 0.4;
          this.velocity.y = Math.min(this.velocity.y, -0.5);
        } else {
          events.push({ type: "net-top-cross" });
        }
      }

      // ground collision
      if (pos.y - this.radius <= 0.001 && this.velocity.y < 0) {
        pos.y = this.radius;
        const inBounds =
          Math.abs(pos.x) <= COURT.halfWidth && Math.abs(pos.z) <= COURT.halfLength;
        events.push({ type: "ground", x: pos.x, z: pos.z, inBounds });
        this.velocity.y *= -PHYSICS.restitution;
        this.velocity.x *= PHYSICS.groundFriction;
        this.velocity.z *= PHYSICS.groundFriction;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // visual spin
    const spinScale = 4;
    this.mesh.rotation.x += this.velocity.z * h * spinScale * sub;
    this.mesh.rotation.z -= this.velocity.x * h * spinScale * sub;

    return events;
  }

  predictLanding(maxTime = 3, stepT = 0.05): THREE.Vector3 {
    const pos = this.mesh.position.clone();
    const vel = this.velocity.clone();
    let t = 0;
    while (t < maxTime) {
      vel.y += PHYSICS.gravity * stepT;
      pos.addScaledVector(vel, stepT);
      if (pos.y <= this.radius) {
        pos.y = this.radius;
        return pos;
      }
      t += stepT;
    }
    return pos;
  }

  predictAtZ(targetZ: number, maxTime = 3, stepT = 0.03): { point: THREE.Vector3; time: number } | null {
    const pos = this.mesh.position.clone();
    const vel = this.velocity.clone();
    let t = 0;
    let prevZ = pos.z;
    while (t < maxTime) {
      vel.y += PHYSICS.gravity * stepT;
      pos.addScaledVector(vel, stepT);
      if ((prevZ <= targetZ && pos.z >= targetZ) || (prevZ >= targetZ && pos.z <= targetZ)) {
        return { point: pos.clone(), time: t };
      }
      if (pos.y <= 0) break;
      prevZ = pos.z;
      t += stepT;
    }
    return null;
  }
}

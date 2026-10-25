import * as THREE from "three";
import { COURT } from "./constants";
import { Rng } from "./rng";

// Pure helper functions used by the AI decision layer in Game.ts.
// Kept separate so the rally-reaction logic is easy to reason about independently
// from rendering / input / scoring code.

export function clampToCourtSide(x: number, z: number, sideSign: 1 | -1, margin = 0.3) {
  const cx = THREE.MathUtils.clamp(x, -COURT.halfWidth + margin, COURT.halfWidth - margin);
  let cz: number;
  if (sideSign < 0) {
    cz = THREE.MathUtils.clamp(z, -COURT.halfLength + margin, -margin);
  } else {
    cz = THREE.MathUtils.clamp(z, margin, COURT.halfLength - margin);
  }
  return new THREE.Vector2(cx, cz);
}

export function pickAttackTarget(sideSign: 1 | -1, rng: Rng, pressure: number): THREE.Vector3 {
  // Favor open court corners / deep zones; higher pressure -> sharper angles.
  const xZones = [-COURT.halfWidth + 0.8, 0, COURT.halfWidth - 0.8];
  const x = rng.pick(xZones) + rng.range(-0.6, 0.6) * (1 - pressure * 0.5);
  const depth = rng.range(1.0, COURT.halfLength - 0.8);
  const z = sideSign * depth;
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, -COURT.halfWidth + 0.4, COURT.halfWidth - 0.4),
    0,
    z
  );
}

export function formationPositions(sideSign: 1 | -1): THREE.Vector3[] {
  const netZ = 1.1 * sideSign;
  const backZ = (COURT.halfLength - 1.4) * sideSign;
  return [
    new THREE.Vector3(0, 0, backZ), // back-row all-rounder (often controlled player / server)
    new THREE.Vector3(-1.6 * sideSign, 0, netZ), // front setter
    new THREE.Vector3(2.0 * sideSign, 0, netZ * 0.9), // front hitter
  ];
}

export function servePositions(sideSign: 1 | -1): THREE.Vector3[] {
  const baseZ = (COURT.halfLength + 0.5) * sideSign;
  return [
    new THREE.Vector3(1.4 * sideSign, 0, baseZ),
    new THREE.Vector3(-1.6 * sideSign, 0, (COURT.halfLength - 1.6) * sideSign * 0.18 + 1.1 * sideSign),
    new THREE.Vector3(2.0 * sideSign, 0, 1.0 * sideSign),
  ];
}

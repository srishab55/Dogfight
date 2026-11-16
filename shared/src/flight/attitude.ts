import { rotateVec3, type Quat } from '../math/quat';
import { vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';

export interface Attitude {
  /** Compass heading of the nose, degrees clockwise from north (+Z), 0-360. */
  headingDeg: number;
  /** Nose elevation above the horizon, degrees (-90 to 90). */
  pitchDeg: number;
  /** Bank angle, degrees. Positive = right wing down. +/-180 = inverted. */
  bankDeg: number;
}

const forward = vec3();
const up = vec3();
const right = vec3();
const BODY_FORWARD: Vec3 = { x: 0, y: 0, z: 1 };
const BODY_UP: Vec3 = { x: 0, y: 1, z: 0 };
const BODY_RIGHT: Vec3 = { x: 1, y: 0, z: 0 };
const RAD_TO_DEG = 180 / Math.PI;

/** Converts an orientation into the angles a pilot reads off the instruments. */
export function getAttitude(orientation: Readonly<Quat>, out: Attitude = { headingDeg: 0, pitchDeg: 0, bankDeg: 0 }): Attitude {
  rotateVec3(forward, orientation, BODY_FORWARD);
  rotateVec3(up, orientation, BODY_UP);
  rotateVec3(right, orientation, BODY_RIGHT);
  const heading = Math.atan2(forward.x, forward.z) * RAD_TO_DEG;
  out.headingDeg = (heading + 360) % 360;
  out.pitchDeg = Math.asin(Math.max(-1, Math.min(1, forward.y))) * RAD_TO_DEG;
  // Banked right means the right wing points down (negative y) while up stays mostly up.
  out.bankDeg = Math.atan2(-right.y, up.y) * RAD_TO_DEG;
  return out;
}

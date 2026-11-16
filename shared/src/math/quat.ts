import type { Vec3 } from '../types/vector';

/**
 * Unit quaternion representing an orientation: the rotation from the
 * aircraft's body frame to the world frame.
 *
 * The convention matches Babylon.js exactly, so a state's quaternion can be
 * copied straight onto a mesh: Hamilton product, and rotating vectors as
 * v' = q * v * conj(q). Tests pin the signs: a positive rotation about +Y turns
 * +Z (nose) towards +X (right), about +X turns the nose down, and about +Z
 * lifts the right wing.
 */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function copyQuat(out: Quat, q: Readonly<Quat>): Quat {
  out.x = q.x;
  out.y = q.y;
  out.z = q.z;
  out.w = q.w;
  return out;
}

/** out = a * b: rotation b is applied first, then a. `out` may alias an input. */
export function multiplyQuat(out: Quat, a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

export function normalizeQuat(out: Quat, q: Readonly<Quat>): Quat {
  const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (length < 1e-12) return copyQuat(out, quatIdentity());
  out.x = q.x / length;
  out.y = q.y / length;
  out.z = q.z / length;
  out.w = q.w / length;
  return out;
}

/** Rotation of `angle` radians about a unit-length `axis`. */
export function quatFromAxisAngle(out: Quat, axis: Readonly<Vec3>, angle: number): Quat {
  const s = Math.sin(angle / 2);
  out.x = axis.x * s;
  out.y = axis.y * s;
  out.z = axis.z * s;
  out.w = Math.cos(angle / 2);
  return out;
}

/** Level orientation facing a compass heading (radians clockwise from +Z). */
export function quatFromHeading(out: Quat, heading: number): Quat {
  return quatFromAxisAngle(out, { x: 0, y: 1, z: 0 }, heading);
}

/**
 * Rotates a body-frame vector into the world frame: out = q * v * conj(q).
 * Uses the cheap form v + w*t + q.xyz x t, where t = 2 * (q.xyz x v).
 */
export function rotateVec3(out: Vec3, q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

// Scratch objects so per-step calls allocate nothing.
const scratchConjugate = quatIdentity();
const scratchDelta = quatIdentity();
const scratchAxis: Vec3 = { x: 0, y: 0, z: 0 };

/** Rotates a world-frame vector into the body frame (the inverse rotation). */
export function inverseRotateVec3(out: Vec3, q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  scratchConjugate.x = -q.x;
  scratchConjugate.y = -q.y;
  scratchConjugate.z = -q.z;
  scratchConjugate.w = q.w;
  return rotateVec3(out, scratchConjugate, v);
}

/**
 * Advances an orientation by a *body-frame* angular velocity over `dt`.
 *
 * Body rates are applied on the right (q * delta) because they describe
 * rotation about the aircraft's own axes. The step uses the exact rotation for
 * a constant rate over dt (axis-angle) rather than the first-order
 * q += 0.5 * q * w * dt, so fast rolls don't distort the quaternion.
 */
export function integrateBodyAngularVelocity(q: Quat, angularVelocity: Readonly<Vec3>, dt: number): Quat {
  const rate = Math.sqrt(angularVelocity.x ** 2 + angularVelocity.y ** 2 + angularVelocity.z ** 2);
  const angle = rate * dt;
  if (angle < 1e-12) return q;
  scratchAxis.x = angularVelocity.x / rate;
  scratchAxis.y = angularVelocity.y / rate;
  scratchAxis.z = angularVelocity.z / rate;
  multiplyQuat(q, q, quatFromAxisAngle(scratchDelta, scratchAxis, angle));
  // Renormalise to stop floating-point drift accumulating over thousands of steps.
  return normalizeQuat(q, q);
}

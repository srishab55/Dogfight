import type { Vec3 } from '../types/vector';

/*
 * Minimal 3D vector maths on plain { x, y, z } objects.
 *
 * Functions write into an `out` parameter instead of returning new objects, so
 * the physics step can reuse scratch vectors and allocate nothing at 60 Hz.
 * `out` may be the same object as an input.
 */

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyVec3(out: Vec3, a: Readonly<Vec3>): Vec3 {
  return setVec3(out, a.x, a.y, a.z);
}

export function addVec3(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return setVec3(out, a.x + b.x, a.y + b.y, a.z + b.z);
}

export function subtractVec3(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return setVec3(out, a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scaleVec3(out: Vec3, a: Readonly<Vec3>, s: number): Vec3 {
  return setVec3(out, a.x * s, a.y * s, a.z * s);
}

/** out = a + b * s */
export function addScaledVec3(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>, s: number): Vec3 {
  return setVec3(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
}

export function dotVec3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cross product with the standard component formula. In our left-handed axes
 * it gives cross(up, forward) = right, i.e. cross(Y, Z) = X.
 */
export function crossVec3(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return setVec3(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export function lengthVec3(a: Readonly<Vec3>): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/** Normalises `a` into `out` and returns the original length. A zero vector stays zero. */
export function normalizeVec3(out: Vec3, a: Readonly<Vec3>): number {
  const length = lengthVec3(a);
  if (length < 1e-12) {
    setVec3(out, 0, 0, 0);
    return 0;
  }
  scaleVec3(out, a, 1 / length);
  return length;
}

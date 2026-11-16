import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';

// Scratch objects reused every call so per-frame code allocates nothing.
const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchMatrix = new Matrix();

/**
 * Builds the rotation that points an object's local +Z axis along `forward`,
 * with its local +Y axis as close to `up` as possible.
 *
 * Why not Babylon's `Quaternion.FromLookDirectionLH`? It is built from a view
 * matrix and maps local +Z to *minus* `forward` (verified numerically), which
 * would point our aircraft and cameras backwards.
 *
 * Returns false and leaves `result` untouched when `forward` is zero or
 * parallel to `up`, because no unique orientation exists then.
 */
export function lookRotationToRef(forward: Vector3, up: Vector3, result: Quaternion): boolean {
  const forwardLength = forward.length();
  if (forwardLength < 1e-9) return false;
  forward.scaleToRef(1 / forwardLength, scratchForward);

  // In Babylon's left-handed system, up x forward = right (e.g. Y x Z = X).
  Vector3.CrossToRef(up, scratchForward, scratchRight);
  const rightLength = scratchRight.length();
  if (rightLength < 1e-9) return false;
  scratchRight.scaleInPlace(1 / rightLength);

  // Re-derive up so the three axes are exactly perpendicular.
  Vector3.CrossToRef(scratchForward, scratchRight, scratchUp);

  // Babylon matrices use row vectors: row 0 is where local +X ends up, row 1 is
  // local +Y, row 2 is local +Z.
  Matrix.FromValuesToRef(
    scratchRight.x, scratchRight.y, scratchRight.z, 0,
    scratchUp.x, scratchUp.y, scratchUp.z, 0,
    scratchForward.x, scratchForward.y, scratchForward.z, 0,
    0, 0, 0, 1,
    scratchMatrix,
  );
  Quaternion.FromRotationMatrixToRef(scratchMatrix, result);
  return true;
}

/** Level orientation facing a compass heading (degrees clockwise from +Z). */
export function headingToOrientation(headingDegrees: number, result: Quaternion): Quaternion {
  // A positive Babylon yaw turns +Z towards +X, i.e. clockwise seen from above,
  // which matches the compass heading convention.
  Quaternion.RotationYawPitchRollToRef(degreesToRadians(headingDegrees), 0, 0, result);
  return result;
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Fraction of the remaining gap to close this frame for exponential smoothing.
 * Using 1 - e^(-k*dt) instead of a fixed lerp factor makes smoothing identical
 * at 30, 60 or 144 FPS.
 */
export function smoothingFactor(sharpness: number, deltaSeconds: number): number {
  return 1 - Math.exp(-sharpness * deltaSeconds);
}

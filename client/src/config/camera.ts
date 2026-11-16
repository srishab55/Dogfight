import type { Vec3 } from '@dogfight/shared';

export const CHASE_CAMERA_CONFIG = {
  /**
   * Camera position relative to the aircraft, in the aircraft's local frame (m).
   * High enough to see *over* the aircraft: on a 3-degree approach the runway
   * sits 3 degrees below the horizon, and a lower camera hides it behind the
   * fuselage and propeller.
   */
  offset: { x: 0, y: 5, z: -17 } satisfies Vec3,
  /** Point the camera looks at, in the aircraft's local frame (m). Ahead of the nose so the aircraft sits low in frame. */
  lookAtOffset: { x: 0, y: 2.2, z: 12 } satisfies Vec3,
  /**
   * How quickly the camera's orientation catches up with the aircraft's, in 1/s.
   * Higher is stiffer. At 5, the camera closes ~63% of the gap in 0.2 s.
   */
  rotationSharpness: 5,
  /** Vertical field of view in degrees. */
  fieldOfViewDegrees: 60,
  /** The camera never goes below this height above the ground (m). */
  minHeightAboveGround: 1.5,
} as const;

export const COCKPIT_CAMERA_CONFIG = {
  /** Wider than the chase camera, for peripheral awareness. The eye position comes from the shared airframe. */
  fieldOfViewDegrees: 75,
} as const;

export const ORBIT_CAMERA_CONFIG = {
  /** Horizontal angle around the aircraft in degrees. -90 is directly behind it. */
  initialAlphaDegrees: -125,
  /** Angle down from vertical in degrees. 90 is level with the aircraft. */
  initialBetaDegrees: 72,
  initialRadius: 24,
  minRadius: 7,
  maxRadius: 150,
  /** Mouse-wheel zoom step as a fraction of the current radius. */
  wheelDeltaPercentage: 0.02,
  /** The camera can't be dragged below this height above the ground (m). */
  minHeightAboveGround: 1,
} as const;

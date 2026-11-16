import type { Vec3 } from '../types/vector';

/**
 * Physical geometry of the primitive airframe, at scale 1. The flight model
 * (wheel contact, crash detection) and the client's visual model both read
 * these numbers, so what you see touching the ground is what the physics
 * thinks touches the ground.
 *
 * Body frame: origin at the centre of mass, +Z nose, +Y up, +X right wing.
 * Each aircraft class scales the airframe by its `airframeScale`.
 */
export const PRIMITIVE_AIRFRAME = {
  wingSpan: 10.6,
  landingGear: {
    mainTrackHalfWidth: 1.55,
    /** Main wheels sit just behind the centre of mass, as tricycle gear requires. */
    mainZ: -0.35,
    mainWheelCenterY: -1.45,
    mainWheelRadius: 0.33,
    noseZ: 2.9,
    noseWheelRadius: 0.26,
  },
  /** Pilot's eye position, for the cockpit camera. */
  cockpitEye: { x: 0, y: 0.95, z: 0.35 },
} as const;

const gear = PRIMITIVE_AIRFRAME.landingGear;

/** Distance from the centre of mass down to the bottom of the main wheels, at scale 1. */
export const PRIMITIVE_GROUND_CLEARANCE = -(gear.mainWheelCenterY - gear.mainWheelRadius);

export interface WheelDefinition {
  /** Bottom of the tyre in the body frame, at scale 1. */
  readonly contactPoint: Readonly<Vec3>;
  /** Nose wheel steers with the rudder; main wheels brake. */
  readonly kind: 'nose' | 'main';
}

export const PRIMITIVE_WHEELS: readonly WheelDefinition[] = [
  { kind: 'main', contactPoint: { x: gear.mainTrackHalfWidth, y: -PRIMITIVE_GROUND_CLEARANCE, z: gear.mainZ } },
  { kind: 'main', contactPoint: { x: -gear.mainTrackHalfWidth, y: -PRIMITIVE_GROUND_CLEARANCE, z: gear.mainZ } },
  // The nose wheel is smaller, so its centre sits lower; its bottom is level with the mains.
  { kind: 'nose', contactPoint: { x: 0, y: -PRIMITIVE_GROUND_CLEARANCE, z: gear.noseZ } },
];

/**
 * Points on the airframe that must never touch the ground. If one does, the
 * aircraft has crashed: belly landing, wingtip strike, propeller strike,
 * nose-over. Phase 2 turns some of these into damage instead.
 */
/**
 * Gun muzzle positions at scale 1. Four guns sit in the wing leading edges
 * outboard of the propeller arc; two-gun aircraft carry them in the nose,
 * beside the engine cowling.
 */
export const PRIMITIVE_GUN_MOUNTS: Readonly<Record<2 | 4, readonly Readonly<Vec3>[]>> = {
  4: [
    { x: -2.4, y: -0.13, z: 1.03 },
    { x: 2.4, y: -0.13, z: 1.03 },
    { x: -1.9, y: -0.18, z: 1.08 },
    { x: 1.9, y: -0.18, z: 1.08 },
  ],
  2: [
    { x: -0.42, y: 0.25, z: 3.3 },
    { x: 0.42, y: 0.25, z: 3.3 },
  ],
};

export interface CrashPoint {
  readonly point: Readonly<Vec3>;
  /** Shown to the player, e.g. "Crashed: propeller strike". */
  readonly description: string;
}

export const PRIMITIVE_CRASH_POINTS: readonly CrashPoint[] = [
  { point: { x: 0, y: 0, z: 4.36 }, description: 'nose impact' },
  { point: { x: 0, y: -1.45, z: 3.95 }, description: 'propeller strike' },
  { point: { x: 1.02, y: -1.02, z: 3.95 }, description: 'propeller strike' },
  { point: { x: -1.02, y: -1.02, z: 3.95 }, description: 'propeller strike' },
  { point: { x: 0, y: -0.82, z: -0.2 }, description: 'belly landing' },
  { point: { x: 0, y: 0, z: -4.7 }, description: 'tail strike' },
  { point: { x: 0, y: 1.85, z: -4.6 }, description: 'fin strike' },
  { point: { x: 0, y: 0.83, z: 0.55 }, description: 'canopy impact' },
  { point: { x: 5.3, y: 0.18, z: 0.25 }, description: 'right wingtip strike' },
  { point: { x: -5.3, y: 0.18, z: 0.25 }, description: 'left wingtip strike' },
  { point: { x: 2.0, y: 0.08, z: -4.3 }, description: 'tailplane strike' },
  { point: { x: -2.0, y: 0.08, z: -4.3 }, description: 'tailplane strike' },
];

import type { AircraftClassId } from './aircraftClasses';
import type { Vec3 } from '../types/vector';

/** Forward-firing machine guns. Per-class values: rules shared by client and server. */
export interface GunSpec {
  /** Rate of fire of each gun (rounds/s). 13 is about 800 rounds per minute. */
  readonly roundsPerSecondPerGun: number;
  /** Speed of a round leaving the barrel, added to the aircraft's own velocity (m/s). */
  readonly muzzleVelocity: number;
  /** Rounds disappear after this long, which sets the effective range (s). */
  readonly projectileLifetime: number;
  /** Random scatter of each round around its aim line, as a cone half-angle (deg). */
  readonly dispersionDeg: number;
  /** Damage dealt per round that hits. */
  readonly damagePerRound: number;
  /** Seconds of continuous fire from cold until the guns overheat and lock. */
  readonly secondsToOverheat: number;
  /** Seconds to cool from fully hot to cold when not firing. */
  readonly secondsToCool: number;
  /** After overheating, the guns fire again once heat drops below this (0-1). */
  readonly recoverBelowHeat: number;
  /** The guns are angled so their streams cross this far ahead of the nose (m). */
  readonly convergenceDistance: number;
  /** Ammunition carried per gun. At 13 rounds/s, 300 rounds is 23 s of firing: land at a base to rearm. */
  readonly roundsPerGun: number;
}

const STANDARD_GUNS: GunSpec = {
  roundsPerSecondPerGun: 13,
  muzzleVelocity: 860,
  projectileLifetime: 2.2,
  dispersionDeg: 0.25,
  damagePerRound: 1,
  secondsToOverheat: 8,
  secondsToCool: 6,
  recoverBelowHeat: 0.4,
  convergenceDistance: 300,
  roundsPerGun: 300,
};

export const GUN_SPECS: Readonly<Record<AircraftClassId, GunSpec>> = {
  // Light and fast: a smaller ammunition load.
  interceptor: { ...STANDARD_GUNS, roundsPerGun: 250 },
  fighterBomber: STANDARD_GUNS,
  // Heavier nose guns: slower-firing but harder-hitting, and they run hot sooner. Big magazines.
  heavyBomber: { ...STANDARD_GUNS, roundsPerSecondPerGun: 10, damagePerRound: 1.5, secondsToOverheat: 6, roundsPerGun: 500 },
  // Long patrols over the sea: the deepest magazines of the fighters.
  navalFighter: { ...STANDARD_GUNS, roundsPerGun: 400 },
  // Two cowling guns, synchronised to fire through the propeller (a slower rate).
  diveBomber: { ...STANDARD_GUNS, roundsPerSecondPerGun: 11, damagePerRound: 1.2, roundsPerGun: 360 },
  // WWI-style machine guns: a little slower firing and lighter.
  triplane: { ...STANDARD_GUNS, roundsPerSecondPerGun: 10, damagePerRound: 0.9, roundsPerGun: 500 },
  biplane: { ...STANDARD_GUNS, roundsPerGun: 450 },
};

/**
 * Rearming and repair at a friendly base: land, stop on the runway (or its
 * aprons) or the carrier deck, and idle. Interrupted if you move off.
 */
export const SERVICE_CONFIG = {
  /** Seconds stopped at a base to rearm fully and repair the hull. */
  durationSeconds: 6,
  /** Counts as stopped below this ground speed (m/s). */
  maxGroundSpeed: 1.5,
  /** The engine must be at or below this throttle (crews don't work beside a propeller at power). */
  maxThrottle: 0.2,
} as const;

/** Floating practice balloons: something to shoot at until AI aircraft arrive (Phase 7). */
export const PRACTICE_TARGET_CONFIG = {
  radius: 4,
  /** Rounds-worth of damage to burst one. */
  maxHealth: 8,
  /** Seconds before a burst balloon reappears. */
  respawnSeconds: 20,
  /**
   * Positions relative to the home runway's centre (x east, y up, z north, m).
   * Strung along the climb-out path and either side of it, at 150-450 m.
   */
  layout: [
    { x: 0, y: 180, z: 1_800 },
    { x: -250, y: 260, z: 2_600 },
    { x: 300, y: 320, z: 3_200 },
    { x: -500, y: 400, z: 3_900 },
    { x: 600, y: 220, z: 4_500 },
    { x: 0, y: 450, z: 5_200 },
  ] satisfies readonly Vec3[],
} as const;

/**
 * Aim assist for human pilots: their rounds that pass this close to an
 * enemy aircraft's hit shapes count as hits (full damage). Hitting a moving
 * aircraft exactly is very hard with the mouse or keys; the AI shoots without it.
 */
export const HIT_ASSIST_CONFIG = {
  nearMissMetres: 3,
} as const;

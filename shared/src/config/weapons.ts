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
};

export const GUN_SPECS: Readonly<Record<AircraftClassId, GunSpec>> = {
  interceptor: STANDARD_GUNS,
  fighterBomber: STANDARD_GUNS,
  // Heavier nose guns: slower-firing but harder-hitting, and they run hot sooner.
  heavyBomber: { ...STANDARD_GUNS, roundsPerSecondPerGun: 10, damagePerRound: 1.5, secondsToOverheat: 6 },
};

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

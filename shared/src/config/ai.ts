import type { AircraftClassId } from './aircraftClasses';
import type { Team } from '../types/team';

/**
 * The AI pilots (shared/src/ai). Distances in metres, times in seconds,
 * angles in degrees.
 */
export const AI_CONFIG = {
  /** Each team's AI aircraft, one per entry (Blue's players fly Blue). All carry hooks: they launch from their carrier. */
  squadrons: {
    blue: [],
    red: ['navalFighter', 'interceptor', 'fighterBomber', 'navalFighter'],
  } as Readonly<Record<Team, readonly AircraftClassId[]>>,
  /** At the start, launches are this far apart, so they don't share the catapult. */
  launchInterval: 7,
  /** A lost AI pilot is back in a fresh aircraft this long after crashing, at its side's base nearest the enemy. */
  respawnSeconds: 5,
  /** ...but waits while another aircraft is still within this distance of the catapult or runway start (m). */
  launchSpacing: 40,
  /**
   * Half are hunters, after enemy aircraft out to the longer range; half
   * raiders, taking bases, who fight only what comes close.
   */
  engageRange: { hunter: 4_000, raider: 1_400 },
  /**
   * Defending: an enemy aircraft within `radius` of a base the AI's side
   * holds draws every pilot within `interceptRange` of it, whatever its role
   * (capture landings are broken off to go and meet it).
   */
  defend: { radius: 3_000, interceptRange: 8_000 },
  /** Opens fire inside this range with the lead point within this angle of the nose. */
  fireRange: 650,
  /** Closer than this, it stops closing and tracks the target with the gun solution. */
  trackingRange: 480,
  fireConeDeg: 2.5,
  /** The aim wanders by up to this much, so it doesn't hit with every burst (0.4 deg is 2 m at 300 m: about a fuselage). */
  aimErrorDeg: 0.4,
  /** Tracking: how fast the aim corrects a steady error between nose and solution (per second), and the most it corrects. */
  aimIntegralRate: 1.5,
  aimIntegralMax: 0.15,
  /** Breaks away from a target closer than this, to avoid a collision. */
  breakAwayDistance: 130,
  /** Under attack: an enemy behind within this range, its nose on us within this angle. */
  threatRange: 800,
  threatConeDeg: 20,
  evadeSeconds: 3,
  evadeCooldown: 7,
  /** Pulls up when its path over the next few seconds comes within this of the ground or sea. */
  terrainLookSeconds: 4,
  terrainMargin: 70,
  /** Doesn't follow a target down below this height above the ground. */
  minAttackHeight: 140,
  /** Goes home to rearm and repair below these fractions of ammunition or hull. */
  rtbAmmoFraction: 0.15,
  rtbHullFraction: 0.35,
  /** Cruising height above the sea. */
  cruiseHeight: 500,
  /** Strafing a base's defences: set up this far out and this high, fire inside this range, pull up at this distance or height. */
  strafe: { setupDistance: 1_600, setupHeight: 380, fireRange: 850, fireConeDeg: 3, pullUpDistance: 300, pullUpHeight: 100, recoverSeconds: 7 },
  /** On the ground after landing, it waits up to this long for a capture or a service before taking off again. */
  groundWaitSeconds: 14,
  /** A landing still not down after this long (it can't line up, say) is given up, and the pilot thinks again. */
  landingTimeoutSeconds: 150,
  /** Stays inside this square around the centre of the map (half-width)... */
  boundary: 4_200,
  /** ...or this much further while chasing an enemy within this range. */
  chaseBeyondBoundary: { extra: 2_500, range: 2_000 },
} as const;

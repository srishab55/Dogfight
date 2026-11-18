import { AA_GUN_CONFIG, BASE_LAYOUT, BASE_STRUCTURE_CONFIG, CARRIER_DAMAGE_CONFIG } from '../config/targets';
import { PRACTICE_TARGET_CONFIG } from '../config/weapons';
import { BASES, CARRIERS, HOME_RUNWAY, type CarrierDefinition, type RunwayDefinition } from '../config/world';
import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';

/** respawnSeconds for things that never come back by themselves (a base's defences, buildings and aircraft; a carrier's gun). */
const NEVER = Infinity;

export type TargetKind = 'balloon' | 'aaGun' | 'parkedAircraft' | 'carrier' | 'hangar' | 'fuelDepot' | 'radar';

/** The targets that defend a base: destroy them all and the base can be captured. */
export const BASE_DEFENCE_KINDS: readonly TargetKind[] = ['aaGun', 'hangar', 'fuelDepot', 'radar'];

/**
 * Something on the map that rounds can damage and destroy: a practice
 * balloon, an anti-aircraft gun, a building, a parked aircraft or a carrier.
 *
 * What comes back once destroyed: practice balloons after a short delay; a
 * sunk carrier as a new ship (with its gun) after a few minutes. Nothing at
 * a base comes back by itself: only capturing the base repairs it, for its
 * new owner (baseControl.ts).
 */
export interface CombatTarget {
  readonly id: number;
  readonly kind: TargetKind;
  /** Owning team; null for practice balloons, which anyone may shoot. Changes when its base is captured. */
  team: Team | null;
  /** Centre of the target, or of a carrier's flight deck (m). */
  readonly position: Readonly<Vec3>;
  /** Hit sphere radius (m). 0 for carriers: rounds hit them through their hull and deck (the world ground). */
  readonly radius: number;
  /** Direction it faces, clockwise from north (deg): parked aircraft and guns. */
  readonly headingDegrees: number;
  health: number;
  readonly maxHealth: number;
  /** Fraction of each round's damage that gets through (armour). */
  readonly vulnerability: number;
  /** Seconds from destroyed to replaced; Infinity for things that never come back by themselves. */
  readonly respawnSeconds: number;
  /** Seconds until a destroyed target is replaced (0 while it stands; Infinity: not coming back). */
  respawnTimer: number;
  /** Seconds since it was destroyed (0 while it stands): for fires, and for a carrier's sinking. */
  destroyedSeconds: number;
  /** The carrier this target is part of or mounted on (it sinks with it), or null. */
  readonly carrierId: string | null;
  /** The base this target belongs to (its airfield or carrier), or null. */
  readonly baseId: string | null;
  /**
   * False for an AA gun nobody has built yet (at an airfield that belongs to
   * nobody): there's only its empty platform. It's built when the base is
   * captured, and from then on it's true, destroyed or not.
   */
  built: boolean;
}

/** @deprecated name kept for the balloon code: practice balloons are combat targets. */
export type PracticeTarget = CombatTarget;

export function isTargetAlive(target: Readonly<CombatTarget>): boolean {
  return target.health > 0;
}

export interface TargetOptions {
  /**
   * Carrier hulls that can be shot and sunk (each comes back after a few
   * minutes). Off in a match: carriers are bases, captured like airfields.
   */
  readonly carrierHulls?: boolean;
}

/**
 * Every target on the map: the practice balloons, then each base's
 * defences. Every island airfield has two AA guns, a hangar, a fuel depot
 * and a radar; while it belongs to nobody they're nobody's, and its guns
 * aren't built yet. Each carrier has two AA guns.
 */
export function createTargets(options: TargetOptions = {}): CombatTarget[] {
  const targets: CombatTarget[] = [];
  const add = (target: Omit<CombatTarget, 'id' | 'health' | 'respawnTimer' | 'destroyedSeconds' | 'built'>, built = true) =>
    targets.push({ ...target, id: targets.length, health: built ? target.maxHealth : 0, respawnTimer: built ? 0 : NEVER, destroyedSeconds: 0, built });

  for (const balloon of createPracticeTargets()) add(balloon);

  for (const base of BASES) {
    const team = base.team;
    if (base.kind === 'airfield') {
      const runway = base.runway;
      const at = (spot: { along: number; across: number }, height: number) => onRunway(runway, spot.along, spot.across, height);
      const structure = (kind: 'hangar' | 'fuelDepot' | 'radar', spot: { along: number; across: number }) => {
        const c = BASE_STRUCTURE_CONFIG[kind];
        // Buildings face the runway: their fronts point back across it.
        add({ kind, team, position: at(spot, c.height), radius: c.hitRadius, headingDegrees: runway.headingDegrees + (spot.across > 0 ? -90 : 90), maxHealth: c.maxHealth, vulnerability: 1, respawnSeconds: NEVER, carrierId: null, baseId: base.id });
      };
      // Nobody mans the guns until somebody takes the field.
      for (const spot of BASE_LAYOUT.airfieldAaGuns) {
        add({ kind: 'aaGun', team, position: at(spot, AA_GUN_CONFIG.mountHeight), radius: AA_GUN_CONFIG.hitRadius, headingDegrees: runway.headingDegrees, maxHealth: AA_GUN_CONFIG.maxHealth, vulnerability: 1, respawnSeconds: NEVER, carrierId: null, baseId: base.id }, team !== null);
      }
      structure('hangar', BASE_LAYOUT.hangar);
      structure('fuelDepot', BASE_LAYOUT.fuelDepot);
      structure('radar', BASE_LAYOUT.radar);
      continue;
    }
    const carrier = CARRIERS.find((c) => c.id === base.id);
    if (!carrier) continue;
    if (options.carrierHulls) {
      const c = CARRIER_DAMAGE_CONFIG;
      add({ kind: 'carrier', team, position: carrier.center, radius: 0, headingDegrees: carrier.headingDegrees, maxHealth: c.maxHealth, vulnerability: c.gunVulnerability, respawnSeconds: c.respawnSeconds, carrierId: carrier.id, baseId: null });
    }
    for (const gun of BASE_LAYOUT.carrierAaGuns) {
      add({ kind: 'aaGun', team, position: onCarrier(carrier, gun.fromStern, gun.side * (carrier.deckWidth / 2 - 1), AA_GUN_CONFIG.mountHeight * 0.6), radius: AA_GUN_CONFIG.hitRadius, headingDegrees: carrier.headingDegrees, maxHealth: AA_GUN_CONFIG.maxHealth, vulnerability: 1, respawnSeconds: NEVER, carrierId: carrier.id, baseId: base.id });
    }
  }
  return targets;
}

/** The practice balloons, strung along the climb-out from a runway. */
export function createPracticeTargets(runway: RunwayDefinition = HOME_RUNWAY): CombatTarget[] {
  return PRACTICE_TARGET_CONFIG.layout.map((offset, id) => ({
    id,
    kind: 'balloon',
    team: null,
    position: { x: runway.center.x + offset.x, y: runway.center.y + offset.y, z: runway.center.z + offset.z },
    radius: PRACTICE_TARGET_CONFIG.radius,
    headingDegrees: 0,
    health: PRACTICE_TARGET_CONFIG.maxHealth,
    maxHealth: PRACTICE_TARGET_CONFIG.maxHealth,
    vulnerability: 1,
    respawnSeconds: PRACTICE_TARGET_CONFIG.respawnSeconds,
    respawnTimer: 0,
    destroyedSeconds: 0,
    carrierId: null,
    baseId: null,
    built: true,
  }));
}

/** Applies a round's damage (after armour). Returns true if this hit destroyed the target. */
export function damageTarget(target: CombatTarget, damage: number): boolean {
  if (!isTargetAlive(target)) return false;
  target.health = Math.max(0, target.health - damage * target.vulnerability);
  if (target.health > 0) return false;
  target.respawnTimer = target.respawnSeconds;
  target.destroyedSeconds = 0;
  return true;
}

/** @deprecated use damageTarget. */
export const damagePracticeTarget = damageTarget;

/**
 * Counts down destroyed targets and replaces them. Returns the targets that
 * came back this step.
 */
export function updateTargets(targets: CombatTarget[], dt: number, respawned: CombatTarget[] = []): CombatTarget[] {
  for (const target of targets) {
    if (isTargetAlive(target)) continue;
    target.destroyedSeconds += dt;
    target.respawnTimer -= dt;
    if (target.respawnTimer <= 0) {
      target.respawnTimer = 0;
      target.destroyedSeconds = 0;
      target.health = target.maxHealth;
      target.built = true;
      respawned.push(target);
    }
  }
  return respawned;
}

/** @deprecated use updateTargets. */
export function updatePracticeTargets(targets: CombatTarget[], dt: number): void {
  updateTargets(targets, dt);
}

/** World point at `along`/`across` in a runway's frame, `height` above it. */
function onRunway(runway: RunwayDefinition, along: number, across: number, height: number): Vec3 {
  const h = (runway.headingDegrees * Math.PI) / 180;
  return {
    x: runway.center.x + along * Math.sin(h) + across * Math.cos(h),
    y: runway.center.y + height,
    z: runway.center.z + along * Math.cos(h) - across * Math.sin(h),
  };
}

/** World point `fromStern` metres along a carrier's deck, `across` to starboard, `height` above the deck. */
function onCarrier(carrier: CarrierDefinition, fromStern: number, across: number, height: number): Vec3 {
  return onRunway({ id: carrier.id, center: carrier.center, headingDegrees: carrier.headingDegrees, length: carrier.deckLength, width: carrier.deckWidth }, fromStern - carrier.deckLength / 2, across, height);
}

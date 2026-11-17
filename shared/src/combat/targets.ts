import { AA_GUN_CONFIG, BASE_STRUCTURE_CONFIG, CARRIER_DAMAGE_CONFIG, ENEMY_LAYOUT, PARKED_AIRCRAFT_CONFIG } from '../config/targets';
import { PRACTICE_TARGET_CONFIG } from '../config/weapons';
import { BASES, CARRIERS, HOME_RUNWAY, type CarrierDefinition, type RunwayDefinition } from '../config/world';
import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';

export type TargetKind = 'balloon' | 'aaGun' | 'parkedAircraft' | 'carrier' | 'hangar' | 'fuelDepot' | 'radar';

/** The targets that defend a base: destroy them all and the base can be captured. */
export const BASE_DEFENCE_KINDS: readonly TargetKind[] = ['aaGun', 'hangar', 'fuelDepot', 'radar'];

/**
 * Something on the map that rounds can damage and destroy: a practice
 * balloon, an anti-aircraft gun, a parked aircraft or a carrier. After a
 * delay a destroyed target is replaced (practice rules until Phase 6 adds
 * base capture).
 */
export interface CombatTarget {
  readonly id: number;
  readonly kind: TargetKind;
  /** Owning team; null for practice balloons, which anyone may shoot. */
  readonly team: Team | null;
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
  readonly respawnSeconds: number;
  /** Seconds until a destroyed target is replaced (0 while it stands). */
  respawnTimer: number;
  /** The carrier this target is part of or mounted on (it sinks with it), or null. */
  readonly carrierId: string | null;
  /** The base this target belongs to (its airfield), or null. */
  readonly baseId: string | null;
}

/** @deprecated name kept for the balloon code: practice balloons are combat targets. */
export type PracticeTarget = CombatTarget;

export function isTargetAlive(target: Readonly<CombatTarget>): boolean {
  return target.health > 0;
}

/** Every target on the map: practice balloons near Blue's airfield, then Red's defences, parked aircraft and carrier. */
export function createTargets(): CombatTarget[] {
  const targets: CombatTarget[] = [];
  const add = (target: Omit<CombatTarget, 'id' | 'health' | 'respawnTimer'>) => targets.push({ ...target, id: targets.length, health: target.maxHealth, respawnTimer: 0 });

  for (const balloon of createPracticeTargets()) add(balloon);

  const team: Team = ENEMY_LAYOUT.team;
  for (const base of BASES.filter((b) => b.team === team && b.kind === 'airfield')) {
    const runway = base.runway;
    const at = (spot: { along: number; across: number }, height: number) => onRunway(runway, spot.along, spot.across, height);
    const structure = (kind: 'hangar' | 'fuelDepot' | 'radar', spot: { along: number; across: number }) => {
      const c = BASE_STRUCTURE_CONFIG[kind];
      // Buildings face the runway: their fronts point back across it.
      add({ kind, team, position: at(spot, c.height), radius: c.hitRadius, headingDegrees: runway.headingDegrees + (spot.across > 0 ? -90 : 90), maxHealth: c.maxHealth, vulnerability: 1, respawnSeconds: c.respawnSeconds, carrierId: null, baseId: base.id });
    };
    add({ kind: 'aaGun', team, position: at(ENEMY_LAYOUT.airfieldAaGun, AA_GUN_CONFIG.mountHeight), radius: AA_GUN_CONFIG.hitRadius, headingDegrees: runway.headingDegrees, maxHealth: AA_GUN_CONFIG.maxHealth, vulnerability: 1, respawnSeconds: AA_GUN_CONFIG.respawnSeconds, carrierId: null, baseId: base.id });
    structure('hangar', ENEMY_LAYOUT.hangar);
    structure('fuelDepot', ENEMY_LAYOUT.fuelDepot);
    structure('radar', ENEMY_LAYOUT.radar);
    for (const parked of ENEMY_LAYOUT.parkedAircraft) {
      const facing = runway.headingDegrees + (parked.across > 0 ? -90 : 90);
      add({ kind: 'parkedAircraft', team, position: at(parked, 1.5), radius: PARKED_AIRCRAFT_CONFIG.hitRadius, headingDegrees: facing, maxHealth: PARKED_AIRCRAFT_CONFIG.maxHealth, vulnerability: 1, respawnSeconds: PARKED_AIRCRAFT_CONFIG.respawnSeconds, carrierId: null, baseId: base.id });
    }
  }

  for (const carrier of CARRIERS.filter((c) => c.team === team)) {
    const c = CARRIER_DAMAGE_CONFIG;
    add({ kind: 'carrier', team, position: carrier.center, radius: 0, headingDegrees: carrier.headingDegrees, maxHealth: c.maxHealth, vulnerability: c.gunVulnerability, respawnSeconds: c.respawnSeconds, carrierId: carrier.id, baseId: null });
    const gun = ENEMY_LAYOUT.carrierAaGun;
    add({ kind: 'aaGun', team, position: onCarrier(carrier, gun.fromStern, gun.side * (carrier.deckWidth / 2 - 1), AA_GUN_CONFIG.mountHeight * 0.6), radius: AA_GUN_CONFIG.hitRadius, headingDegrees: carrier.headingDegrees, maxHealth: AA_GUN_CONFIG.maxHealth, vulnerability: 1, respawnSeconds: AA_GUN_CONFIG.respawnSeconds, carrierId: carrier.id, baseId: null });
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
    carrierId: null,
    baseId: null,
  }));
}

/** Applies a round's damage (after armour). Returns true if this hit destroyed the target. */
export function damageTarget(target: CombatTarget, damage: number): boolean {
  if (!isTargetAlive(target)) return false;
  target.health = Math.max(0, target.health - damage * target.vulnerability);
  if (target.health > 0) return false;
  target.respawnTimer = target.respawnSeconds;
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
    target.respawnTimer -= dt;
    if (target.respawnTimer <= 0) {
      target.respawnTimer = 0;
      target.health = target.maxHealth;
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

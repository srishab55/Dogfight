import { BASES, type BaseDefinition, type CarrierStatusMap, type CombatWorld, type Team } from '@dogfight/shared';

/**
 * What the map, the beacons and the HUD labels show about a base: who holds
 * it, and whether it can be captured or is gone (a sunk carrier).
 */
export interface BaseView {
  readonly base: BaseDefinition;
  readonly owner: Team;
  /**
   * 'defended': as normal. 'open': an enemy base with no defences left (land
   * on it to capture it). 'gone': a carrier that is sinking or sunk.
   */
  readonly state: 'defended' | 'open' | 'gone';
  /** Top of the base: the runway or deck (m). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Each base's current view, for the local player's team. */
export function describeBases(combat: CombatWorld, carrierStatuses: CarrierStatusMap, playerTeam: Team, bases: readonly BaseDefinition[] = BASES): BaseView[] {
  return bases.map((base) => {
    const control = combat.bases.find((b) => b.base.id === base.id);
    const owner = control?.owner ?? base.team;
    const sink = base.kind === 'carrier' ? (carrierStatuses.get(base.id)?.sink ?? 0) : 0;
    const carrierTarget = base.kind === 'carrier' ? combat.targets.find((t) => t.kind === 'carrier' && t.carrierId === base.id) : undefined;
    const gone = sink > 0 || (carrierTarget !== undefined && carrierTarget.health <= 0);
    const state = gone ? 'gone' : control?.neutralized && owner !== playerTeam ? 'open' : 'defended';
    const c = base.runway.center;
    return { base, owner, state, x: c.x, y: c.y - sink, z: c.z };
  });
}

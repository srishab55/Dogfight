import { hasTailhook, type AircraftClassSpec } from '../config/aircraftClasses';
import { CAPTURE_CONFIG } from '../config/targets';
import { BASES, isOnRunway, type BaseDefinition, type BaseOwnerLookup } from '../config/world';
import type { CarrierStatusMap } from '../world/carrierStatus';
import type { AircraftState } from '../flight/AircraftState';
import type { Team } from '../types/team';
import { BASE_DEFENCE_KINDS, isTargetAlive, type CombatTarget } from './targets';

/**
 * Who holds each base, and the capture rules.
 *
 * Island airfields start the match belonging to nobody: the first aircraft
 * to land and stop on one for a few seconds takes it. A held base is
 * defended while any of its defences (an airfield's AA gun, hangar, fuel
 * depot and radar; a carrier's AA gun) stands. Destroy them all and it's
 * neutralized. Nothing there rebuilds itself, so it stays defenceless until
 * an enemy aircraft lands and stops on it (an airfield's runway, service
 * lane or aprons; a carrier's deck): that captures it. Then the base changes
 * sides: the new owner can rearm and start there, everything left standing
 * is theirs, and their crews build or repair its defences, which then
 * defend it for them. A carrier is captured the same way: a team's home
 * can be taken.
 */
export interface BaseControl {
  readonly base: BaseDefinition;
  /** Null: nobody holds it (an island airfield at the start of a match). */
  owner: Team | null;
  /** All its defences are destroyed. */
  neutralized: boolean;
  /** 0-1 through a capture under way, by `capturingTeam`. */
  captureProgress: number;
  capturingTeam: Team | null;
}

export type BaseEvent =
  | { readonly type: 'baseNeutralized'; readonly baseId: string; readonly owner: Team }
  | { readonly type: 'baseDefended'; readonly baseId: string; readonly owner: Team }
  | { readonly type: 'baseCaptured'; readonly baseId: string; readonly owner: Team; readonly previousOwner: Team | null };

export function createBaseControls(bases: readonly BaseDefinition[] = BASES): BaseControl[] {
  return bases.map((base) => ({ base, owner: base.team, neutralized: false, captureProgress: 0, capturingTeam: null }));
}

/** An aircraft that can capture bases. */
export interface Capturer {
  readonly team: Team;
  readonly state: Readonly<AircraftState>;
}

export function stepBaseControls(controls: readonly BaseControl[], targets: CombatTarget[], aircraft: readonly Capturer[], dt: number, events: BaseEvent[]): void {
  for (const control of controls) {
    const owner = control.owner;
    if (owner !== null) {
      const defences = targets.filter((t) => t.baseId === control.base.id && BASE_DEFENCE_KINDS.includes(t.kind));
      const neutralized = defences.length > 0 && defences.every((t) => !isTargetAlive(t));
      if (neutralized !== control.neutralized) {
        control.neutralized = neutralized;
        events.push({ type: neutralized ? 'baseNeutralized' : 'baseDefended', baseId: control.base.id, owner });
      }
    }

    // Nobody's base can be taken by anyone; a held one only once it's defenceless.
    const open = owner === null || control.neutralized;
    const capturer = open ? aircraft.find((a) => a.team !== owner && isCapturing(a.state, control.base)) : undefined;
    if (!capturer) {
      control.captureProgress = 0;
      control.capturingTeam = null;
      continue;
    }
    control.capturingTeam = capturer.team;
    control.captureProgress = Math.min(1, control.captureProgress + dt / CAPTURE_CONFIG.seconds);
    if (control.captureProgress < 1) continue;

    const previousOwner = control.owner;
    const newOwner = capturer.team;
    control.owner = newOwner;
    control.neutralized = false;
    control.captureProgress = 0;
    control.capturingTeam = null;
    // Everything at the base changes sides; its destroyed (or never built)
    // defences are built for the new owner.
    for (const target of targets) {
      if (target.baseId !== control.base.id) continue;
      target.team = newOwner;
      if (!isTargetAlive(target) && BASE_DEFENCE_KINDS.includes(target.kind)) target.respawnTimer = CAPTURE_CONFIG.repairSeconds;
    }
    events.push({ type: 'baseCaptured', baseId: control.base.id, owner: newOwner, previousOwner });
  }
}

/** How many bases a team holds now. */
export function basesHeld(controls: readonly BaseControl[], team: Team): number {
  return controls.reduce((n, c) => n + (c.owner === team ? 1 : 0), 0);
}

/** On the ground, intact, stopped, on the base's runway, service lane or aprons (a carrier: its deck). */
function isCapturing(state: Readonly<AircraftState>, base: BaseDefinition): boolean {
  if (state.crashed || !state.onGround) return false;
  if (Math.hypot(state.velocity.x, state.velocity.z) > CAPTURE_CONFIG.maxGroundSpeed) return false;
  return isOnRunway(base.runway, state.position.x, state.position.z, base.serviceMargin);
}

/**
 * Where an aircraft of `team` can start, and take off, from: every base the
 * team holds now (its carrier, and any it has captured). A carrier's deck
 * only for an aircraft with an arrestor hook (the Heavy Bomber is too big
 * for it: see `airStartBases`), and not while it is sinking.
 */
export function startingBases(team: Team, spec: AircraftClassSpec, ownerOf: BaseOwnerLookup, carrierStatuses: CarrierStatusMap | null = null, bases: readonly BaseDefinition[] = BASES): BaseDefinition[] {
  return bases.filter((base) => ownerOf(base) === team && (base.kind !== 'carrier' || (hasTailhook(spec) && (carrierStatuses?.get(base.id)?.sink ?? 0) === 0)));
}

/**
 * Every base the team holds, for an air start over it: any aircraft can be
 * launched into the air above its carrier (the Heavy Bomber's only way to
 * start until its team holds an airfield).
 */
export function airStartBases(team: Team, ownerOf: BaseOwnerLookup, carrierStatuses: CarrierStatusMap | null = null, bases: readonly BaseDefinition[] = BASES): BaseDefinition[] {
  return bases.filter((base) => ownerOf(base) === team && (carrierStatuses?.get(base.id)?.sink ?? 0) === 0);
}

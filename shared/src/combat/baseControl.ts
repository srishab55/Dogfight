import { CAPTURE_CONFIG } from '../config/targets';
import { BASES, isOnRunway, type BaseDefinition } from '../config/world';
import type { AircraftState } from '../flight/AircraftState';
import type { Team } from '../types/team';
import { BASE_DEFENCE_KINDS, isTargetAlive, type CombatTarget } from './targets';

/**
 * Who holds each base, and the capture rules.
 *
 * A base is defended while any of its defences (AA gun, hangar, fuel depot,
 * radar) stands. Destroy them all and it's neutralized. An enemy aircraft
 * that then lands and stops on its runway or aprons for a few seconds
 * captures it: the base changes sides (its defences stay wrecked; the new
 * owner can rearm there). Left alone, a neutralized base rebuilds its
 * defences after a few minutes and is defended again.
 *
 * Carriers can't be captured: they're sunk instead.
 */
export interface BaseControl {
  readonly base: BaseDefinition;
  owner: Team;
  /** All its defences are destroyed. */
  neutralized: boolean;
  /** 0-1 through a capture under way, by `capturingTeam`. */
  captureProgress: number;
  capturingTeam: Team | null;
}

export type BaseEvent =
  | { readonly type: 'baseNeutralized'; readonly baseId: string; readonly owner: Team }
  | { readonly type: 'baseDefended'; readonly baseId: string; readonly owner: Team }
  | { readonly type: 'baseCaptured'; readonly baseId: string; readonly owner: Team; readonly previousOwner: Team };

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
    if (control.base.kind !== 'airfield') continue;
    const defences = targets.filter((t) => t.baseId === control.base.id && BASE_DEFENCE_KINDS.includes(t.kind));
    const neutralized = defences.length > 0 && defences.every((t) => !isTargetAlive(t));
    if (neutralized !== control.neutralized) {
      control.neutralized = neutralized;
      events.push({ type: neutralized ? 'baseNeutralized' : 'baseDefended', baseId: control.base.id, owner: control.owner });
    }

    const capturer = control.neutralized ? aircraft.find((a) => a.team !== control.owner && isCapturing(a.state, control.base)) : undefined;
    if (!capturer) {
      control.captureProgress = 0;
      control.capturingTeam = null;
      continue;
    }
    control.capturingTeam = capturer.team;
    control.captureProgress = Math.min(1, control.captureProgress + dt / CAPTURE_CONFIG.seconds);
    if (control.captureProgress < 1) continue;

    const previousOwner = control.owner;
    control.owner = capturer.team;
    control.captureProgress = 0;
    control.capturingTeam = null;
    // The base's old defences and aircraft stay wrecked under new ownership.
    for (const target of targets) {
      if (target.baseId !== control.base.id) continue;
      target.health = 0;
      target.respawnTimer = Infinity;
    }
    events.push({ type: 'baseCaptured', baseId: control.base.id, owner: control.owner, previousOwner });
  }
}

/** On the ground, intact, stopped, on the base's runway or aprons. */
function isCapturing(state: Readonly<AircraftState>, base: BaseDefinition): boolean {
  if (state.crashed || !state.onGround) return false;
  if (Math.hypot(state.velocity.x, state.velocity.z) > CAPTURE_CONFIG.maxGroundSpeed) return false;
  return isOnRunway(base.runway, state.position.x, state.position.z, base.serviceMargin);
}

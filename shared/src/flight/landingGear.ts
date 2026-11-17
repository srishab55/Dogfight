import type { AircraftClassSpec } from '../config/aircraftClasses';
import { groundClearance } from '../config/aircraftClasses';
import { BASES, type BaseDefinition } from '../config/world';
import type { AircraftState } from './AircraftState';
import type { GroundQuery } from './ground';

/*
 * Retractable landing gear, raised and lowered automatically (as an
 * assist: there is no gear lever to forget).
 *
 *   - UP soon after take-off: once airborne for a moment, climbing, and
 *     clear of the ground. Later in a flight, only when climbing well clear
 *     of the ground (300 m), or flying too fast to have it down.
 *   - DOWN when coming in to land: descending at landing-ish speed, either
 *     low over the ground or sea, or anywhere near a base (runway or deck).
 *   - Otherwise it stays as it is (so a low, slow turn in a dogfight that
 *     drops it climbs away and raises it again).
 *
 * Down, it adds drag; up, the wheels are inside the aircraft, so touching
 * the ground then is a belly landing (a crash). Deterministic, in the shared
 * simulation, like everything else that changes how the aircraft flies.
 */
export const LANDING_GEAR_CONFIG = {
  /** Seconds to go fully up or down (real ones took 5-10 s; quicker here). */
  travelTime: 3,
  /** Extra zero-lift drag coefficient with the gear fully down. */
  dragIncrement: 0.008,
  /** The wheels carry weight (and a touchdown is a landing) only once this far down. */
  lockedPosition: 0.9,
  retract: {
    /** In the air this long (s), this high above the ground (m), climbing at least this fast (m/s)... */
    afterAirborneSeconds: 1,
    minHeight: 10,
    minClimbRate: 0.5,
    /**
     * ...and either just after take-off (within this many seconds of leaving
     * the ground), or well clear of it (this high, m). So a little climb on an
     * approach, to get back onto the glide slope, leaves it down.
     */
    takeOffSeconds: 30,
    clearHeight: 300,
    /** Always up above the gear's limit speed plus this (m/s): faster than it may be lowered. */
    overSpeedMargin: 10,
  },
  extend: {
    /** Descending at least this fast (m/s), no faster than the flaps' limit plus this (m/s). */
    minSinkRate: 0.3,
    speedAboveFlapLimit: 25,
    /** Low over anything: below this height above the ground or sea (m). */
    belowHeight: 60,
    /** Near a base: within this distance of its runway or deck, and below this height above it (m). */
    nearBaseDistance: 3_000,
    nearBaseHeight: 300,
  },
} as const;

/** Moves the gear towards up or down by the automatic rules. Call once per physics step, before ground contact. */
export function stepLandingGear(state: AircraftState, spec: AircraftClassSpec, ground: GroundQuery, dt: number, bases: readonly BaseDefinition[] = BASES): void {
  // Old types' fixed gear never moves.
  if (spec.airframe.fixedGear) {
    state.gearPosition = 1;
    return;
  }
  const command = gearCommand(state, spec, ground, bases);
  if (command === null) return;
  const travel = dt / LANDING_GEAR_CONFIG.travelTime;
  state.gearPosition += Math.max(-travel, Math.min(travel, command - state.gearPosition));
}

/**
 * How much gear drag to add for this gear position: none for fixed gear,
 * whose drag is already in the airframe's zero-lift drag figure.
 */
export function gearDragFraction(spec: AircraftClassSpec, gearPosition: number): number {
  return spec.airframe.fixedGear ? 0 : gearPosition;
}

/** Whether the wheels are down far enough to land on. */
export function gearLocked(state: Readonly<AircraftState>): boolean {
  return state.gearPosition >= LANDING_GEAR_CONFIG.lockedPosition;
}

/** 1 = lower it, 0 = raise it, null = leave it where it is. */
function gearCommand(state: Readonly<AircraftState>, spec: AircraftClassSpec, ground: GroundQuery, bases: readonly BaseDefinition[]): 0 | 1 | null {
  if (state.onGround || state.catapult !== 'none' || state.hookEngaged || state.barrierEngaged) return 1;
  const p = state.position;
  const wheelHeight = p.y - groundClearance(spec) - ground.heightAt(p.x, p.z);
  const r = LANDING_GEAR_CONFIG.retract;
  const e = LANDING_GEAR_CONFIG.extend;
  const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
  const gearLimitSpeed = spec.flaps.maxExtensionSpeed + e.speedAboveFlapLimit;
  if (speed > gearLimitSpeed + r.overSpeedMargin) return 0;
  const climbingAway = state.airborneTime >= r.afterAirborneSeconds && wheelHeight > r.minHeight && state.velocity.y > r.minClimbRate;
  if (climbingAway && (state.airborneTime < r.takeOffSeconds || wheelHeight > r.clearHeight)) return 0;

  if (state.velocity.y > -e.minSinkRate || speed > gearLimitSpeed) return null;
  if (wheelHeight < e.belowHeight) return 1;
  for (const base of bases) {
    const c = base.runway.center;
    if (p.y - c.y < e.nearBaseHeight && Math.hypot(p.x - c.x, p.z - c.z) < e.nearBaseDistance + base.runway.length / 2) return 1;
  }
  return null;
}

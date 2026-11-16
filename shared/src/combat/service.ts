import type { AircraftClassSpec } from '../config/aircraftClasses';
import { SERVICE_CONFIG } from '../config/weapons';
import { friendlyBaseAt, type BaseDefinition } from '../config/world';
import type { AircraftState } from '../flight/AircraftState';
import type { Team } from '../types/team';
import { createGunState, fullAmmo, type GunState } from './guns';

/**
 * Rearming and repair. Land at one of your team's bases (an island airfield
 * or your carrier), come to a stop, idle the engine, and the ground crew
 * reloads the guns and patches the hull over a few seconds. Moving off or
 * opening the throttle interrupts them; they start again when you stop.
 *
 * Plain rules on plain data, so the Phase 5 server runs the same code.
 */
export interface ServiceStatus {
  /** The base being serviced at, or null. */
  base: BaseDefinition | null;
  /** 0-1 through the current service. */
  progress: number;
}

export function createServiceStatus(): ServiceStatus {
  return { base: null, progress: 0 };
}

/** What happened this step, for the HUD. */
export type ServiceEvent = 'started' | 'interrupted' | 'completed' | null;

/** True if the aircraft has anything to rearm or repair. */
export function needsService(state: Readonly<AircraftState>, spec: AircraftClassSpec, guns: Readonly<GunState>): boolean {
  return guns.ammo < fullAmmo(spec) || state.hullHealth < spec.combat.maxHullHealth;
}

/**
 * One step of servicing. Progress only advances while the aircraft is on the
 * ground at a friendly base, stopped, at idle, intact and in need of
 * service. On completion the guns are full and cold and the hull repaired.
 */
export function stepService(
  status: ServiceStatus,
  state: AircraftState,
  spec: AircraftClassSpec,
  guns: GunState,
  team: Team,
  dt: number,
): ServiceEvent {
  const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  const base =
    !state.crashed && state.onGround && groundSpeed < SERVICE_CONFIG.maxGroundSpeed && state.throttle <= SERVICE_CONFIG.maxThrottle
      ? friendlyBaseAt(team, state.position.x, state.position.z)
      : null;

  if (!base || !needsService(state, spec, guns)) {
    const wasServicing = status.base !== null && status.progress > 0;
    status.base = null;
    status.progress = 0;
    return wasServicing ? 'interrupted' : null;
  }

  const started = status.base === null;
  status.base = base;
  status.progress = Math.min(1, status.progress + dt / SERVICE_CONFIG.durationSeconds);
  if (status.progress < 1) return started ? 'started' : null;

  Object.assign(guns, createGunState(spec));
  state.hullHealth = spec.combat.maxHullHealth;
  status.base = null;
  status.progress = 0;
  return 'completed';
}

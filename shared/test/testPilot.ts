import {
  SIMULATION_CONFIG,
  createFlatGround,
  getAttitude,
  neutralControls,
  sanitizeControls,
  stepAircraft,
  type AircraftClassSpec,
  type AircraftState,
  type Attitude,
  type FlightControls,
  type GroundQuery,
  type RunwayDefinition,
} from '../src/index';

/*
 * Test-pilot helpers: drive the real flight model with scripted control
 * inputs and simple feedback controllers, the way a test pilot flies a
 * scripted manoeuvre. Nothing here changes the physics; it only chooses
 * stick positions.
 */

export const STEP = 1 / SIMULATION_CONFIG.physicsHz;
/**
 * The flat-ground tests' runway: at the origin, facing north (+z), so take-off
 * runs, approaches and stopping distances read straight off z. Independent of
 * the map's runways, which can move and turn.
 */
export const TEST_RUNWAY: RunwayDefinition = { id: 'test-runway', center: { x: 0, y: 0, z: 0 }, headingDegrees: 0, length: 1_200, width: 60 };

export const GROUND = createFlatGround([TEST_RUNWAY]);

export interface PilotView {
  readonly state: AircraftState;
  readonly attitude: Attitude;
  /** Seconds since the manoeuvre started. */
  readonly time: number;
  /** Pilot-convention body rates (deg/s): nose up, nose right, roll right. */
  readonly pitchRateDeg: number;
  readonly rollRateDeg: number;
}

export type Pilot = (view: PilotView) => Partial<FlightControls>;

/**
 * Flies for up to `seconds`, asking `pilot` for controls every physics step.
 * Stops early when `until` returns true or the aircraft crashes.
 * Returns the elapsed time. Flies over flat ground unless given another.
 */
export function fly(
  state: AircraftState,
  spec: AircraftClassSpec,
  seconds: number,
  pilot: Pilot,
  until?: (view: PilotView) => boolean,
  ground: GroundQuery = GROUND,
): number {
  const attitude = getAttitude(state.orientation);
  const controls: FlightControls = neutralControls();
  let time = 0;
  while (time < seconds && !state.crashed) {
    getAttitude(state.orientation, attitude);
    const view: PilotView = {
      state,
      attitude,
      time,
      pitchRateDeg: (-state.angularVelocity.x * 180) / Math.PI,
      rollRateDeg: (-state.angularVelocity.z * 180) / Math.PI,
    };
    if (until?.(view)) break;
    Object.assign(controls, neutralControls(), { throttle: state.throttle }, pilot(view));
    stepAircraft(state, sanitizeControls(controls), spec, ground, STEP);
    time += STEP;
  }
  return time;
}

const clamp = (value: number, limit = 1) => Math.max(-limit, Math.min(limit, value));

/** Signed smallest difference between two angles in degrees, in (-180, 180]. */
export function angleDifference(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

/** Aileron input that rolls to and holds a bank angle (deg). */
export function rollToBank(view: PilotView, targetBankDeg: number): number {
  return clamp(angleDifference(targetBankDeg, view.attitude.bankDeg) / 25 - view.rollRateDeg / 120);
}

/** Elevator input that holds a nose attitude above the horizon (deg). */
export function holdPitchAttitude(view: PilotView, targetPitchDeg: number): number {
  return clamp((targetPitchDeg - view.attitude.pitchDeg) / 8 - view.pitchRateDeg / 25);
}

/** Elevator input that holds a vertical speed (m/s); positive = climb. */
export function holdVerticalSpeed(view: PilotView, targetVerticalSpeed: number): number {
  return clamp((targetVerticalSpeed - view.state.velocity.y) / 6 - view.pitchRateDeg / 30);
}

export function heightAboveGround(state: AircraftState): number {
  return state.position.y - GROUND.heightAt(state.position.x, state.position.z);
}

export function horizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

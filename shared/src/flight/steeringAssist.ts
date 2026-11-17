import type { AircraftClassSpec } from '../config/aircraftClasses';
import type { Vec3 } from '../types/vector';
import { vec3 } from '../math/vec3';
import type { AircraftState } from './AircraftState';
import { DEFAULT_DIRECTION_PILOT, steerTowards, type DirectionPilotTuning, type StickInputs } from './directionPilot';

/**
 * Car-like steering for the keyboard: left/right TURNS the aircraft instead
 * of just rolling it. Hold A or D and it banks and pulls into the tightest
 * turn it can hold level; let go and it rolls the wings level and holds its
 * height. Up/down stays direct pitch.
 *
 * It's the direction pilot with a target that leads the flight path
 * sideways while a turn is held, and sits straight ahead of it otherwise.
 * Height is held by remembering the climb angle when the pitch keys are
 * let go (snapped to level flight when that's within a few degrees).
 */
export interface SteeringAssistMemory {
  /** Climb angle to hold (rad), or null while the pilot is pitching by hand. */
  holdClimb: number | null;
}

export function createSteeringAssistMemory(): SteeringAssistMemory {
  return { holdClimb: 0 };
}

export const STEERING_ASSIST_CONFIG = {
  /** Full left/right puts the target this far round from the flight path (deg): enough to command the hardest turn. */
  leadDeg: 75,
  /** Climb angles closer to level than this are held as level flight (deg). */
  levelSnapDeg: 4,
  /** Steepest climb or dive it will hold by itself (deg). */
  maxHoldDeg: 30,
  /**
   * Letting go mid-turn: aim this many seconds of the current turn rate
   * BACK from the flight path, so the roll-out stops the turn close to where
   * the key was released instead of carrying on round.
   */
  rollOutAnticipation: 0.7,
  maxAnticipationDeg: 30,
} as const;

/** Tuned for steering rather than aiming: smooth roll-out, no rudder fine-aiming, aim with the flight path. */
const ASSIST_TUNING: DirectionPilotTuning = { ...DEFAULT_DIRECTION_PILOT, aimWithNose: false, rollGain: 4.2, turnAccelPerRadG: 9 };

const target = vec3();

/**
 * @param turn -1 (full left) to 1 (full right).
 * @param pitchByHand true while the pilot holds a pitch key: the assist then leaves height alone and forgets its hold.
 */
export function steerWithTurnInput(
  state: Readonly<AircraftState>,
  spec: AircraftClassSpec,
  turn: number,
  pitchByHand: boolean,
  memory: SteeringAssistMemory,
  out: StickInputs,
): StickInputs {
  const c = STEERING_ASSIST_CONFIG;
  const v = state.velocity;
  const speed = Math.hypot(v.x, v.y, v.z);
  const heading = speed > 5 ? Math.atan2(v.x, v.z) : headingOfNose(state);
  const climb = speed > 5 ? Math.asin(Math.max(-1, Math.min(1, v.y / speed))) : 0;

  if (pitchByHand || state.onGround) memory.holdClimb = null;
  else if (memory.holdClimb === null) {
    const limit = (c.maxHoldDeg * Math.PI) / 180;
    memory.holdClimb = Math.abs(climb) < (c.levelSnapDeg * Math.PI) / 180 ? 0 : Math.max(-limit, Math.min(limit, climb));
  }
  const wantClimb = memory.holdClimb ?? climb;
  const steer = Math.max(-1, Math.min(1, turn));
  // Heading rate from the sideways acceleration: d(heading)/dt = (vz ax - vx az) / (vx^2 + vz^2).
  const flat = v.x * v.x + v.z * v.z;
  const headingRate = flat > 25 ? (v.z * state.acceleration.x - v.x * state.acceleration.z) / flat : 0;
  const limit = (c.maxAnticipationDeg * Math.PI) / 180;
  const anticipate = Math.abs(steer) < 0.05 ? Math.max(-limit, Math.min(limit, headingRate * c.rollOutAnticipation)) : 0;
  const wantHeading = heading + steer * ((c.leadDeg * Math.PI) / 180) - anticipate;
  setDirection(target, wantHeading, wantClimb);
  return steerTowards(state, spec, target, out, ASSIST_TUNING);
}

function setDirection(out: Vec3, heading: number, climb: number): void {
  out.x = Math.cos(climb) * Math.sin(heading);
  out.y = Math.sin(climb);
  out.z = Math.cos(climb) * Math.cos(heading);
}

function headingOfNose(state: Readonly<AircraftState>): number {
  const q = state.orientation;
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
}

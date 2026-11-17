import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PHYSICS_CONSTANTS } from '../config/simulation';
import { inverseRotateVec3, rotateVec3 } from '../math/quat';
import { crossVec3, dotVec3, lengthVec3, normalizeVec3, scaleVec3, setVec3, vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';
import type { AircraftState } from './AircraftState';
import { getAttitude } from './attitude';

/**
 * "Fly towards that direction" pilot: turns a desired world direction into
 * pitch, roll and yaw inputs. Mouse flight uses it now (the mouse sets the
 * direction), and Phase 7's AI pilots will use it too.
 *
 * It works the way a pilot thinks, by POINTING THE LIFT VECTOR:
 *
 *   1. Choose a turning acceleration towards the target, perpendicular to
 *      the flight path, bigger the further off the target is.
 *   2. Lift must provide that acceleration AND hold the aircraft up against
 *      gravity:  lift / mass = a_turn + g * up.
 *   3. Roll until the wings' lift axis points along that vector.
 *   4. Pull exactly the angle of attack that makes that much lift, using the
 *      aircraft's own lift curve.
 *
 * With the target dead ahead, a_turn is zero and lift is just "1 g up", so
 * it flies wings-level at constant height without a special case. Turning,
 * it banks just enough to hold height. For a target far below, it rolls
 * inverted and pulls (a split-S), as real pilots do.
 *
 * An angle-of-attack limiter eases off before the stall, so mouse flying
 * can't stall the aircraft by accident (the keyboard still can).
 */
export interface DirectionPilotTuning {
  /** Turning acceleration commanded per radian the target is off the flight path (in g). */
  readonly turnAccelPerRadG: number;
  /** Largest turning acceleration commanded (in g); the g-limit and AoA limiter cap it further. */
  readonly maxTurnAccelG: number;
  /** Roll input per radian of error between the wings' lift axis and the wanted lift direction. */
  readonly rollGain: number;
  readonly rollRateDamping: number;
  readonly pitchRateDamping: number;
  /** Extra pitch input per g of shortfall between wanted and actual load factor. */
  readonly loadFeedback: number;
  /** Rudder per unit of sideways target offset; used only within a few degrees of the target. */
  readonly yawGain: number;
  readonly yawRateDamping: number;
  /** Back pressure fades out over this many degrees below the critical angle of attack. */
  readonly aoaMarginDeg: number;
  /** Strongest push allowed (negative g is uncomfortable; rolling and pulling is better). */
  readonly maxPush: number;
  /**
   * Point the NOSE (and so the guns) at the target, rather than the flight
   * path. The nose rides a few degrees above the path (the angle of attack),
   * so steering the path onto a target leaves the guns shooting over it.
   */
  readonly aimWithNose: boolean;
}

/**
 * Tuned for quick direction changes (your feedback: mouse turns were too
 * slow): it pulls hard for even a modest aim error, uses the wing up to 2
 * degrees short of the stall, and rolls in fast.
 */
export const DEFAULT_DIRECTION_PILOT: DirectionPilotTuning = {
  turnAccelPerRadG: 16,
  maxTurnAccelG: 8,
  rollGain: 5,
  rollRateDamping: 0.14,
  pitchRateDamping: 0.45,
  loadFeedback: 0.3,
  yawGain: 2,
  yawRateDamping: 0.3,
  aoaMarginDeg: 2,
  maxPush: 0.5,
  aimWithNose: true,
};

export interface StickInputs {
  pitch: number;
  roll: number;
  yaw: number;
}

const DEG = Math.PI / 180;
const clamp = (value: number, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const BODY_FORWARD: Vec3 = { x: 0, y: 0, z: 1 };
const nose = vec3();
const BODY_RIGHT: Vec3 = { x: 1, y: 0, z: 0 };
// Scratch vectors.
const target = vec3();
const path = vec3();
const sideways = vec3();
const lateral = vec3();
const vertical = vec3();
const lift = vec3();
const liftBody = vec3();
const targetBody = vec3();
const right = vec3();
const attitude = { headingDeg: 0, pitchDeg: 0, bankDeg: 0 };

export function steerTowards(
  state: Readonly<AircraftState>,
  spec: AircraftClassSpec,
  targetDirection: Readonly<Vec3>,
  out: StickInputs,
  tuning: DirectionPilotTuning = DEFAULT_DIRECTION_PILOT,
): StickInputs {
  const g = PHYSICS_CONSTANTS.gravity;
  if (normalizeVec3(target, targetDirection) === 0) {
    out.pitch = out.roll = out.yaw = 0;
    return out;
  }
  // Pilot-convention body rates (rad/s): nose up, nose right, roll right.
  const pitchRate = -state.angularVelocity.x;
  const yawRate = state.angularVelocity.y;
  const rollRate = -state.angularVelocity.z;
  inverseRotateVec3(targetBody, state.orientation, target);

  if (state.onGround) return steerOnGround(state, targetBody, pitchRate, out);

  // Flight path direction (the nose, if almost stationary).
  const speed = lengthVec3(state.velocity);
  if (speed > 5) setVec3(path, state.velocity.x / speed, state.velocity.y / speed, state.velocity.z / speed);
  else rotateVec3(path, state.orientation, BODY_FORWARD);
  // Aiming with the nose: steer the flight path to where it has to be for
  // the nose to sit on the target, i.e. the target shifted by (path - nose).
  if (tuning.aimWithNose && speed > 5) {
    rotateVec3(nose, state.orientation, BODY_FORWARD);
    setVec3(target, target.x + path.x - nose.x, target.y + path.y - nose.y, target.z + path.z - nose.z);
    normalizeVec3(target, target);
    inverseRotateVec3(targetBody, state.orientation, target);
  }
  const cosOff = clamp(dotVec3(target, path));
  const angleOff = Math.acos(cosOff);

  // What the wing can deliver right now: lift at the AoA limiter's ceiling,
  // as a load factor, also capped by the g-limit.
  const density = state.telemetry.airDensity || PHYSICS_CONSTANTS.seaLevelAirDensity;
  const airspeed = Math.max(state.telemetry.airspeed, 20);
  const dynamicPressure = 0.5 * density * airspeed * airspeed;
  const flaps = state.flapPosition;
  const cl0 = spec.aero.zeroAngleLiftCoefficient + spec.flaps.liftIncrement * flaps;
  const critical = spec.aero.criticalAngleOfAttackDeg - spec.flaps.criticalAngleReductionDeg * flaps;
  const aoaCeiling = (critical - tuning.aoaMarginDeg) * DEG;
  const clCeiling = cl0 + spec.aero.liftCurveSlope * aoaCeiling;
  const availableLoad = Math.min(spec.handling.gLimit, (clCeiling * dynamicPressure * spec.wingArea) / (spec.mass * g));

  // 1. Turning acceleration towards the target, perpendicular to the path.
  // The error is split into HEADING (horizontal, wrapped to +/-180 deg) and
  // ELEVATION (vertical). A level target behind is then a pure heading
  // problem, a level banked turn, rather than a loop or a dive decided by
  // tiny wobbles of the flight path.
  const pathHeading = Math.atan2(path.x, path.z);
  const targetHeading = Math.atan2(target.x, target.z);
  let headingError = targetHeading - pathHeading;
  headingError -= 2 * Math.PI * Math.round(headingError / (2 * Math.PI));
  if (Math.abs(headingError) > Math.PI - 0.02) headingError = Math.PI - 0.02; // dead astern: turn right
  // Heading means little for targets near straight up/down; weight it by how horizontal the target is.
  headingError *= Math.hypot(target.x, target.z);
  const elevationError = Math.asin(clamp(target.y)) - Math.asin(clamp(path.y));

  // Path frame: lateral = horizontal right of the path; vertical = "up", perpendicular to the path.
  setVec3(lateral, path.z, 0, -path.x); // cross(up, path) in left-handed axes
  if (normalizeVec3(lateral, lateral) === 0) {
    rotateVec3(right, state.orientation, BODY_RIGHT); // flying straight up or down
    setVec3(lateral, right.x, 0, right.z);
    normalizeVec3(lateral, lateral);
  }
  crossVec3(vertical, path, lateral);

  // Capped at what's achievable while still holding 1 g against gravity:
  // a_turn <= g * sqrt(n^2 - 1). Banking for an impossible turn would just
  // trade height for nothing.
  const perRad = tuning.turnAccelPerRadG * g;
  setVec3(sideways, lateral.x * headingError * perRad + vertical.x * elevationError * perRad, lateral.y * headingError * perRad + vertical.y * elevationError * perRad, lateral.z * headingError * perRad + vertical.z * elevationError * perRad);
  const commanded = lengthVec3(sideways);
  const achievableTurn = g * Math.sqrt(Math.max(0, availableLoad * availableLoad - 1));
  const turnAccel = Math.min(commanded, tuning.maxTurnAccelG * g, achievableTurn);
  if (commanded > 0) scaleVec3(sideways, sideways, turnAccel / commanded);

  // 2. Wanted lift (per unit mass) = turn + 1 g up, minus any part along the path.
  setVec3(lift, sideways.x, sideways.y + g, sideways.z);
  const along = dotVec3(lift, path);
  setVec3(lift, lift.x - path.x * along, lift.y - path.y * along, lift.z - path.z * along);
  const liftAccel = lengthVec3(lift);

  // 3. Roll the lift axis (body up) onto the wanted lift direction.
  inverseRotateVec3(liftBody, state.orientation, lift);
  const rollError = Math.atan2(liftBody.x, liftBody.y); // positive: wanted lift is to the right
  out.roll = clamp(rollError * tuning.rollGain - rollRate * tuning.rollRateDamping);

  // 4. Angle of attack that gives that lift: CL = n W / (q S), alpha = (CL - CL0) / slope,
  // never above the limiter's ceiling.
  const wantedCl = (spec.mass * liftAccel) / (dynamicPressure * spec.wingArea);
  const wantedAoa = Math.min((wantedCl - cl0) / spec.aero.liftCurveSlope, aoaCeiling);
  // Convert that AoA into stick, inverting the flight model's pitch law:
  // stick moves the trimmed AoA linearly from trim to the full-stick AoA, and
  // its authority fades a little above the reference speed.
  const p = spec.handling.pitch;
  const trim = (p.trimAngleOfAttackDeg + spec.flaps.trimShiftDeg * flaps) * DEG;
  const stickRange = p.fullStickAngleOfAttackDeg * DEG - trim;
  const pressureRatio = dynamicPressure / (0.5 * PHYSICS_CONSTANTS.seaLevelAirDensity * spec.handling.referenceSpeed ** 2);
  const authority = pressureRatio > 1 ? 1 / (1 + 0.5 * (pressureRatio - 1)) : 1;
  let pitch = (wantedAoa - trim) / stickRange / authority;
  // Close the loop on g, as a pilot does by feel: the open-loop estimate
  // undershoots in a sustained turn (pitch damping eats some of the AoA).
  const loadError = liftAccel / g - state.telemetry.loadFactor;
  pitch += loadError * tuning.loadFeedback;
  // Only pull fully once the wings are rolled the right way; push gently if lift is wanted "downwards".
  pitch *= Math.cos(clamp(rollError, -Math.PI, Math.PI));
  pitch -= pitchRate * tuning.pitchRateDamping;

  // Angle-of-attack limiter: fade back pressure out as AoA nears critical
  // (catches dynamic overshoot past the commanded AoA).
  const aoa = state.telemetry.angleOfAttack / DEG;
  if (pitch > 0) pitch *= clamp((critical - aoa) / tuning.aoaMarginDeg, 0, 1);
  out.pitch = clamp(pitch, -tuning.maxPush, 1);

  // Rudder: fine sideways corrections only, within a few degrees of the target.
  const nearTarget = clamp(1 - angleOff / (6 * DEG), 0, 1);
  out.yaw = clamp(targetBody.x * tuning.yawGain * nearTarget - yawRate * tuning.yawRateDamping);
  return out;
}

/**
 * On the ground: steer the nose wheel with the rudder, keep the wings level,
 * and raise the nose gently towards the target's elevation (at most 10
 * degrees, to avoid scraping the tail).
 */
function steerOnGround(state: Readonly<AircraftState>, targetBody: Vec3, pitchRate: number, out: StickInputs): StickInputs {
  getAttitude(state.orientation, attitude);
  const targetElevation = Math.atan2(targetBody.y, Math.hypot(targetBody.x, targetBody.z)) / DEG + attitude.pitchDeg;
  const wantedPitch = clamp(targetElevation, 0, 10);
  out.pitch = clamp((wantedPitch - attitude.pitchDeg) / 8 - pitchRate * 0.5);
  out.roll = clamp(-attitude.bankDeg / 20);
  out.yaw = clamp(Math.atan2(targetBody.x, targetBody.z) * 3);
  return out;
}

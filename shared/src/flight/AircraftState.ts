import type { AircraftClassId, AircraftClassSpec } from '../config/aircraftClasses';
import { PRIMITIVE_GROUND_CLEARANCE } from '../config/airframe';
import type { RunwayDefinition, SpawnPoint } from '../config/world';
import { copyQuat, multiplyQuat, quatFromAxisAngle, quatFromHeading, quatIdentity, type Quat } from '../math/quat';
import { copyVec3, vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';

/**
 * Read-outs computed by the flight model each step. They are not needed to
 * continue the simulation, but the HUD, the tests and later the AI all use
 * them.
 */
export interface FlightTelemetry {
  /** True airspeed (m/s). */
  airspeed: number;
  /** Angle between the wing chord (nose) and the airflow, in the pitch plane (rad). Positive = nose above the flight path. */
  angleOfAttack: number;
  /** Angle of the airflow from the side (rad). Positive = the aircraft is slipping to its right. */
  sideslip: number;
  liftCoefficient: number;
  dragCoefficient: number;
  /** Aerodynamic and engine forces this step (N). */
  lift: number;
  drag: number;
  thrust: number;
  /** "g" the pilot feels along the aircraft's up axis: 1 in level flight, 0 in free fall. */
  loadFactor: number;
  /** True while the wing is substantially stalled. */
  stalled: boolean;
  /** Approaching the critical angle of attack: drives the stall-warning horn. */
  stallWarning: boolean;
  /** Air density at the current altitude (kg/m^3). */
  airDensity: number;
}

export interface AircraftState {
  classId: AircraftClassId;
  /** Centre of mass in world space (m). */
  position: Vec3;
  /** World-space velocity (m/s). */
  velocity: Vec3;
  /** World-space acceleration from the most recent step (m/s^2). */
  acceleration: Vec3;
  /** Rotation from body frame to world frame. */
  orientation: Quat;
  /** Body-frame angular velocity (rad/s) about the X (right), Y (up) and Z (nose) axes. */
  angularVelocity: Vec3;
  /** Actual engine setting, 0-1. Lags the throttle lever by the engine's spool time. */
  throttle: number;
  /**
   * How separated the airflow over the wing is: 0 = attached, 1 = fully stalled.
   * Part of the state (not just telemetry) because stall onset and recovery
   * take time, and recovery happens at a lower AoA than onset (hysteresis).
   */
  flowSeparation: number;
  /** Actual flap deflection, 0 (up) to 1 (fully down). Follows the lever at the flaps' travel speed. */
  flapPosition: number;
  hullHealth: number;
  /** Increments on every touchdown (wheels meeting the ground after being airborne). */
  touchdownCount: number;
  /** Vertical speed of the most recent touchdown (m/s, positive = sinking). */
  lastTouchdownSinkRate: number;
  /** Hull damage that touchdown caused (hit points). */
  lastTouchdownDamage: number;
  /** Any wheel touching the ground. */
  onGround: boolean;
  /** Seconds since a wheel last touched the ground (0 while on the ground). */
  airborneTime: number;
  crashed: boolean;
  /** Why the aircraft crashed (for the HUD and tests), or null. */
  crashReason: string | null;
  telemetry: FlightTelemetry;
}

function emptyTelemetry(): FlightTelemetry {
  return {
    airspeed: 0,
    angleOfAttack: 0,
    sideslip: 0,
    liftCoefficient: 0,
    dragCoefficient: 0,
    lift: 0,
    drag: 0,
    thrust: 0,
    loadFactor: 1,
    stalled: false,
    stallWarning: false,
    airDensity: 0,
  };
}

/** A fresh, undamaged aircraft at rest at the origin; the factories below position it. */
function baseState(spec: AircraftClassSpec): AircraftState {
  return {
    classId: spec.id,
    position: vec3(),
    velocity: vec3(),
    acceleration: vec3(),
    orientation: quatIdentity(),
    angularVelocity: vec3(),
    throttle: 0,
    flowSeparation: 0,
    flapPosition: 0,
    hullHealth: spec.combat.maxHullHealth,
    touchdownCount: 0,
    lastTouchdownSinkRate: 0,
    lastTouchdownDamage: 0,
    onGround: false,
    // Factories that start in the air have been "airborne for a while", so their first touchdown counts.
    airborneTime: 60,
    crashed: false,
    crashReason: null,
    telemetry: emptyTelemetry(),
  };
}

/** An aircraft at rest with its wheels on the ground at a spawn point, engine stopped. */
export function createParkedState(spec: AircraftClassSpec, spawn: SpawnPoint): AircraftState {
  const state = baseState(spec);
  const clearance = PRIMITIVE_GROUND_CLEARANCE * spec.airframeScale;
  // Start with the springs already compressed to their resting deflection, so
  // the aircraft doesn't drop and bounce on spawn.
  const restingSink = spec.landingGear.staticDeflection * spec.airframeScale;
  state.position = vec3(spawn.position.x, spawn.position.y + clearance - restingSink, spawn.position.z);
  quatFromHeading(state.orientation, (spawn.headingDegrees * Math.PI) / 180);
  state.onGround = true;
  state.airborneTime = 0;
  return state;
}

/** A level aircraft in flight, heading `headingDegrees` at `speed` m/s. Used by tests and air starts. */
export function createAirborneState(spec: AircraftClassSpec, position: Vec3, headingDegrees: number, speed: number, throttle = 0.7): AircraftState {
  const state = baseState(spec);
  const heading = (headingDegrees * Math.PI) / 180;
  state.position = vec3(position.x, position.y, position.z);
  state.velocity = vec3(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
  quatFromHeading(state.orientation, heading);
  state.throttle = throttle;
  return state;
}

export interface ApproachSetup {
  /** Distance before the runway threshold to start (m). */
  distanceFromThreshold: number;
  /** Glide-slope angle (deg). 3 is standard. */
  glideSlopeDeg: number;
  /** How far past the threshold the glide slope meets the runway (m). Matches the PAPI lights. */
  aimPointPastThreshold: number;
  speed: number;
  throttle: number;
  flaps: number;
}

/**
 * Established on final approach: lined up with the runway, on the glide slope,
 * descending along it at `speed`, nose a few degrees up. Used for landing
 * practice (the "L" key) and the landing tests.
 */
export function createApproachState(spec: AircraftClassSpec, runway: RunwayDefinition, setup: ApproachSetup): AircraftState {
  const state = baseState(spec);
  const heading = (runway.headingDegrees * Math.PI) / 180;
  const glide = (setup.glideSlopeDeg * Math.PI) / 180;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const alongFromCenter = -runway.length / 2 - setup.distanceFromThreshold;
  const heightOnSlope = (setup.distanceFromThreshold + setup.aimPointPastThreshold) * Math.tan(glide);
  state.position = vec3(
    runway.center.x + forwardX * alongFromCenter,
    runway.center.y + heightOnSlope + PRIMITIVE_GROUND_CLEARANCE * spec.airframeScale,
    runway.center.z + forwardZ * alongFromCenter,
  );
  state.velocity = vec3(forwardX * setup.speed * Math.cos(glide), -setup.speed * Math.sin(glide), forwardZ * setup.speed * Math.cos(glide));
  // Nose up 2 degrees: with the path 3 degrees down, that's a 5-degree angle of attack, typical with flaps.
  const yaw = quatFromHeading(quatIdentity(), heading);
  const noseUp = quatFromAxisAngle(quatIdentity(), { x: 1, y: 0, z: 0 }, (-2 * Math.PI) / 180);
  multiplyQuat(state.orientation, yaw, noseUp);
  state.throttle = setup.throttle;
  state.flapPosition = setup.flaps;
  return state;
}

/** Deep-copies `source` into `target` without allocating. Used to keep the previous step for render interpolation. */
export function copyAircraftState(target: AircraftState, source: Readonly<AircraftState>): AircraftState {
  target.classId = source.classId;
  copyVec3(target.position, source.position);
  copyVec3(target.velocity, source.velocity);
  copyVec3(target.acceleration, source.acceleration);
  copyQuat(target.orientation, source.orientation);
  copyVec3(target.angularVelocity, source.angularVelocity);
  target.throttle = source.throttle;
  target.flowSeparation = source.flowSeparation;
  target.flapPosition = source.flapPosition;
  target.hullHealth = source.hullHealth;
  target.touchdownCount = source.touchdownCount;
  target.lastTouchdownSinkRate = source.lastTouchdownSinkRate;
  target.lastTouchdownDamage = source.lastTouchdownDamage;
  target.onGround = source.onGround;
  target.airborneTime = source.airborneTime;
  target.crashed = source.crashed;
  target.crashReason = source.crashReason;
  Object.assign(target.telemetry, source.telemetry);
  return target;
}

export function cloneAircraftState(source: Readonly<AircraftState>): AircraftState {
  return copyAircraftState(
    { ...source, position: vec3(), velocity: vec3(), acceleration: vec3(), orientation: quatIdentity(), angularVelocity: vec3(), telemetry: emptyTelemetry() },
    source,
  );
}

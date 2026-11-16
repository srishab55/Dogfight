import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PHYSICS_CONSTANTS } from '../config/simulation';
import { integrateBodyAngularVelocity, inverseRotateVec3, rotateVec3 } from '../math/quat';
import { addScaledVec3, dotVec3, lengthVec3, scaleVec3, setVec3, vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';
import {
  applyFlaps,
  aspectRatio,
  availableThrust,
  dragCoefficient,
  groundEffectInducedDragFactor,
  groundEffectLiftFactor,
  liftCoefficient,
  stallAngles,
  updateFlowSeparation,
  wingSpan,
  type EffectiveAero,
} from './aerodynamics';
import type { AircraftState } from './AircraftState';
import type { FlightControls } from './FlightControls';
import type { GroundQuery } from './ground';
import { computeGroundContact, createGroundContactResult } from './groundContact';

/*
 * ─── The flight model ──────────────────────────────────────────────────────
 *
 * A simplified six-degree-of-freedom rigid body, advanced in fixed time steps.
 *
 * TRANSLATION: Newton's second law, a = F / m, with
 *   F = lift + drag + side force + thrust + gravity + ground contact.
 * Lift and drag depend on airspeed squared and on the angle of attack, so
 * the aircraft goes where its *velocity* points. The nose only drags the
 * velocity round gradually via lift and side force; it never steers the
 * aircraft directly.
 *
 * ROTATION: each axis responds to control-surface moments, aerodynamic
 * stability moments and aerodynamic damping, all scaling with dynamic
 * pressure (½ρV²). Controls are mushy when slow and crisp when fast:
 *   pitch: the tail acts as a spring pulling the nose towards a trimmed angle
 *          of attack; the elevator moves that target. Full back stick
 *          commands an AoA past the stall, so pulling too hard stalls.
 *   yaw:   the fin weathervanes the nose into the airflow; the rudder offsets it.
 *   roll:  ailerons against roll damping give a steady roll rate.
 * Handling is configured as response figures (frequency, damping ratio,
 * roll rate) at a reference speed, and converted to moments here. The
 * resulting angular *accelerations* are used directly, which is the same as
 * moment / inertia with the inertia already folded in.
 *
 * INTEGRATION: semi-implicit (symplectic) Euler. Velocities are updated
 * from forces first, then positions from the new velocities. Stable and
 * cheap at 60 Hz for the stiffness involved.
 */

const DEG_TO_RAD = Math.PI / 180;
/** Below this airspeed the airflow direction is noise, so angle of attack and sideslip are treated as zero (m/s). */
const MIN_AERODYNAMIC_SPEED = 2;
/** Angular damping floor (1/s), so a nearly stationary aircraft doesn't rotate forever. */
const MIN_ANGULAR_DAMPING = 0.4;
/** Stall warning starts this far below the critical angle of attack (rad), like a real stall horn. */
const STALL_WARNING_MARGIN = 2.5 * DEG_TO_RAD;
/** On the ground below this fraction of the reference speed, don't model a stall. */
const GROUND_STALL_SPEED_FRACTION = 0.3;
/** Height of the wing below the centre of mass, at airframe scale 1 (m). Used for ground effect. */
const WING_HEIGHT_BELOW_CENTRE = 0.38;
/** A touchdown only counts (and is graded) after at least this long airborne, so wheel skips on the take-off roll don't (s). */
const MIN_AIRBORNE_TIME_FOR_TOUCHDOWN = 1;
/** Hull damage from the hardest survivable landing, as a fraction of maximum hull. */
const MAX_HARD_LANDING_DAMAGE = 0.7;

// Scratch state, reused every step (the step allocates nothing).
const bodyVelocity = vec3();
const bodyForce = vec3();
const worldForce = vec3();
const bodyGroundTorque = vec3();
const worldUp = vec3();
const groundContact = createGroundContactResult();
const effectiveAero = {} as EffectiveAero;
const BODY_UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Advances `state` by `dt` seconds under `controls`. Mutates `state` in place.
 * Pure function of its inputs: the same state, controls and dt always give the
 * same result, which client prediction (Phase 5) depends on.
 */
export function stepAircraft(state: AircraftState, controls: Readonly<FlightControls>, spec: AircraftClassSpec, ground: GroundQuery, dt: number): void {
  if (state.crashed) return;

  const { handling, engine } = spec;
  const g = PHYSICS_CONSTANTS.gravity;
  const rho0 = PHYSICS_CONSTANTS.seaLevelAirDensity;

  // ── Engine: the actual setting follows the lever with a first-order lag (spool-up). ──
  state.throttle += (controls.throttle - state.throttle) * Math.min(1, dt / engine.spoolTime);

  // ── Air data ──
  // Exponential atmosphere: density halves roughly every 5.9 km.
  const density = rho0 * Math.exp(-Math.max(0, state.position.y) / PHYSICS_CONSTANTS.atmosphereScaleHeight);
  const densityRatio = density / rho0;
  // Airflow seen by the aircraft: velocity expressed in body axes (no wind yet).
  inverseRotateVec3(bodyVelocity, state.orientation, state.velocity);
  const airspeed = lengthVec3(bodyVelocity);
  const aerodynamic = airspeed > MIN_AERODYNAMIC_SPEED;
  // AoA: positive when the nose is above the flight path, i.e. the air comes from below (body velocity y < 0).
  const angleOfAttack = aerodynamic ? Math.atan2(-bodyVelocity.y, bodyVelocity.z) : 0;
  // Sideslip: positive when moving to the right of where the nose points.
  const sideslip = aerodynamic ? Math.atan2(bodyVelocity.x, Math.hypot(bodyVelocity.y, bodyVelocity.z)) : 0;
  const dynamicPressure = 0.5 * density * airspeed * airspeed;

  // ── Flaps: travel towards the lever at a fixed rate; the airflow blows them up above their limit speed. ──
  const flapTarget = airspeed > spec.flaps.maxExtensionSpeed ? 0 : controls.flaps;
  const flapTravel = dt / spec.flaps.travelTime;
  state.flapPosition += Math.max(-flapTravel, Math.min(flapTravel, flapTarget - state.flapPosition));
  // The wing as the flaps currently shape it: more camber, more drag, earlier stall.
  const aero = applyFlaps(effectiveAero, spec, state.flapPosition);

  // ── Ground effect: the cushion of air under a wing close to the ground ──
  const groundHeight = ground.heightAt(state.position.x, state.position.z);
  const wingHeight = state.position.y - groundHeight - WING_HEIGHT_BELOW_CENTRE * spec.airframeScale;
  const inducedDragFactor = groundEffectInducedDragFactor(wingHeight, wingSpan(spec));

  // ── Stall state ──
  const stallPossible = aerodynamic && !(state.onGround && airspeed < handling.referenceSpeed * GROUND_STALL_SPEED_FRACTION);
  state.flowSeparation = updateFlowSeparation(state.flowSeparation, angleOfAttack, aero, dt, stallPossible);
  const separation = state.flowSeparation;

  // ── Aerodynamic coefficients and forces ──
  const cl = liftCoefficient(angleOfAttack, separation, aero) * groundEffectLiftFactor(inducedDragFactor);
  const cd = dragCoefficient(cl, angleOfAttack, sideslip, separation, aero, aspectRatio(spec), inducedDragFactor);
  const cy = -aero.sideForceCoefficient * Math.sin(sideslip);
  const lift = dynamicPressure * spec.wingArea * cl;
  const drag = dynamicPressure * spec.wingArea * cd;
  const sideForce = dynamicPressure * spec.wingArea * cy;
  const thrust = state.throttle * availableThrust(engine, Math.max(0, bodyVelocity.z), densityRatio);

  setVec3(bodyForce, sideForce, 0, thrust); // side force along body X, thrust along the nose
  if (aerodynamic) {
    // Lift is perpendicular to the airflow within the aircraft's plane of
    // symmetry: rotate the flow direction (0, vy, vz) by 90 degrees to (0, vz, -vy).
    const flowInPlane = Math.hypot(bodyVelocity.y, bodyVelocity.z);
    if (flowInPlane > 1e-6) {
      bodyForce.y += (lift * bodyVelocity.z) / flowInPlane;
      bodyForce.z += (lift * -bodyVelocity.y) / flowInPlane;
    }
    // Drag acts straight against the airflow.
    addScaledVec3(bodyForce, bodyForce, bodyVelocity, -drag / airspeed);
  }
  rotateVec3(worldForce, state.orientation, bodyForce);
  worldForce.y -= spec.mass * g;

  // ── Ground contact ──
  computeGroundContact(state, spec, controls, ground, groundContact);
  addScaledVec3(worldForce, worldForce, groundContact.force, 1);
  const touchedDown = !state.onGround && groundContact.onGround && state.airborneTime >= MIN_AIRBORNE_TIME_FOR_TOUCHDOWN;
  state.onGround = groundContact.onGround;
  state.airborneTime = state.onGround ? 0 : state.airborneTime + dt;
  if (groundContact.crashReason !== null) {
    crash(state, groundContact.crashReason);
    return;
  }
  if (touchedDown) {
    registerTouchdown(state, spec, groundContact.impactSinkRate);
    if (state.crashed) return;
  }

  // ── Translation (semi-implicit Euler) ──
  scaleVec3(state.acceleration, worldForce, 1 / spec.mass);
  addScaledVec3(state.velocity, state.velocity, state.acceleration, dt);
  addScaledVec3(state.position, state.position, state.velocity, dt);

  // ── Rotation ──
  // Work in pilot terms (positive = nose up / nose right / roll right). In our
  // left-handed body axes those are rotations about -X, +Y and -Z respectively.
  let pitchRate = -state.angularVelocity.x;
  let yawRate = state.angularVelocity.y;
  let rollRate = -state.angularVelocity.z;

  const referenceSpeed = handling.referenceSpeed;
  // Dynamic pressure relative to the reference condition: 1 at referenceSpeed at sea level.
  const pressureRatio = dynamicPressure / (0.5 * rho0 * referenceSpeed * referenceSpeed);
  // Control authority grows with dynamic pressure, but more slowly above the
  // reference speed (rising stick forces at high speed).
  const controlPower = pressureRatio / (1 + 0.5 * Math.max(0, pressureRatio - 1));
  // Aerodynamic damping scales with density * airspeed.
  const dampingScale = densityRatio * (airspeed / referenceSpeed);

  // G-limit: back pressure fades out as the load factor passes the limit
  // (computed last step), standing in for the pilot's and airframe's limits.
  let pitchInput = controls.pitch;
  const lastLoad = state.telemetry.loadFactor;
  if (pitchInput > 0 && lastLoad > handling.gLimit) pitchInput *= Math.max(0, 1 - (lastLoad - handling.gLimit) / 1.5);
  if (pitchInput < 0 && lastLoad < -handling.negativeGLimit) pitchInput *= Math.max(0, 1 - (-handling.negativeGLimit - lastLoad) / 1.5);

  // Pitch: a damped "spring" towards the trimmed angle of attack.
  //   stiffness K = w^2, damping D = 2*zeta*w (standard second-order system)
  //   elevator authority chosen so full stick moves the target to fullStickAngleOfAttack.
  const p = handling.pitch;
  const pitchStiffness = p.frequency * p.frequency;
  // Lowering flaps re-trims to a higher hands-off AoA, so the aircraft settles near approach speed.
  const trimAoa = (p.trimAngleOfAttackDeg + spec.flaps.trimShiftDeg * state.flapPosition) * DEG_TO_RAD;
  const elevatorAuthority = pitchStiffness * Math.sin(p.fullStickAngleOfAttackDeg * DEG_TO_RAD - trimAoa);
  const pitchAccel =
    controlPower * elevatorAuthority * pitchInput * (1 - 0.5 * separation) // the tail sits in disturbed air when stalled
    - pressureRatio * pitchStiffness * Math.sin(angleOfAttack - trimAoa) // weathervane stability
    - pressureRatio * handling.stallPitchDown * separation * Math.sign(angleOfAttack) // stalled wing: nose drops
    - Math.max(MIN_ANGULAR_DAMPING, 2 * p.dampingRatio * p.frequency * dampingScale) * pitchRate;

  // Yaw: fin weathervaning plus rudder.
  const y = handling.yaw;
  const yawStiffness = y.frequency * y.frequency;
  const rudderAuthority = yawStiffness * Math.sin(y.fullRudderSideslipDeg * DEG_TO_RAD);
  const yawAccel =
    controlPower * rudderAuthority * controls.yaw
    + pressureRatio * yawStiffness * Math.sin(sideslip) // nose swings towards the airflow
    - Math.max(MIN_ANGULAR_DAMPING, 2 * y.dampingRatio * y.frequency * dampingScale) * yawRate;

  // Roll: ailerons against roll damping. Steady rate = authority / damping = maxRate at the reference speed.
  const rollDamping = 1 / handling.roll.responseTime;
  const aileronAuthority = handling.roll.maxRateDeg * DEG_TO_RAD * rollDamping;
  const rollAccel =
    controlPower * aileronAuthority * controls.roll * (1 - 0.6 * separation) // ailerons lose bite in a stall
    - pressureRatio * handling.dihedralEffect * Math.sin(sideslip) // dihedral: slipping right rolls left
    - Math.max(MIN_ANGULAR_DAMPING, rollDamping * dampingScale) * rollRate;

  // Ground torques, converted to body axes and divided by inertia.
  inverseRotateVec3(bodyGroundTorque, state.orientation, groundContact.torque);
  const inertia = spec.momentOfInertia;
  pitchRate += (pitchAccel - bodyGroundTorque.x / inertia.pitch) * dt;
  yawRate += (yawAccel + bodyGroundTorque.y / inertia.yaw) * dt;
  rollRate += (rollAccel - bodyGroundTorque.z / inertia.roll) * dt;

  setVec3(state.angularVelocity, -pitchRate, yawRate, -rollRate);
  integrateBodyAngularVelocity(state.orientation, state.angularVelocity, dt);

  // ── Telemetry ──
  // Load factor: (acceleration - gravity) along the aircraft's up axis, in g.
  rotateVec3(worldUp, state.orientation, BODY_UP);
  const loadFactor = (dotVec3(state.acceleration, worldUp) + g * worldUp.y) / g;
  const { positive, negative } = stallAngles(aero);
  const t = state.telemetry;
  t.airspeed = airspeed;
  t.angleOfAttack = angleOfAttack;
  t.sideslip = sideslip;
  t.liftCoefficient = cl;
  t.dragCoefficient = cd;
  t.lift = lift;
  t.drag = drag;
  t.thrust = thrust;
  t.loadFactor = loadFactor;
  t.stalled = separation > 0.5;
  t.stallWarning = stallPossible && !state.onGround && (angleOfAttack > positive - STALL_WARNING_MARGIN || angleOfAttack < negative + STALL_WARNING_MARGIN || t.stalled);
  t.airDensity = density;
}

/**
 * Grades a touchdown and applies hard-landing damage. Below `damageSinkRate`
 * it's free; above it, damage rises steeply (severity^1.5) to 70% of the hull
 * just below the crash threshold. Losing all hull health is a crash.
 */
function registerTouchdown(state: AircraftState, spec: AircraftClassSpec, sinkRate: number): void {
  const { damageSinkRate, maxSinkRate } = spec.landingGear;
  const severity = Math.max(0, Math.min(1, (sinkRate - damageSinkRate) / (maxSinkRate - damageSinkRate)));
  const damage = spec.combat.maxHullHealth * MAX_HARD_LANDING_DAMAGE * severity ** 1.5;
  state.touchdownCount++;
  state.lastTouchdownSinkRate = sinkRate;
  state.lastTouchdownDamage = damage;
  state.hullHealth = Math.max(0, state.hullHealth - damage);
  if (state.hullHealth <= 0) crash(state, 'destroyed by a hard landing');
}

function crash(state: AircraftState, reason: string): void {
  state.crashed = true;
  state.crashReason = reason;
  setVec3(state.velocity, 0, 0, 0);
  setVec3(state.acceleration, 0, 0, 0);
  setVec3(state.angularVelocity, 0, 0, 0);
  state.throttle = 0;
  state.hullHealth = 0;
  // Clear the read-outs so the HUD doesn't show the last airborne values.
  Object.assign(state.telemetry, {
    airspeed: 0,
    angleOfAttack: 0,
    sideslip: 0,
    liftCoefficient: 0,
    lift: 0,
    drag: 0,
    thrust: 0,
    loadFactor: 1,
    stalled: false,
    stallWarning: false,
  });
}

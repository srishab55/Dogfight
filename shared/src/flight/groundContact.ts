import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PHYSICS_CONSTANTS } from '../config/simulation';
import { SURFACE_FRICTION } from '../config/world';
import { rotateVec3 } from '../math/quat';
import { addVec3, crossVec3, dotVec3, scaleVec3, setVec3, vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';
import type { AircraftState } from './AircraftState';
import type { FlightControls } from './FlightControls';
import type { GroundQuery } from './ground';

export interface GroundContactResult {
  /** Total ground force on the aircraft, world frame (N). */
  readonly force: Vec3;
  /** Total ground torque about the centre of mass, world frame (N*m). */
  readonly torque: Vec3;
  onGround: boolean;
  /** Fastest downward speed of any wheel touching the ground this step (m/s, positive = sinking). */
  impactSinkRate: number;
  /** A main wheel is rolling across a carrier's arrestor wires, or the lowered hook is down among them (a hooked aircraft can catch one). */
  onArrestorWires: boolean;
  /** A main wheel has rolled into a carrier's crash barrier. */
  onBarrier: boolean;
  /** Set if this contact destroys the aircraft. */
  crashReason: string | null;
}

export function createGroundContactResult(): GroundContactResult {
  return { force: vec3(), torque: vec3(), onGround: false, impactSinkRate: 0, onArrestorWires: false, onBarrier: false, crashReason: null };
}

/** Fraction of critical damping in each gear leg while compressing. */
const GEAR_DAMPING_RATIO = 0.6;
/**
 * Extra damping while a leg extends again. Real oleo struts meter oil more
 * tightly on rebound, so a firm arrival sticks instead of bouncing back into the air.
 */
const REBOUND_DAMPING_FACTOR = 2.5;

/** Speeds (m/s) over which tyre friction builds to full strength. Smooths the force through zero to avoid jitter at rest. */
const ROLLING_FRICTION_SMOOTHING = 0.3;
const LATERAL_SLIP_SMOOTHING = 0.4;
/** The lowered hook hangs this far below the fuselage line (deg; matches the visual), and catches a wire within this height of the deck (m). */
const HOOK_LOWERED_DEG = 65;
const HOOK_SIN = Math.sin((HOOK_LOWERED_DEG * Math.PI) / 180);
const HOOK_COS = Math.cos((HOOK_LOWERED_DEG * Math.PI) / 180);
const HOOK_REACH = 0.35;

// Scratch vectors, reused every call.
const offset = vec3();
const contactPoint = vec3();
const worldAngularVelocity = vec3();
const pointVelocity = vec3();
const wheelForward = vec3();
const wheelRight = vec3();
const wheelForce = vec3();
const wheelTorque = vec3();
const scaledPoint = vec3();
const noseAxis = vec3();
const bodyForward: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Forces from the wheels touching the ground, and crash detection.
 *
 * Each wheel is a spring-damper leg (like an oleo strut plus tyre):
 *   normal force N = k * compression - c * (vertical velocity of the contact point)
 * with k chosen so the aircraft's weight compresses the legs by
 * `staticDeflection`. Along the ground, each tyre produces:
 *   - rolling resistance plus braking, opposing roll: (mu_roll + brake * mu_brake) * N;
 *   - sideways grip, opposing skid, up to mu_lateral * N.
 * Forces act at the contact point, so they also create torque: that is
 * how the nose wheel steers, and how pulling back pivots the aircraft on its
 * main wheels at take-off.
 */
export function computeGroundContact(
  state: Readonly<AircraftState>,
  spec: AircraftClassSpec,
  controls: Readonly<FlightControls>,
  ground: GroundQuery,
  out: GroundContactResult,
): GroundContactResult {
  setVec3(out.force, 0, 0, 0);
  setVec3(out.torque, 0, 0, 0);
  out.onGround = false;
  out.impactSinkRate = 0;
  out.onArrestorWires = false;
  out.onBarrier = false;
  out.crashReason = null;

  const scale = spec.airframeScale;
  const gear = spec.landingGear;
  const { wheels, staticLoadShare, crashPoints } = spec.airframe;

  rotateVec3(worldAngularVelocity, state.orientation, state.angularVelocity);
  rotateVec3(noseAxis, state.orientation, bodyForward);
  const horizontalSpeed = Math.hypot(state.velocity.x, state.velocity.z);

  for (let i = 0; i < wheels.length; i++) {
    const wheel = wheels[i];
    const share = staticLoadShare[i];
    if (!wheel || share === undefined) continue;
    // Spring stiffness: this leg's share of the weight compresses it by the static deflection.
    const legMass = spec.mass * share;
    const stiffness = (legMass * PHYSICS_CONSTANTS.gravity) / (gear.staticDeflection * scale);
    // Damping: a fraction of critical damping, c = 2 * zeta * sqrt(k * m_leg).
    const damping = 2 * GEAR_DAMPING_RATIO * Math.sqrt(stiffness * legMass);

    scaleVec3(scaledPoint, wheel.contactPoint, scale);
    rotateVec3(offset, state.orientation, scaledPoint);
    addVec3(contactPoint, state.position, offset);

    const compression = ground.heightAt(contactPoint.x, contactPoint.z) - contactPoint.y;
    if (compression <= 0) continue;
    out.onGround = true;
    const surfaceType = ground.surfaceAt(contactPoint.x, contactPoint.z);
    if (surfaceType === 'water') out.crashReason ??= 'ditched in the sea';
    if (surfaceType === 'wires' && wheel.kind === 'main') out.onArrestorWires = true;
    if (surfaceType === 'barrier' && wheel.kind === 'main') out.onBarrier = true;

    // Velocity of the contact point = body velocity + (angular velocity x lever arm).
    crossVec3(pointVelocity, worldAngularVelocity, offset);
    addVec3(pointVelocity, pointVelocity, state.velocity);

    out.impactSinkRate = Math.max(out.impactSinkRate, -pointVelocity.y);
    if (compression > gear.maxCompression * scale) out.crashReason ??= 'landing gear collapsed';
    if (pointVelocity.y < -gear.maxSinkRate) out.crashReason ??= `hard landing (${(-pointVelocity.y).toFixed(1)} m/s sink rate)`;

    // Oleo strut: linear up to the resting compression, then stiffening
    // quadratically, F = k * (d + progression * (d - d_rest)^2 / d_rest).
    const rest = gear.staticDeflection * scale;
    const beyondRest = Math.max(0, compression - rest);
    const springForce = stiffness * (compression + (gear.strutProgression * beyondRest * beyondRest) / rest);
    // Positive point velocity = the leg is extending (rebounding): damp that harder.
    const legDamping = pointVelocity.y > 0 ? damping * REBOUND_DAMPING_FACTOR : damping;
    const normal = Math.max(0, springForce - legDamping * pointVelocity.y);
    const surface = SURFACE_FRICTION[surfaceType];

    // The direction this tyre rolls: the nose's heading flattened onto the ground,
    // turned by the steering angle for the nose wheel.
    let heading = Math.atan2(noseAxis.x, noseAxis.z);
    if (wheel.kind === 'nose') {
      // Steering fades with speed, as on real aircraft, to 20% by the fade speed.
      const fade = Math.max(0.2, 1 - (0.8 * horizontalSpeed) / gear.steeringFadeSpeed);
      heading += controls.yaw * gear.maxSteeringDeg * (Math.PI / 180) * fade;
    }
    setVec3(wheelForward, Math.sin(heading), 0, Math.cos(heading));
    setVec3(wheelRight, Math.cos(heading), 0, -Math.sin(heading));

    const rollingSpeed = dotVec3(pointVelocity, wheelForward);
    const slipSpeed = dotVec3(pointVelocity, wheelRight);
    const brakeGrip = wheel.kind === 'main' ? controls.brake * surface.braking : 0;
    // tanh / clamp ramp the friction up over a small speed range so it fades
    // smoothly to zero at standstill instead of flipping sign every step.
    const longitudinal = -(surface.rolling + brakeGrip) * normal * Math.tanh(rollingSpeed / ROLLING_FRICTION_SMOOTHING);
    const lateral = -surface.lateral * normal * Math.max(-1, Math.min(1, slipSpeed / LATERAL_SLIP_SMOOTHING));

    setVec3(
      wheelForce,
      wheelForward.x * longitudinal + wheelRight.x * lateral,
      normal,
      wheelForward.z * longitudinal + wheelRight.z * lateral,
    );
    addVec3(out.force, out.force, wheelForce);
    // Torque about the centre of mass = lever arm x force.
    crossVec3(wheelTorque, offset, wheelForce);
    addVec3(out.torque, out.torque, wheelTorque);
  }

  // The lowered hook trails below and behind the main wheels, so it can
  // catch a wire a moment before they touch: easier traps.
  const hook = spec.airframe.tailhook;
  if (hook && state.hookArmed) {
    const tipDown = hook.length * HOOK_SIN;
    const tipBack = hook.length * HOOK_COS;
    setVec3(scaledPoint, hook.pivot.x * scale, (hook.pivot.y - tipDown) * scale, (hook.pivot.z - tipBack) * scale);
    rotateVec3(offset, state.orientation, scaledPoint);
    addVec3(contactPoint, state.position, offset);
    if (contactPoint.y - ground.heightAt(contactPoint.x, contactPoint.z) < HOOK_REACH && ground.surfaceAt(contactPoint.x, contactPoint.z) === 'wires') out.onArrestorWires = true;
  }

  // Any non-wheel part touching the ground is a crash.
  for (const crash of crashPoints) {
    scaleVec3(scaledPoint, crash.point, scale);
    rotateVec3(offset, state.orientation, scaledPoint);
    addVec3(contactPoint, state.position, offset);
    if (contactPoint.y < ground.heightAt(contactPoint.x, contactPoint.z)) {
      out.crashReason ??= ground.surfaceAt(contactPoint.x, contactPoint.z) === 'water' ? 'crashed into the sea' : crash.description;
      break;
    }
  }

  return out;
}

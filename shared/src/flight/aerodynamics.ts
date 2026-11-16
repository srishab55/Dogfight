import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PRIMITIVE_AIRFRAME } from '../config/airframe';

const DEG_TO_RAD = Math.PI / 180;

/** Seconds for the airflow to separate once past the critical angle. A real stall "breaks" in a fraction of a second. */
const SEPARATION_TIME = 0.12;
/** Seconds for the flow to re-attach once the angle of attack is reduced. Slower than separation. */
const REATTACH_TIME = 0.5;

type AeroSpec = AircraftClassSpec['aero'];
/** A mutable copy of an aircraft's aero data, adjusted for the current flap setting. */
export type EffectiveAero = { -readonly [K in keyof AeroSpec]: AeroSpec[K] };
type MutableAero = EffectiveAero;

/** How much lift ground effect adds at its strongest (wing almost touching the ground). */
const GROUND_EFFECT_LIFT_GAIN = 0.3;

export function wingSpan(spec: AircraftClassSpec): number {
  return PRIMITIVE_AIRFRAME.wingSpan * spec.airframeScale;
}

export function aspectRatio(spec: AircraftClassSpec): number {
  const span = wingSpan(spec);
  return (span * span) / spec.wingArea;
}

/**
 * The wing as modified by flaps at `flapPosition` (0-1), written into `out`.
 * Flaps add camber, which shifts the whole lift line up (more lift at every
 * angle of attack), adds drag, and makes the wing stall at a slightly lower
 * angle. CLmax still rises overall, so stall speed drops.
 */
export function applyFlaps(out: MutableAero, spec: AircraftClassSpec, flapPosition: number): MutableAero {
  Object.assign(out, spec.aero);
  out.zeroAngleLiftCoefficient += spec.flaps.liftIncrement * flapPosition;
  out.zeroLiftDragCoefficient += spec.flaps.dragIncrement * flapPosition;
  out.criticalAngleOfAttackDeg -= spec.flaps.criticalAngleReductionDeg * flapPosition;
  return out;
}

export function createAeroScratch(spec: AircraftClassSpec): MutableAero {
  return { ...spec.aero };
}

/**
 * Ground effect. Within about one wingspan of the ground, the ground blocks
 * the wing's downwash and tip vortices, so induced drag falls and lift rises a
 * little. That is the "cushion" pilots feel in the flare.
 *
 * Returns McCormick's induced-drag factor
 *   phi = (16 h/b)^2 / (1 + (16 h/b)^2)      (h = wing height, b = span)
 * which is 1 high up and drops towards 0 as the wing nears the ground.
 */
export function groundEffectInducedDragFactor(wingHeight: number, span: number): number {
  const ratio = (16 * Math.max(0, wingHeight)) / span;
  const squared = ratio * ratio;
  return squared / (1 + squared);
}

/** Lift multiplier from ground effect, given the induced-drag factor above. */
export function groundEffectLiftFactor(inducedDragFactor: number): number {
  return 1 + GROUND_EFFECT_LIFT_GAIN * (1 - inducedDragFactor);
}

/**
 * Angles of attack at which the wing stalls, in radians.
 *
 * The lift line CL = CL0 + slope * alpha crosses zero at the zero-lift angle
 * alpha0 = -CL0 / slope (slightly negative for a cambered wing). The negative
 * stall is placed symmetrically about alpha0, so inverted flight has
 * comparable, slightly lower, lift.
 */
export function stallAngles(aero: AeroSpec): { positive: number; negative: number } {
  const positive = aero.criticalAngleOfAttackDeg * DEG_TO_RAD;
  const zeroLiftAngle = -aero.zeroAngleLiftCoefficient / aero.liftCurveSlope;
  return { positive, negative: zeroLiftAngle - (positive - zeroLiftAngle) };
}

/** Highest lift coefficient the attached-flow wing reaches, at the critical angle. */
export function maxLiftCoefficient(aero: AeroSpec): number {
  return aero.zeroAngleLiftCoefficient + aero.liftCurveSlope * stallAngles(aero).positive;
}

/**
 * Advances the flow-separation state (0 = attached, 1 = stalled).
 *
 * Past either stall angle the flow separates quickly. It only re-attaches
 * once the angle of attack is `stallHysteresisDeg` *inside* the stall angles,
 * and then more slowly. That hysteresis is why recovery requires actively
 * lowering the nose, not just easing off at the critical angle.
 *
 * @param aerodynamicallyActive false when airspeed is too low for the airflow
 *   direction to mean anything (e.g. sitting on the runway).
 */
export function updateFlowSeparation(current: number, angleOfAttack: number, aero: AeroSpec, dt: number, aerodynamicallyActive: boolean): number {
  const { positive, negative } = stallAngles(aero);
  const hysteresis = aero.stallHysteresisDeg * DEG_TO_RAD;

  let target = current; // between the two thresholds: no change
  if (!aerodynamicallyActive) target = 0;
  else if (angleOfAttack > positive || angleOfAttack < negative) target = 1;
  else if (angleOfAttack < positive - hysteresis && angleOfAttack > negative + hysteresis) target = 0;

  const timeConstant = target > current ? SEPARATION_TIME : REATTACH_TIME;
  // First-order approach towards the target: exact enough at a 60 Hz step.
  return current + (target - current) * Math.min(1, dt / timeConstant);
}

/**
 * Lift coefficient as a blend of two regimes, weighted by flow separation:
 *
 *  - Attached flow: the classic straight line CL = CL0 + slope * alpha,
 *    limited to 15% beyond CLmax so a brief overshoot past the stall
 *    angle (real "dynamic stall") can't produce absurd lift.
 *  - Separated flow: the wing behaves like a flat plate, CL = k * sin(2 * alpha).
 *    Just past the stall this gives roughly half the attached lift, which is
 *    the sudden lift collapse a pilot feels. It also covers every attitude,
 *    including flying backwards in a tail-slide.
 */
export function liftCoefficient(angleOfAttack: number, separation: number, aero: AeroSpec): number {
  const { positive, negative } = stallAngles(aero);
  const max = aero.zeroAngleLiftCoefficient + aero.liftCurveSlope * positive;
  const min = aero.zeroAngleLiftCoefficient + aero.liftCurveSlope * negative;
  const attachedRaw = aero.zeroAngleLiftCoefficient + aero.liftCurveSlope * angleOfAttack;
  const attached = Math.min(max * 1.15, Math.max(min * 1.15, attachedRaw));
  const separated = aero.separatedLiftScale * Math.sin(2 * angleOfAttack);
  return attached + (separated - attached) * separation;
}

/**
 * Drag coefficient, the sum of:
 *  - zero-lift (parasitic) drag CD0;
 *  - induced drag CL^2 / (pi * e * AR): the price of making lift, largest when slow or pulling hard;
 *  - separated-flow pressure drag, which grows like sin^2(alpha) once stalled;
 *  - sideslip drag for flying crossed-controls.
 */
export function dragCoefficient(
  lift: number,
  angleOfAttack: number,
  sideslip: number,
  separation: number,
  aero: AeroSpec,
  aspect: number,
  inducedDragFactor = 1,
): number {
  const induced = (inducedDragFactor * lift * lift) / (Math.PI * aero.oswaldEfficiency * aspect);
  const separatedPressure = separation * aero.separatedDragCoefficient * Math.sin(angleOfAttack) ** 2;
  const slip = aero.sideslipDragCoefficient * sideslip * sideslip;
  return aero.zeroLiftDragCoefficient + induced + separatedPressure + slip;
}

/**
 * Propeller thrust at a forward airspeed. A propeller converts roughly
 * constant engine *power* into thrust, so thrust = efficiency * power / speed.
 * That would be infinite at standstill, so it is capped at the static thrust.
 * Engine power also falls with air density at altitude.
 */
export function availableThrust(engine: AircraftClassSpec['engine'], forwardSpeed: number, densityRatio: number): number {
  const powerLimited = (engine.propellerEfficiency * engine.maxPower) / Math.max(forwardSpeed, 1);
  return Math.min(engine.staticThrust, powerLimited) * densityRatio;
}

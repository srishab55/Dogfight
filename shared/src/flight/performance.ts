import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PHYSICS_CONSTANTS } from '../config/simulation';
import { applyFlaps, aspectRatio, availableThrust, maxLiftCoefficient } from './aerodynamics';

/**
 * Headline performance figures, *derived* from an aircraft's physical
 * configuration with the standard steady-flight equations. These are the
 * "stall speed" and "maximum turn rate" of the brief. Deriving them means a
 * config can never claim a stall speed its wing can't produce.
 *
 * They are estimates for steady 1 g flight at sea level. The full simulation
 * (and the flight tests) include transients these formulas ignore.
 */
export interface AircraftPerformance {
  /** Weight / wing area (Pa). Higher means faster stall and wider turns. */
  wingLoading: number;
  thrustToWeight: number;
  maxLiftCoefficient: number;
  /** Slowest 1 g flight: lift at CLmax equals weight (m/s). */
  stallSpeed: number;
  /** Stall speed with full landing flaps (m/s). */
  landingStallSpeed: number;
  /** Recommended final-approach speed: 1.3x the landing-flap stall speed, the standard margin (m/s). */
  approachSpeed: number;
  /** Speed the aircraft settles at hands-off with landing flaps down (the flaps re-trim it) (m/s). */
  handsOffApproachSpeed: number;
  /** Throttle that, hands-off with landing flaps, holds a standard 3-degree glide slope. */
  approachThrottle: number;
  /** Slowest speed at which the g-limit can be pulled. The tightest, fastest turn happens here (m/s). */
  cornerSpeed: number;
  /** Turn rate at corner speed and the g-limit (deg/s). */
  maxTurnRateDeg: number;
  /** Speed where available thrust equals drag in level flight (m/s). */
  topSpeed: number;
  /** Best steady climb rate (m/s) and the speed it occurs at (m/s). */
  bestClimbRate: number;
  bestClimbSpeed: number;
}

export function computePerformance(spec: AircraftClassSpec): AircraftPerformance {
  const g = PHYSICS_CONSTANTS.gravity;
  const rho = PHYSICS_CONSTANTS.seaLevelAirDensity;
  const weight = spec.mass * g;
  const clMax = maxLiftCoefficient(spec.aero);
  const inducedFactor = 1 / (Math.PI * spec.aero.oswaldEfficiency * aspectRatio(spec));

  // Level flight: lift = weight  =>  1/2 rho V^2 S CL = W  =>  V = sqrt(2W / (rho S CL)).
  const stallSpeed = Math.sqrt((2 * weight) / (rho * spec.wingArea * clMax));
  const landingAero = applyFlaps({ ...spec.aero }, spec, 1, 0, 1); // landing: full flap, gear down
  const clMaxLanding = maxLiftCoefficient(landingAero);
  const landingStallSpeed = Math.sqrt((2 * weight) / (rho * spec.wingArea * clMaxLanding));

  // Hands-off with landing flaps, the aircraft settles at its re-trimmed angle of attack.
  const handsOffAoa = ((spec.handling.pitch.trimAngleOfAttackDeg + spec.flaps.trimShiftDeg) * Math.PI) / 180;
  const handsOffCl = landingAero.zeroAngleLiftCoefficient + landingAero.liftCurveSlope * handsOffAoa;
  const handsOffApproachSpeed = Math.sqrt((2 * weight) / (rho * spec.wingArea * handsOffCl));
  // On a 3-degree slope, gravity pulls W*sin(3 deg) along the path, so the engine
  // only has to supply the rest of the drag: T = D - W*sin(3 deg).
  const glide = (3 * Math.PI) / 180;
  const qApproach = 0.5 * rho * handsOffApproachSpeed ** 2;
  const approachDrag = qApproach * spec.wingArea * (landingAero.zeroLiftDragCoefficient + inducedFactor * handsOffCl * handsOffCl);
  const approachThrottle = Math.max(0, Math.min(1, (approachDrag - weight * Math.sin(glide)) / availableThrust(spec.engine, handsOffApproachSpeed, 1)));
  // Pulling n g needs n times the lift, so the speed scales with sqrt(n).
  const cornerSpeed = stallSpeed * Math.sqrt(spec.handling.gLimit);
  // In a level turn at load factor n, the horizontal lift component gives omega = g * sqrt(n^2 - 1) / V.
  const maxTurnRate = (g * Math.sqrt(spec.handling.gLimit ** 2 - 1)) / cornerSpeed;

  const levelDrag = (speed: number) => {
    const q = 0.5 * rho * speed * speed;
    const cl = weight / (q * spec.wingArea);
    return q * spec.wingArea * (spec.aero.zeroLiftDragCoefficient + inducedFactor * cl * cl);
  };
  const excessThrust = (speed: number) => availableThrust(spec.engine, speed, 1) - levelDrag(speed);

  // Top speed: bisection for the speed where excess thrust crosses zero.
  let low = stallSpeed * 1.5;
  let high = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (excessThrust(mid) > 0) low = mid;
    else high = mid;
  }
  const topSpeed = (low + high) / 2;

  // Climb rate = excess power / weight = (T - D) * V / W, maximised over speed.
  let bestClimbRate = -Infinity;
  let bestClimbSpeed = stallSpeed;
  for (let speed = stallSpeed * 1.1; speed < topSpeed; speed += 0.5) {
    const climb = (excessThrust(speed) * speed) / weight;
    if (climb > bestClimbRate) {
      bestClimbRate = climb;
      bestClimbSpeed = speed;
    }
  }

  return {
    wingLoading: weight / spec.wingArea,
    thrustToWeight: spec.engine.staticThrust / weight,
    maxLiftCoefficient: clMax,
    stallSpeed,
    landingStallSpeed,
    approachSpeed: landingStallSpeed * 1.3,
    handsOffApproachSpeed,
    approachThrottle,
    cornerSpeed,
    maxTurnRateDeg: (maxTurnRate * 180) / Math.PI,
    topSpeed,
    bestClimbRate,
    bestClimbSpeed,
  };
}

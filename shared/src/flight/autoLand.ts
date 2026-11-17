import type { AircraftClassSpec } from '../config/aircraftClasses';
import { groundClearance, hasTailhook } from '../config/aircraftClasses';
import { TERRAIN_CONFIG } from '../config/terrain';
import { BASES, type BaseDefinition, type RunwayDefinition } from '../config/world';
import type { CarrierStatusMap } from '../world/carrierStatus';
import { vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';
import type { AircraftState } from './AircraftState';
import { DEFAULT_DIRECTION_PILOT, steerTowards, type DirectionPilotTuning, type StickInputs } from './directionPilot';
import type { FlightControls } from './FlightControls';
import type { GroundQuery } from './ground';
import { computePerformance, type AircraftPerformance } from './performance';

/*
 * Auto-land: an autopilot that flies a landing at a base from wherever the
 * aircraft is, and stops on the runway (or catches a carrier's wire).
 *
 *   1. INTERCEPT: out on the approach side, join the extended centreline the
 *      way an ILS localizer is followed (closing on it at up to 75 degrees),
 *      at the glide slope's height; from too close or the wrong side, fly out
 *      past the entry, offset to one side, and turn back in (a teardrop).
 *      Clear of terrain on the way; quick far out, slowing near the entry.
 *   2. FINAL: follow the 3-degree glide slope down the centreline (chasing a
 *      point a few hundred metres ahead on it), with landing flaps, at the
 *      class's approach speed (throttle holds the speed).
 *   3. FLARE (runways): a few metres up, ease the descent, throttle to idle.
 *      Carriers are flown onto the deck without a flare, with power on.
 *   4. ROLL-OUT: brake on the centreline to a stop (or let the wire stop it).
 *
 * It only chooses control positions; the flight model flies the aircraft.
 * Deterministic, so the Phase 5 server and Phase 7 AI can use it too.
 */

export type AutoLandPhase = 'intercept' | 'final' | 'flare' | 'rollout' | 'done';

export interface AutoLand {
  /** The runway (or flight deck) in the direction it will be landed on. */
  readonly runway: RunwayDefinition;
  readonly kind: 'airfield' | 'carrier';
  /** Where the glide slope meets the runway, past the threshold (m). */
  readonly aimPastThreshold: number;
  phase: AutoLandPhase;
  /** On the way to final: heading for the point beyond the entry, or for the entry itself. */
  leg: 'outside' | 'entry';
  /** Times it has abandoned a final approach and gone round again. */
  goArounds: number;
  /** Integral of the speed error, for the throttle (m). */
  speedIntegral: number;
  /** Last step's airspeed and the smoothed rate it is changing at (m/s, m/s^2). */
  lastSpeed: number;
  speedRate: number;
}

export const AUTO_LAND_CONFIG = {
  /** Auto-land is offered within this distance of a base (m). */
  offerRange: 10_000,
  glideSlopeDeg: 3,
  /** The entry point is this far before the aim point on the extended centreline (m). */
  entryDistance: { airfield: 2_000, carrier: 1_800 },
  /** On final it chases a point this far ahead along the glide path (m). */
  lookahead: 320,
  /** ...shrinking to half the distance to go, but no closer than this (m). */
  minLookahead: 60,
  /** From too close in, it flies out to a point this much beyond the entry, offset this far to the side, then turns in (m). */
  outsideDistance: 1_200,
  offsetDistance: 1_000,
  /** Joining the extended centreline: the heading closes on it at atan(offset / lead), at most this angle (m, deg). */
  interceptLead: 800,
  maxInterceptAngleDeg: 75,
  /** It checks the terrain this far ahead on the way (m). */
  terrainLookahead: 3_000,
  /** Final starts inside this cone around the extended centreline, heading within this of the runway (deg)... */
  captureAngleDeg: 25,
  captureHeadingDeg: 40,
  /** ...and no higher than this above the glide slope (more, the further out it is) (m). */
  captureHeightMargin: 40,
  /** Close in (m), it goes around if this high above the slope (m) or this much faster than its approach speed. */
  goAround: { distance: 450, tooHigh: 15, tooFastFactor: 1.4 },
  /** Steepest descent on final, and on the way to the approach; steepest climb (deg). */
  maxDescentDeg: 7,
  interceptMaxDescentDeg: 10,
  maxClimbDeg: 12,
  /** Keeps at least this high above the terrain on the way in (m). */
  terrainClearance: 180,
  /** Runway landings flare from this wheel height, aiming for this sink rate (m, m/s). */
  flareHeight: 6,
  /** ...but no higher than this many metres per m/s of airspeed (slow aircraft flare lower). */
  flareHeightPerSpeed: 0.12,
  flareSinkRate: 1.2,
  /** In the flare, power comes back in below this multiple of the landing stall speed. */
  flarePowerBelowStallFactor: 1.18,
  /** ...or earlier if sinking fast: this many seconds of sink before touchdown (s). */
  flareLeadSeconds: 1.6,
  /** Intercept speed as a multiple of the clean stall speed: fast while far from the next point, slowing near it. */
  interceptSpeedFactor: 1.55,
  transitSpeedFactor: 2.4,
  /** Slows from transit to intercept speed over this distance, ending 1.5 km before the entry (m). */
  slowDownDistance: 3_500,
  /** Throttle gains on the speed error (per m/s, and per m of integrated error). */
  speedGain: 0.06,
  speedIntegralGain: 0.004,
  /** The throttle acts on the speed predicted this far ahead (s). */
  speedLeadSeconds: 3,
} as const;

/** Where the aim point is for each kind of base: the PAPI on a runway, early in the wire zone on a carrier. */
const AIM_POINT = { airfield: 300, carrier: 30 } as const;

const DEG = Math.PI / 180;
const performanceCache = new WeakMap<AircraftClassSpec, AircraftPerformance>();
// Scratch values, so a step allocates nothing.
const sticks: StickInputs = { pitch: 0, roll: 0, yaw: 0 };
const target = vec3();
const scratchPoint = { x: 0, z: 0 };
const scratchCorridor: Corridor = { aimX: 0, aimZ: 0, fx: 0, fz: 0, length: 0, halfWidth: 0, runwayLength: 0 };
/**
 * Gentler than mouse flying: it steers the flight path (not the nose), and
 * pulls only moderately for a given error. With the mouse pilot's gains, a
 * point a few degrees below would ask for "less than zero g" and roll it
 * inverted to get there (a split-S), which is no way to land.
 */
const TUNING: DirectionPilotTuning = { ...DEFAULT_DIRECTION_PILOT, aimWithNose: false, turnAccelPerRadG: 3, maxTurnAccelG: 2 };
/** The flare is a few degrees of pitch that must happen promptly: a firmer pull per degree. */
const FLARE_TUNING: DirectionPilotTuning = { ...TUNING, turnAccelPerRadG: 10 };

/**
 * The base auto-land would take this aircraft to: the nearest one within
 * range, of EITHER team. Landing at an enemy base is allowed; it just
 * doesn't rearm you, and only captures an airfield whose defences are all
 * destroyed (the usual rules). Carriers need a tailhook, and a sinking
 * carrier is no place to land.
 */
export function autoLandBaseFor(spec: AircraftClassSpec, position: Readonly<Vec3>, carrierStatuses: CarrierStatusMap | null = null, bases: readonly BaseDefinition[] = BASES): BaseDefinition | null {
  let best: BaseDefinition | null = null;
  let bestDistance: number = AUTO_LAND_CONFIG.offerRange;
  for (const base of bases) {
    if (base.kind === 'carrier' && (!hasTailhook(spec) || (carrierStatuses?.get(base.id)?.sink ?? 0) > 0)) continue;
    const distance = Math.hypot(base.runway.center.x - position.x, base.runway.center.z - position.z);
    if (distance < bestDistance) {
      best = base;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Plans a landing at `base`. A runway can be landed in either direction:
 * the end whose entry point is nearer is used. A carrier is always landed
 * from astern.
 */
export function planAutoLand(base: BaseDefinition, state: Readonly<AircraftState>): AutoLand {
  const kind = base.kind;
  const aimPastThreshold = AIM_POINT[kind];
  let runway = base.runway;
  if (kind === 'airfield') {
    const reversed: RunwayDefinition = { ...runway, headingDegrees: (runway.headingDegrees + 180) % 360 };
    const entry = (r: RunwayDefinition) => pointOnApproach(r, aimPastThreshold, AUTO_LAND_CONFIG.entryDistance.airfield);
    const a = entry(runway);
    const b = entry(reversed);
    const p = state.position;
    if (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z)) runway = reversed;
  }
  // Already out on the approach side: join the centreline directly; otherwise fly out first.
  const h = runway.headingDegrees * DEG;
  const along0 = -runway.length / 2 + aimPastThreshold;
  const toGo = -((state.position.x - runway.center.x) * Math.sin(h) + (state.position.z - runway.center.z) * Math.cos(h) - along0);
  const leg = toGo >= AUTO_LAND_CONFIG.entryDistance[kind] ? 'entry' : 'outside';
  return { runway, kind, aimPastThreshold, phase: 'intercept', leg, goArounds: 0, speedIntegral: 0, lastSpeed: 0, speedRate: 0 };
}

/**
 * One step of the autopilot: writes the controls into `out` and moves
 * through the phases. Returns the phase (`done` once stopped).
 */
export function stepAutoLand(auto: AutoLand, state: Readonly<AircraftState>, spec: AircraftClassSpec, ground: GroundQuery, out: FlightControls, dt: number): AutoLandPhase {
  const c = AUTO_LAND_CONFIG;
  const perf = performance(spec);
  out.fire = false;
  out.yaw = 0;
  if (state.crashed) {
    auto.phase = 'done';
    return auto.phase;
  }

  const r = auto.runway;
  const h = r.headingDegrees * DEG;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // Aim point (where wheels should meet the runway) and the aircraft relative to it.
  const along0 = -r.length / 2 + auto.aimPastThreshold;
  const aimX = r.center.x + fx * along0;
  const aimZ = r.center.z + fz * along0;
  const p = state.position;
  const dx = p.x - aimX;
  const dz = p.z - aimZ;
  const toGo = -(dx * fx + dz * fz); // distance before the aim point along the approach
  const across = dx * fz - dz * fx; // right of the centreline
  const clearance = groundClearance(spec);
  const wheelHeight = p.y - clearance - r.center.y;
  const speed = airspeedOf(state);
  const glide = Math.tan(c.glideSlopeDeg * DEG);

  if (state.onGround && auto.phase !== 'intercept') auto.phase = 'rollout';

  switch (auto.phase) {
    case 'intercept': {
      const entryDistance = c.entryDistance[auto.kind];
      const outsideDistance = entryDistance + c.outsideDistance;
      // Final starts once inside the approach cone, heading in, not too far
      // out, and low enough to get down onto the glide slope in time (it can
      // descend at 7 degrees, 4 more than the slope, so the further out the
      // more height it can lose).
      const headingError = Math.abs(wrap(Math.atan2(state.velocity.x, state.velocity.z) - h));
      const inbound = headingError < c.captureHeadingDeg * DEG;
      const inCone = toGo > 600 && toGo < outsideDistance + 1_000 && Math.abs(Math.atan2(across, toGo)) < c.captureAngleDeg * DEG;
      const lowEnough = wheelHeight - toGo * glide < Math.max(c.captureHeightMargin, (Math.tan(c.maxDescentDeg * DEG) - glide) * (toGo - 800));
      if (inCone && inbound && lowEnough) {
        auto.phase = 'final';
        break;
      }
      // Too close in (or past the runway) to turn onto final: go out again.
      if (auto.leg === 'entry' && toGo < entryDistance * 0.5) auto.leg = 'outside';
      else if (auto.leg === 'outside' && toGo > entryDistance + c.outsideDistance * 0.5) auto.leg = 'entry';

      let heading: number;
      let goalY: number;
      let legDistance: number;
      if (auto.leg === 'entry') {
        // Out on the approach side: like following an ILS localizer, steer a
        // heading that closes on the extended centreline (at up to 75 degrees
        // when far off it, easing to straight along it), at the glide slope's
        // height for where it is. Once in the cone, final takes over.
        heading = h - Math.max(-c.maxInterceptAngleDeg * DEG, Math.min(c.maxInterceptAngleDeg * DEG, Math.atan2(across, c.interceptLead)));
        goalY = r.center.y + clearance + Math.max(0, toGo) * glide;
        legDistance = Math.hypot(Math.max(0, toGo - entryDistance), across);
      } else {
        // Too close or on the wrong side: fly out to a point beyond the entry,
        // offset to the side it is already on, then turn in (a teardrop).
        const side = across >= 0 ? 1 : -1;
        const out0 = pointOnApproach(r, auto.aimPastThreshold, outsideDistance, scratchPoint);
        const gx = out0.x + fz * c.offsetDistance * side;
        const gz = out0.z - fx * c.offsetDistance * side;
        heading = Math.atan2(gx - p.x, gz - p.z);
        goalY = r.center.y + clearance + outsideDistance * glide;
        legDistance = Math.hypot(gx - p.x, gz - p.z) + c.offsetDistance + c.outsideDistance;
      }
      // Height: high enough for the terrain over the next few kilometres; it
      // heads for it promptly (climbing at most 12 degrees, descending at most 10).
      const lookX = p.x + Math.sin(heading) * c.terrainLookahead;
      const lookZ = p.z + Math.cos(heading) * c.terrainLookahead;
      // (Ground under the approach corridor itself is kept below the glide
      // slope by the terrain generator, so it doesn't count.)
      let corridor: Corridor | null = null;
      if (auto.kind === 'airfield') {
        corridor = scratchCorridor;
        corridor.aimX = aimX;
        corridor.aimZ = aimZ;
        corridor.fx = fx;
        corridor.fz = fz;
        corridor.length = TERRAIN_CONFIG.airfield.approachLength + auto.aimPastThreshold;
        corridor.halfWidth = TERRAIN_CONFIG.airfield.approachHalfWidth;
        corridor.runwayLength = r.length;
      }
      const safeY = Math.max(goalY, highestTerrain(ground, p.x, p.z, lookX, lookZ, corridor) + c.terrainClearance);
      const climb = Math.max(-c.interceptMaxDescentDeg * DEG, Math.min(c.maxClimbDeg * DEG, Math.atan2(safeY - p.y, 500)));
      setDirection(target, heading, climb);
      steerTowards(state, spec, target, sticks, TUNING);
      // Quick while far out; slowing over the last few kilometres to the
      // entry, to a speed the first stage of flap can take.
      const interceptSpeed = Math.min(perf.stallSpeed * c.interceptSpeedFactor, spec.flaps.maxExtensionSpeed - 8);
      const transitSpeed = Math.min(perf.stallSpeed * c.transitSpeedFactor, perf.topSpeed * 0.8);
      const toSlow = Math.min(1, Math.max(0, (legDistance - 1_500) / c.slowDownDistance));
      holdSpeed(auto, state, interceptSpeed + (transitSpeed - interceptSpeed) * toSlow, perf.approachThrottle + 0.2, out, dt);
      out.flaps = legDistance < 4_000 && speed < spec.flaps.maxExtensionSpeed - 3 ? 0.5 : 0;
      break;
    }
    case 'final': {
      // Flare in time to take the sink rate off: higher when sinking faster, lower for slow, light aircraft.
      const flareHeight = Math.min(c.flareHeight, speed * c.flareHeightPerSpeed);
      if (auto.kind === 'airfield' && wheelHeight < Math.max(flareHeight, -state.velocity.y * c.flareLeadSeconds) && toGo < 600) {
        auto.phase = 'flare';
        break;
      }
      // Go around if it is badly placed close in: too high, off to one side, or too fast.
      if (toGo < c.goAround.distance && (wheelHeight - Math.max(0, toGo) * glide > c.goAround.tooHigh || Math.abs(across) > Math.max(10, r.width * 0.4) || speed > perf.handsOffApproachSpeed * c.goAround.tooFastFactor)) {
        auto.phase = 'intercept';
        auto.leg = 'outside';
        auto.goArounds++;
        break;
      }
      // Chase a point on the glide path a little ahead, back on the centreline.
      // The point comes closer near the end, so the path converges on the aim
      // point instead of lagging above it. A carrier landing has no flare: the
      // glide line carries on into the deck, so it arrives at the wires
      // descending (the hook catches; floating would miss them all).
      const lookahead = Math.max(c.minLookahead, Math.min(c.lookahead, toGo * 0.5));
      const carrotToGo = toGo - lookahead;
      const carrotX = aimX - fx * carrotToGo;
      const carrotZ = aimZ - fz * carrotToGo;
      const slopeY = r.center.y + clearance + (auto.kind === 'carrier' ? carrotToGo : Math.max(0, carrotToGo)) * glide;
      // Never dive at the slope more steeply than the maximum descent angle.
      const carrotY = Math.max(slopeY, p.y - lookahead * Math.tan(c.maxDescentDeg * DEG));
      target.x = carrotX - p.x;
      target.y = carrotY - p.y;
      target.z = carrotZ - p.z;
      steerTowards(state, spec, target, sticks, TUNING);
      out.flaps = speed < spec.flaps.maxExtensionSpeed - 3 ? 1 : 0.5;
      holdSpeed(auto, state, perf.handsOffApproachSpeed, perf.approachThrottle, out, dt);
      break;
    }
    case 'flare': {
      // Ease the descent to a gentle sink, power off, wings level along the centreline.
      centrelineAhead(target, aimX, aimZ, fx, fz, -toGo + 250, p);
      setDirection(target, Math.atan2(target.x, target.z), Math.atan2(-c.flareSinkRate, Math.max(speed, 20)));
      steerTowards(state, spec, target, sticks, FLARE_TUNING);
      // Power off, unless the speed is sagging towards the stall (draggy old types bleed speed fast).
      out.throttle = Math.max(0, Math.min(perf.approachThrottle, (perf.landingStallSpeed * c.flarePowerBelowStallFactor - speed) * 0.25));
      out.airbrake = 0;
      out.flaps = 1;
      break;
    }
    case 'rollout': {
      // Steer the nose wheel at a point ahead on the centreline; brakes on, power off (the wire holds a carrier landing).
      centrelineAhead(target, aimX, aimZ, fx, fz, -toGo + 150, p);
      steerTowards(state, spec, target, sticks, TUNING);
      out.throttle = 0;
      out.brake = 1;
      out.airbrake = 1;
      out.flaps = 1;
      if (Math.hypot(state.velocity.x, state.velocity.z) < 0.6) auto.phase = 'done';
      break;
    }
    case 'done':
      out.throttle = 0;
      out.brake = 1;
      break;
  }

  out.pitch = sticks.pitch;
  out.roll = sticks.roll;
  out.yaw = sticks.yaw;
  if (auto.phase !== 'rollout' && auto.phase !== 'done') out.brake = 0;
  return auto.phase;
}

/**
 * Throttle (and air brakes when much too fast) to hold `targetSpeed`:
 * proportional on the speed it will have a few seconds from now (so power
 * comes in while it is still slowing, the engine takes time to spool up),
 * plus a slow integral.
 */
function holdSpeed(auto: AutoLand, state: Readonly<AircraftState>, targetSpeed: number, trim: number, out: FlightControls, dt: number): void {
  const c = AUTO_LAND_CONFIG;
  const speed = airspeedOf(state);
  if (auto.lastSpeed > 0 && dt > 0) auto.speedRate += ((speed - auto.lastSpeed) / dt - auto.speedRate) * Math.min(1, dt / 0.5);
  auto.lastSpeed = speed;
  const error = targetSpeed - (speed + auto.speedRate * c.speedLeadSeconds);
  // Anti-windup: stop integrating while the throttle is pinned at a stop in
  // the direction of the error (slowing down from a fast descent would
  // otherwise store up "too fast" and leave it short of power later).
  const unclamped = trim + error * c.speedGain + auto.speedIntegral * c.speedIntegralGain;
  if (!((unclamped <= 0 && error < 0) || (unclamped >= 1 && error > 0))) auto.speedIntegral = Math.max(-150, Math.min(150, auto.speedIntegral + error * dt));
  out.throttle = Math.max(0, Math.min(1, trim + error * c.speedGain + auto.speedIntegral * c.speedIntegralGain));
  out.airbrake = error < -10 ? Math.min(1, (-error - 10) / 15) : 0;
}

/** World point `distance` metres before a runway's aim point on its extended centreline (written into `out`). */
function pointOnApproach(runway: RunwayDefinition, aimPastThreshold: number, distance: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const h = runway.headingDegrees * DEG;
  const along = -runway.length / 2 + aimPastThreshold - distance;
  out.x = runway.center.x + Math.sin(h) * along;
  out.z = runway.center.z + Math.cos(h) * along;
  return out;
}

interface Corridor {
  aimX: number;
  aimZ: number;
  fx: number;
  fz: number;
  /** How far out from the aim point it reaches, and its half width (m). */
  length: number;
  halfWidth: number;
  runwayLength: number;
}

/** The highest ground between two points (sampled every couple of hundred metres), ignoring any inside the approach corridor. */
function highestTerrain(ground: GroundQuery, x0: number, z0: number, x1: number, z1: number, corridor: Corridor | null = null): number {
  let highest = -Infinity;
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (corridor) {
      const dx = x - corridor.aimX;
      const dz = z - corridor.aimZ;
      const toGo = -(dx * corridor.fx + dz * corridor.fz);
      if (toGo > -corridor.runwayLength && toGo < corridor.length && Math.abs(dx * corridor.fz - dz * corridor.fx) < corridor.halfWidth) continue;
    }
    highest = Math.max(highest, ground.heightAt(x, z));
  }
  return highest === -Infinity ? 0 : highest;
}

/** Horizontal direction from `p` to the centreline point `along` metres past the aim point. */
function centrelineAhead(out: Vec3, aimX: number, aimZ: number, fx: number, fz: number, along: number, p: Readonly<Vec3>): void {
  out.x = aimX + fx * along - p.x;
  out.y = 0;
  out.z = aimZ + fz * along - p.z;
}

function setDirection(out: Vec3, heading: number, climb: number): void {
  out.x = Math.cos(climb) * Math.sin(heading);
  out.y = Math.sin(climb);
  out.z = Math.cos(climb) * Math.cos(heading);
}

/** Airspeed; before the first physics step telemetry is still empty, so fall back to the velocity. */
function airspeedOf(state: Readonly<AircraftState>): number {
  return state.telemetry.airspeed || Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function performance(spec: AircraftClassSpec): AircraftPerformance {
  let perf = performanceCache.get(spec);
  if (!perf) {
    perf = computePerformance(spec);
    performanceCache.set(spec, perf);
  }
  return perf;
}

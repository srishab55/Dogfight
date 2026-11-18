import type { AircraftClassSpec } from '../config/aircraftClasses';
import { groundClearance, hasTailhook } from '../config/aircraftClasses';
import { TERRAIN_CONFIG } from '../config/terrain';
import { BASES, type BaseDefinition, type BaseOwnerLookup, type RunwayDefinition } from '../config/world';
import type { Team } from '../types/team';
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
 *      Fast far out, slowing only over the last stretch; a runway is landed
 *      in whichever direction is the shorter way round (turns counted).
 *   2. FINAL: follow the 3-degree glide slope down the centreline (chasing a
 *      point a few hundred metres ahead on it), with landing flaps, at the
 *      class's approach speed (throttle holds the speed).
 *   3. FLARE (runways): a few metres up, ease the descent, throttle to idle.
 *      Carriers are flown onto the deck without a flare, with power on.
 *   4. ROLL-OUT: brake on the centreline to a stop (or let the wire stop it).
 *
 * Terrain: in every phase before the flare it looks along the path it will
 * really fly (the arc of the turn it's making, and the next few seconds along
 * its velocity), not just straight ahead, and climbs over what it finds.
 * Only the ground under the runway's own approach corridor, which the
 * terrain generator keeps below the glide slope, is left out.
 *
 * It only chooses control positions; the flight model flies the aircraft.
 * Deterministic, so the Phase 5 server and the AI pilots use it too.
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
  /** Going around: climbing straight ahead, wings level, until safely high, before turning. */
  climbOut: boolean;
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
  /** The entry point is this far before the aim point on the extended centreline (m): a short final. */
  entryDistance: { airfield: 1_300, carrier: 1_100 },
  /** On final it chases a point this far ahead along the glide path (m). */
  lookahead: 320,
  /** ...shrinking to half the distance to go, but no closer than this (m). */
  minLookahead: 60,
  /** From too close in, it flies out to a point this much beyond the entry, offset this far to the side, then turns in (m). */
  outsideDistance: 650,
  offsetDistance: 700,
  /** Joining the extended centreline: the heading closes on it at atan(offset / lead), at most this angle (m, deg). */
  interceptLead: 650,
  maxInterceptAngleDeg: 75,
  /** It checks the terrain this far ahead on the way (m), and over the next few seconds along its velocity (s). */
  terrainLookahead: 3_000,
  terrainGuardSeconds: 6,
  /** If its flight path over the next few seconds would bring the wheels within this of the ground or sea (outside the corridor), it climbs as steeply as it can (m). */
  terrainEmergencyHeight: 20,
  /** On final, before the go-around point, it keeps this far above ground off the corridor (m). */
  finalTerrainMargin: 30,
  /** For choosing which way to land a runway: a turn of one radian costs this much distance (m). */
  turnCostPerRadian: 450,
  /** Final starts inside this cone around the extended centreline, heading within this of the runway (deg)... */
  captureAngleDeg: 22,
  captureHeadingDeg: 40,
  /** ...and no higher than this above the glide slope (more, the further out it is) (m). */
  captureHeightMargin: 40,
  /** Close in (m), it goes around if this high above the slope (m) or this much faster than its approach speed. */
  goAround: { distance: 450, tooHigh: 15, tooFastFactor: 1.4 },
  /**
   * Steepest descent on final, and on the way to the approach; steepest
   * climb (deg). Steep, with the air brakes holding the speed: from high up
   * it comes straight down onto the approach instead of flying a loop to
   * lose height. A sluggish aircraft (the Heavy Bomber) gets the gentler
   * `heavy` figures, blended by its turn rate (see `agilityOf`).
   */
  maxDescentDeg: 12,
  interceptMaxDescentDeg: 18,
  heavy: { maxDescentDeg: 5, interceptMaxDescentDeg: 10, slowDownRateFactor: 0.45, transitTopSpeedShare: 0.6 },
  maxClimbDeg: 14,
  /** Keeps at least this high above the terrain on the way in (m). */
  terrainClearance: 150,
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
  transitSpeedFactor: 2.9,
  /** ...but no faster than this share of its top speed. */
  transitTopSpeedShare: 0.85,
  /**
   * Slowing for the next point: the speed it holds is what it can lose at
   * this deceleration (throttle back, air brakes out) by `slowDownEnd`
   * metres before it (m/s^2, m).
   */
  slowDownRate: 1.6,
  slowDownEnd: 600,
  /** After a go-around it climbs straight ahead to this height before turning (m). */
  climbOutHeight: 90,
  /** Below this height above the ground it turns only gently (at most this far off its track) (m, deg). */
  lowTurnHeight: 60,
  lowTurnMaxDeg: 15,
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

/** What the choice of base knows about the fight: who holds each base, and which enemy ones are defenceless. */
export interface AutoLandPreferences {
  readonly team: Team;
  readonly ownerOf: BaseOwnerLookup;
  /** An enemy base with its defences destroyed (it can be captured by landing). */
  readonly isOpen: (base: BaseDefinition) => boolean;
}

/**
 * How far out of its way a defended enemy base is (m): landing there gives
 * nothing (no rearming, no capture) and its AA gun fires, so it's chosen
 * only when nothing else is near.
 */
const DEFENDED_ENEMY_PENALTY = 3_000;

/** Choosing a base: each radian it lies off the way the aircraft is flying counts as this much more distance (m). */
const OFF_THE_NOSE_COST_PER_RADIAN = 900;

/**
 * How much auto-landing at `base` is "the one you mean": its distance, plus
 * how far it lies off the way you're flying (a base behind costs as much as
 * one 2.8 km further away ahead), plus a penalty for a defended enemy base.
 * Infinity if it can't be used (out of range; a carrier without a hook, or
 * sinking). Which runway direction to land on is planAutoLand's business.
 */
export function autoLandCost(base: BaseDefinition, spec: AircraftClassSpec, state: Readonly<AircraftState>, carrierStatuses: CarrierStatusMap | null, preferences: AutoLandPreferences | null): number {
  if (base.kind === 'carrier' && (!hasTailhook(spec) || (carrierStatuses?.get(base.id)?.sink ?? 0) > 0)) return Infinity;
  const p = state.position;
  const dx = base.runway.center.x - p.x;
  const dz = base.runway.center.z - p.z;
  const distance = Math.hypot(dx, dz);
  if (distance > AUTO_LAND_CONFIG.offerRange) return Infinity;
  const moving = Math.hypot(state.velocity.x, state.velocity.z) > 5;
  const off = moving && distance > 1 ? Math.abs(wrap(Math.atan2(dx, dz) - Math.atan2(state.velocity.x, state.velocity.z))) : 0;
  let cost = distance + off * OFF_THE_NOSE_COST_PER_RADIAN;
  if (preferences) {
    const owner = preferences.ownerOf(base);
    if (owner !== null && owner !== preferences.team && !preferences.isOpen(base)) cost += DEFENDED_ENEMY_PENALTY;
  }
  return cost;
}

/**
 * The base auto-land takes this aircraft to: of those in range (anyone's),
 * the one it's heading for (near, and ahead rather than behind), so it never
 * turns round for a base behind when there's one ahead; your own bases and
 * ones you can take are preferred to defended enemy ones (see autoLandCost).
 */
export function chooseAutoLandBase(spec: AircraftClassSpec, state: Readonly<AircraftState>, carrierStatuses: CarrierStatusMap | null, preferences: AutoLandPreferences | null, bases: readonly BaseDefinition[] = BASES): BaseDefinition | null {
  let best: BaseDefinition | null = null;
  let bestCost = Infinity;
  for (const base of bases) {
    const cost = autoLandCost(base, spec, state, carrierStatuses, preferences);
    if (cost < bestCost) {
      best = base;
      bestCost = cost;
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
    if (pathCost(reversed, kind, aimPastThreshold, state) < pathCost(runway, kind, aimPastThreshold, state)) runway = reversed;
  }
  const leg = distanceToGo(runway, aimPastThreshold, state.position) >= AUTO_LAND_CONFIG.entryDistance[kind] ? 'entry' : 'outside';
  return { runway, kind, aimPastThreshold, phase: 'intercept', leg, goArounds: 0, climbOut: false, speedIntegral: 0, lastSpeed: 0, speedRate: 0 };
}

/** How far it is from the aircraft to the aim point along the approach (negative once past it, m). */
function distanceToGo(runway: RunwayDefinition, aimPastThreshold: number, p: Readonly<Vec3>): number {
  const h = runway.headingDegrees * DEG;
  const along0 = -runway.length / 2 + aimPastThreshold;
  return -((p.x - runway.center.x) * Math.sin(h) + (p.z - runway.center.z) * Math.cos(h) - along0);
}

/**
 * A rough length of the way in to land on `runway` in its direction: to the
 * entry point, plus the turns there and onto the centreline (each radian
 * costs a turn radius), plus the trip out and back when it's already too
 * close in or on the wrong side.
 */
function pathCost(runway: RunwayDefinition, kind: 'airfield' | 'carrier', aimPastThreshold: number, state: Readonly<AircraftState>): number {
  const c = AUTO_LAND_CONFIG;
  const p = state.position;
  const entry = pointOnApproach(runway, aimPastThreshold, c.entryDistance[kind]);
  const dx = entry.x - p.x;
  const dz = entry.z - p.z;
  const moving = Math.hypot(state.velocity.x, state.velocity.z) > 5;
  const heading = moving ? Math.atan2(state.velocity.x, state.velocity.z) : runway.headingDegrees * DEG;
  const bearing = Math.atan2(dx, dz);
  const turns = Math.abs(wrap(bearing - heading)) + Math.abs(wrap(runway.headingDegrees * DEG - bearing));
  const outAndBack = distanceToGo(runway, aimPastThreshold, p) < c.entryDistance[kind] ? 2 * (c.outsideDistance + c.offsetDistance) : 0;
  return Math.hypot(dx, dz) + turns * c.turnCostPerRadian + outAndBack;
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
  // How steeply it may come down, and how hard it can slow: less for a heavy, sluggish aircraft.
  const agility = agilityOf(perf);
  const maxDescent = (c.heavy.maxDescentDeg + (c.maxDescentDeg - c.heavy.maxDescentDeg) * agility) * DEG;
  const interceptMaxDescent = (c.heavy.interceptMaxDescentDeg + (c.interceptMaxDescentDeg - c.heavy.interceptMaxDescentDeg) * agility) * DEG;
  const slowDownRate = c.slowDownRate * (c.heavy.slowDownRateFactor + (1 - c.heavy.slowDownRateFactor) * agility);

  if (state.onGround && auto.phase !== 'intercept') auto.phase = 'rollout';

  // The approach corridor (kept below the glide slope by the terrain
  // generator; for a carrier, the line in to its deck) doesn't count as terrain.
  const corridor = scratchCorridor;
  corridor.aimX = aimX;
  corridor.aimZ = aimZ;
  corridor.fx = fx;
  corridor.fz = fz;
  corridor.runwayLength = r.length;
  if (auto.kind === 'airfield') {
    corridor.length = TERRAIN_CONFIG.airfield.approachLength + auto.aimPastThreshold;
    corridor.halfWidth = TERRAIN_CONFIG.airfield.approachHalfWidth;
  } else {
    corridor.length = c.entryDistance.carrier + 600;
    corridor.halfWidth = 120;
  }
  // The ground under the next few seconds of its actual flight path: the
  // highest, and how close the wheels would come to it on the present climb or sink.
  const path = terrainAlongVelocity(ground, state, c.terrainGuardSeconds, corridor, clearance);

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
      const inCone = toGo > 500 && toGo < entryDistance + 500 && Math.abs(Math.atan2(across, toGo)) < c.captureAngleDeg * DEG;
      const lowEnough = wheelHeight - toGo * glide < Math.max(c.captureHeightMargin, (Math.tan(maxDescent) - glide) * (toGo - 500));
      if (inCone && inbound && lowEnough) {
        auto.phase = 'final';
        break;
      }
      // Too close in (or past the runway) to turn onto final: go out again.
      if (auto.leg === 'entry' && toGo < entryDistance * 0.5) auto.leg = 'outside';
      else if (auto.leg === 'outside' && toGo > entryDistance + c.outsideDistance * 0.5) auto.leg = 'entry';

      let heading: number;
      let goalY: number;
      /** Distance to the next point on the way in (m). */
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
        // It slows for the turn back in at that point, so the turn is tight.
        legDistance = Math.hypot(gx - p.x, gz - p.z);
      }
      // Low down, no steep turns: after a go-around, straight ahead to a safe
      // height first; and close to the ground, only gentle heading changes.
      const track = Math.atan2(state.velocity.x, state.velocity.z);
      const aboveGround = p.y - clearance - ground.heightAt(p.x, p.z);
      if (auto.climbOut && aboveGround > c.climbOutHeight) auto.climbOut = false;
      if (auto.climbOut) heading = track;
      else if (aboveGround < c.lowTurnHeight) heading = track + Math.max(-c.lowTurnMaxDeg * DEG, Math.min(c.lowTurnMaxDeg * DEG, wrap(heading - track)));
      // Height: high enough for the terrain along the way it's really going
      // to fly (the arc of the turn onto the new heading, then on to the
      // next point; beyond that it's the corridor), and along its velocity's
      // next few seconds; it heads for that promptly.
      const lookahead = Math.max(600, Math.min(c.terrainLookahead, legDistance));
      const terrain = Math.max(highestOnTurn(ground, state, heading, lookahead, corridor), path.highest);
      const safeY = Math.max(goalY, terrain + c.terrainClearance);
      const emergency = auto.climbOut || path.closest < c.terrainEmergencyHeight;
      const climb = emergency ? c.maxClimbDeg * DEG : Math.max(-interceptMaxDescent, Math.min(c.maxClimbDeg * DEG, Math.atan2(safeY - p.y, 450)));
      setDirection(target, heading, climb);
      steerTowards(state, spec, target, sticks, TUNING);
      // Fast while far out; slowing only over the last stretch before the
      // next point, to a speed the first stage of flap can take.
      const interceptSpeed = Math.min(perf.stallSpeed * c.interceptSpeedFactor, spec.flaps.maxExtensionSpeed - 8);
      const topShare = c.heavy.transitTopSpeedShare + (c.transitTopSpeedShare - c.heavy.transitTopSpeedShare) * agility;
      const transitSpeed = Math.max(interceptSpeed, Math.min(perf.stallSpeed * c.transitSpeedFactor, perf.topSpeed * topShare));
      const brakingRoom = Math.max(0, legDistance - c.slowDownEnd);
      const targetSpeed = Math.min(transitSpeed, Math.sqrt(interceptSpeed * interceptSpeed + 2 * slowDownRate * brakingRoom));
      holdSpeed(auto, state, targetSpeed, perf.approachThrottle + 0.2, out, dt);
      out.flaps = legDistance < 2_000 && speed < spec.flaps.maxExtensionSpeed - 3 ? 0.5 : 0;
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
        auto.climbOut = true;
        break;
      }
      // Chase a point on the glide path a little ahead, back on the centreline.
      // The point comes closer near the end, so the path converges on the aim
      // point instead of lagging above it. A carrier landing has no flare: the
      // glide line carries on into the deck, so it arrives at the wires
      // descending (the hook catches; floating would miss them all).
      // A sluggish aircraft looks further ahead, so it eases onto the slope rather than overshooting it.
      const lookahead = Math.max(c.minLookahead, Math.min(c.lookahead * (1 + (1 - agility) * 1.5), toGo * 0.5));
      const carrotToGo = toGo - lookahead;
      const carrotX = aimX - fx * carrotToGo;
      const carrotZ = aimZ - fz * carrotToGo;
      const slopeY = r.center.y + clearance + (auto.kind === 'carrier' ? carrotToGo : Math.max(0, carrotToGo)) * glide;
      // Never dive at the slope more steeply than the maximum descent angle,
      // nor towards ground ahead off the corridor (then it climbs; still too
      // high close in, it goes around).
      let carrotY = Math.max(slopeY, p.y - lookahead * Math.tan(maxDescent));
      if (toGo > c.goAround.distance && path.closest < c.finalTerrainMargin) carrotY = Math.max(carrotY, path.highest + clearance + c.finalTerrainMargin);
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
  // Air brakes on the speed it has now (not the predicted one: a heavy
  // aircraft slows more slowly than its trend says), out fully by 20 m/s too fast.
  const excess = speed - targetSpeed;
  out.airbrake = Math.max(0, Math.min(1, (excess - 8) / 12));
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

function inCorridor(corridor: Corridor, x: number, z: number): boolean {
  const dx = x - corridor.aimX;
  const dz = z - corridor.aimZ;
  const toGo = -(dx * corridor.fx + dz * corridor.fz);
  return toGo > -corridor.runwayLength && toGo < corridor.length && Math.abs(dx * corridor.fz - dz * corridor.fx) < corridor.halfWidth;
}

/**
 * The highest ground (outside the corridor) under the path of a turn from
 * the current track onto `heading`, at a typical approach turn radius, then
 * straight on to `distance` metres: where the aircraft will actually be,
 * rather than a straight line from where it is now.
 */
function highestOnTurn(ground: GroundQuery, state: Readonly<AircraftState>, heading: number, distance: number, corridor: Corridor): number {
  const p = state.position;
  const speed = Math.max(40, Math.hypot(state.velocity.x, state.velocity.z));
  // About a 40-degree banked turn: r = v^2 / (g tan 40).
  const radius = (speed * speed) / (9.81 * 0.84);
  let track = Math.hypot(state.velocity.x, state.velocity.z) > 5 ? Math.atan2(state.velocity.x, state.velocity.z) : heading;
  let x = p.x;
  let z = p.z;
  let highest = -Infinity;
  const step = 150;
  for (let travelled = 0; travelled <= distance; travelled += step) {
    const turn = wrap(heading - track);
    const maxTurn = step / radius;
    track += Math.max(-maxTurn, Math.min(maxTurn, turn));
    x += Math.sin(track) * step;
    z += Math.cos(track) * step;
    if (!inCorridor(corridor, x, z)) highest = Math.max(highest, ground.heightAt(x, z));
  }
  return highest === -Infinity ? 0 : highest;
}

const scratchPath = { highest: 0, closest: 0 };

/**
 * Along the next `seconds` of flight on the current velocity (outside the
 * corridor): the highest ground, and the closest the wheels come to the
 * ground or sea on the present climb or sink (m). Written into a scratch object.
 */
function terrainAlongVelocity(ground: GroundQuery, state: Readonly<AircraftState>, seconds: number, corridor: Corridor, clearance: number): { highest: number; closest: number } {
  const p = state.position;
  const v = state.velocity;
  let highest = -Infinity;
  let closest = Infinity;
  for (let t = 0.5; t <= seconds; t += 0.5) {
    const x = p.x + v.x * t;
    const z = p.z + v.z * t;
    if (inCorridor(corridor, x, z)) continue;
    const h = ground.heightAt(x, z);
    highest = Math.max(highest, h);
    closest = Math.min(closest, p.y + v.y * t - clearance - h);
  }
  scratchPath.highest = highest === -Infinity ? 0 : highest;
  scratchPath.closest = closest;
  return scratchPath;
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

/** 0 for a sluggish heavy aircraft (turning at 15 deg/s or less) to 1 for a fighter (35 deg/s and more). */
function agilityOf(perf: AircraftPerformance): number {
  return Math.max(0, Math.min(1, (perf.maxTurnRateDeg - 15) / 20));
}

function performance(spec: AircraftClassSpec): AircraftPerformance {
  let perf = performanceCache.get(spec);
  if (!perf) {
    perf = computePerformance(spec);
    performanceCache.set(spec, perf);
  }
  return perf;
}

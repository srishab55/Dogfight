import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  AUTO_LAND_CONFIG,
  autoLandBaseFor,
  chooseAutoLandBase,
  computePerformance,
  createAirborneState,
  createCarrierStatuses,
  createTerrain,
  createWorldGround,
  groundClearance,
  isOnRunway,
  neutralControls,
  planAutoLand,
  runwayLocal,
  sanitizeControls,
  stepAircraft,
  stepAutoLand,
  baseById,
  homeBase,
  BASES,
  type AircraftClassId,
  type AutoLandPhase,
  type BaseDefinition,
  type Vec3,
} from '../src/index';
import { STEP } from './testPilot';

/*
 * Auto-land, flown by the real flight model over the real world (islands,
 * sea and carriers). What a landing at an ENEMY base does is the normal
 * rules, tested elsewhere: no rearming there (service.test.ts), and no
 * capture unless its defences are all destroyed (bases.test.ts).
 */

const world = createWorldGround(createTerrain());

interface Outcome {
  phase: AutoLandPhase;
  seconds: number;
  crashed: boolean;
  crashReason: string | null;
  /** Worst touchdown: sink rate (m/s) and damage. */
  sinkRate: number;
  damage: number;
  hookEngaged: boolean;
  stoppedOnRunway: boolean;
  /** Where it stopped, in the runway's own frame (m). */
  along: number;
  across: number;
  /** Lowest wheel height above the terrain or sea on the way to final (m). */
  lowestEnRoute: number;
  /** Lowest airspeed on final, over the class's stall speed with full flap. */
  lowestSpeedRatio: number;
}

function autoLand(id: AircraftClassId, base: BaseDefinition, start: Vec3, headingDegrees: number, speed: number, maxSeconds = 400): Outcome {
  const spec = AIRCRAFT_CLASSES[id];
  const landingStall = computePerformance(spec).landingStallSpeed;
  const state = createAirborneState(spec, start, headingDegrees, speed, 0.7);
  const auto = planAutoLand(base, state);
  const controls = neutralControls();
  let lowestEnRoute = Infinity;
  let lowestSpeedRatio = Infinity;
  let sinkRate = 0;
  let damage = 0;
  let touchdowns = 0;
  let time = 0;
  let phase: AutoLandPhase = auto.phase;
  while (time < maxSeconds && !state.crashed) {
    Object.assign(controls, neutralControls(), { throttle: state.throttle });
    phase = stepAutoLand(auto, state, spec, world, controls, STEP);
    if (phase === 'done') break;
    if (phase === 'intercept') lowestEnRoute = Math.min(lowestEnRoute, state.position.y - groundClearance(spec) - world.heightAt(state.position.x, state.position.z));
    stepAircraft(state, sanitizeControls(controls), spec, world, STEP);
    if ((phase === 'final' || phase === 'flare') && !state.onGround) lowestSpeedRatio = Math.min(lowestSpeedRatio, state.telemetry.airspeed / landingStall);
    if (state.touchdownCount !== touchdowns) {
      touchdowns = state.touchdownCount;
      sinkRate = Math.max(sinkRate, state.lastTouchdownSinkRate);
      damage += state.lastTouchdownDamage;
    }
    time += STEP;
  }
  const local = runwayLocal(base.runway, state.position.x, state.position.z);
  return {
    phase,
    seconds: time,
    crashed: state.crashed,
    crashReason: state.crashReason,
    sinkRate,
    damage,
    hookEngaged: state.hookEngaged,
    stoppedOnRunway: isOnRunway(base.runway, state.position.x, state.position.z),
    along: local.along,
    across: local.across,
    lowestEnRoute,
    lowestSpeedRatio,
  };
}

/** A clean landing: stopped, undamaged, on the centreline, and never slow enough to be near the stall. */
function expectCleanLanding(outcome: Outcome, maxSinkRate: number) {
  expect(outcome.crashed, String(outcome.crashReason)).toBe(false);
  expect(outcome.phase).toBe('done');
  expect(outcome.stoppedOnRunway).toBe(true);
  expect(Math.abs(outcome.across)).toBeLessThan(4);
  expect(outcome.damage).toBe(0);
  expect(outcome.sinkRate).toBeLessThan(maxSinkRate);
  expect(outcome.lowestSpeedRatio).toBeGreaterThan(1.1);
}

const south = baseById('south-airfield');
const central = baseById('central-airfield');
const north = baseById('north-airfield');
const blueCarrier = homeBase('blue');
const redCarrier = homeBase('red');

/** A point in a base's runway frame: `along` its heading from the centre, `across` to its right, `y` up (world). */
function near(base: BaseDefinition, along: number, across: number, y: number): Vec3 {
  const h = (base.runway.headingDegrees * Math.PI) / 180;
  const c = base.runway.center;
  return { x: c.x + along * Math.sin(h) + across * Math.cos(h), y, z: c.z + along * Math.cos(h) - across * Math.sin(h) };
}

/** Compass bearing from one point to another (deg). */
const bearing = (from: Vec3, to: { x: number; z: number }) => ((Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI + 360) % 360;

describe('auto-land: choosing the base', { timeout: 20_000 }, () => {
  it('offers the nearest base within range, whoever holds it', () => {
    const fighter = AIRCRAFT_CLASSES.fighterBomber;
    expect(autoLandBaseFor(fighter, near(south, 0, 900, 500))?.id).toBe('south-airfield');
    expect(autoLandBaseFor(fighter, near(north, 0, 900, 500))?.id).toBe('north-airfield');
    expect(autoLandBaseFor(fighter, { x: 300, y: 500, z: -200 })?.id).toBe('central-airfield');
    // Beyond range of everything: no offer.
    expect(autoLandBaseFor(fighter, { x: 0, y: 500, z: -AUTO_LAND_CONFIG.offerRange - 4_000 })).toBeNull();
  });

  it('chooses the base ahead, not the one behind: along a route it never turns back to where it came from', () => {
    const fighter = AIRCRAFT_CLASSES.fighterBomber;
    const a = blueCarrier.runway.center;
    const b = south.runway.center;
    const heading = bearing({ ...a, y: 0 }, b);
    for (const t of [0.25, 0.4, 0.5, 0.6, 0.75]) {
      const state = createAirborneState(fighter, { x: a.x + (b.x - a.x) * t, y: 400, z: a.z + (b.z - a.z) * t }, heading, 110);
      expect(chooseAutoLandBase(fighter, state, null, null)?.id, `at ${t * 100}% of the way`).toBe('south-airfield');
    }
    // Flying the other way, the carrier.
    const back = createAirborneState(fighter, { x: (a.x + b.x) / 2, y: 400, z: (a.z + b.z) / 2 }, (heading + 180) % 360, 110);
    expect(chooseAutoLandBase(fighter, back, null, null)?.id).toBe('blue-carrier');
  });

  it("prefers your bases, and ones you can take, to a defended enemy base just as near", () => {
    const fighter = AIRCRAFT_CLASSES.fighterBomber;
    // Over the middle of the central island, heading south towards the south airfield (Red's, defended) with the central one (nobody's) as near.
    const state = createAirborneState(fighter, { x: -300, y: 500, z: -1_000 }, 180, 110);
    const redHeld = { team: 'blue' as const, ownerOf: (b: BaseDefinition) => (b.id === 'south-airfield' ? ('red' as const) : b.team), isOpen: () => false };
    expect(chooseAutoLandBase(fighter, state, null, null)?.id).toBe('south-airfield');
    expect(chooseAutoLandBase(fighter, state, null, redHeld)?.id).not.toBe('south-airfield');
    // Defenceless, it's worth landing at again: it can be taken.
    expect(chooseAutoLandBase(fighter, state, null, { ...redHeld, isOpen: () => true })?.id).toBe('south-airfield');
  });

  it('carriers only for aircraft with a hook, and never a sinking one', () => {
    const nearBlueCarrier = { x: blueCarrier.runway.center.x - 300, y: 400, z: blueCarrier.runway.center.z };
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.navalFighter, nearBlueCarrier)?.id).toBe('blue-carrier');
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.fighterBomber, nearBlueCarrier)?.id).toBe('blue-carrier');
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.heavyBomber, nearBlueCarrier)?.kind).toBe('airfield');
    const statuses = createCarrierStatuses();
    statuses.get('blue-carrier')!.sink = 3;
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.navalFighter, nearBlueCarrier, statuses)?.kind).toBe('airfield');
    const nearRedCarrier = { x: redCarrier.runway.center.x + 300, y: 400, z: redCarrier.runway.center.z };
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.diveBomber, nearRedCarrier)?.id).toBe('red-carrier');
  });

  it('lands a runway whichever way is the shorter way round; a carrier always from astern', () => {
    const fighter = AIRCRAFT_CLASSES.fighterBomber;
    const h = south.runway.headingDegrees;
    // Before the threshold, already heading along the runway: straight in.
    expect(planAutoLand(south, createAirborneState(fighter, near(south, -3_000, 0, 500), h, 120)).runway.headingDegrees).toBe(h);
    // Beyond the far end, heading back towards it: straight in the other way.
    expect(planAutoLand(south, createAirborneState(fighter, near(south, 3_000, 0, 500), (h + 180) % 360, 120)).runway.headingDegrees).toBe((h + 180) % 360);
    // Abeam, heading the runway's way: it lands that way rather than turning round.
    expect(planAutoLand(south, createAirborneState(fighter, near(south, -500, 2_500, 500), h, 120)).runway.headingDegrees).toBe(h);
    const ahead = { x: blueCarrier.runway.center.x + 2_000 * Math.sin((15 * Math.PI) / 180), y: 600, z: blueCarrier.runway.center.z + 2_000 * Math.cos((15 * Math.PI) / 180) };
    expect(planAutoLand(blueCarrier, createAirborneState(AIRCRAFT_CLASSES.navalFighter, ahead, 0, 120)).runway.headingDegrees).toBe(blueCarrier.runway.headingDegrees);
  });
});

describe('auto-land: runways', { timeout: 30_000 }, () => {
  it.each(AIRCRAFT_CLASS_IDS)('%s: from 4 km out, lands and stops undamaged on the centreline in about a minute (longer for the slow old types)', (id) => {
    const spec = AIRCRAFT_CLASSES[id];
    const start = near(south, -4_200, 1_200, 600);
    const outcome = autoLand(id, south, start, south.runway.headingDegrees - 20, Math.min(120, computePerformance(spec).topSpeed * 0.9));
    expectCleanLanding(outcome, 3);
    expect(outcome.seconds).toBeLessThan(75 * Math.max(1, 40 / computePerformance(spec).stallSpeed));
  });

  it('just after take-off, over the runway, it flies out, turns back (a teardrop) and lands, quickly', () => {
    const outcome = autoLand('interceptor', south, near(south, 0, 0, 30), south.runway.headingDegrees, 80);
    expectCleanLanding(outcome, 3);
    expect(outcome.seconds).toBeLessThan(120);
  });

  it('turns round from the far side and lands', () => {
    const outcome = autoLand('fighterBomber', central, near(central, 2_500, 1_500, 900), central.runway.headingDegrees, 140);
    expectCleanLanding(outcome, 3);
    expect(outcome.seconds).toBeLessThan(110);
  });

  it("from abeam, low and fast across the island's hills, it climbs over them, lines up and lands", () => {
    const spec = AIRCRAFT_CLASSES.interceptor;
    const outcome = autoLand('interceptor', south, near(south, 0, 2_000, 150), (south.runway.headingDegrees + 270) % 360, computePerformance(spec).topSpeed * 0.9);
    expect(outcome.lowestEnRoute).toBeGreaterThan(40);
    expectCleanLanding(outcome, 3);
  });

  it("climbs over the central island's mountain rather than into it", () => {
    const peak = { x: 250, z: 360 };
    const start = { x: peak.x - 300, y: 250, z: peak.z - 2_200 };
    const outcome = autoLand('fighterBomber', north, start, 0, 120);
    expect(outcome.lowestEnRoute).toBeGreaterThan(60);
    expectCleanLanding(outcome, 3);
  });

  it('the heavy bomber lands without running off the end', () => {
    expectCleanLanding(autoLand('heavyBomber', central, near(central, -1_500, 3_000, 1_000), 270, 110), 3);
  });
});

describe('auto-land: from all round every base, it never hits the ground', { timeout: 120_000 }, () => {
  const cases: [string, BaseDefinition, AircraftClassId, number][] = [];
  for (const base of BASES) {
    const id: AircraftClassId = base.kind === 'carrier' ? 'navalFighter' : 'fighterBomber';
    for (let b = 0; b < 360; b += 45) cases.push([`${base.id} from ${b}°`, base, id, b]);
  }
  it.each(cases)('%s', (_label, base, id, fromBearing) => {
    const c = base.runway.center;
    const r = (fromBearing * Math.PI) / 180;
    // 3.5 km out, 250 m up, flying across the line to the base (not at it).
    const start = { x: c.x + Math.sin(r) * 3_500, y: 250, z: c.z + Math.cos(r) * 3_500 };
    const heading = (bearing(start, c) + 70) % 360;
    const outcome = autoLand(id, base, start, heading, 110);
    expect(outcome.crashed, String(outcome.crashReason)).toBe(false);
    expect(outcome.phase).toBe('done');
    expect(outcome.stoppedOnRunway).toBe(true);
    expect(outcome.lowestEnRoute).toBeGreaterThan(25);
    expect(outcome.seconds).toBeLessThan(150);
  });
});

describe('auto-land: carriers', { timeout: 30_000 }, () => {
  const h = (blueCarrier.runway.headingDegrees * Math.PI) / 180;
  const c = blueCarrier.runway.center;
  const at = (ahead: number, right: number, y: number): Vec3 => ({ x: c.x + Math.sin(h) * ahead + Math.cos(h) * right, y, z: c.z + Math.cos(h) * ahead - Math.sin(h) * right });
  const starts: [string, Vec3, number][] = [
    ['from the side', at(0, 1_800, 700), (blueCarrier.runway.headingDegrees + 250) % 360],
    ['from ahead of the bow', at(2_800, 0, 500), (blueCarrier.runway.headingDegrees + 180) % 360],
    ['from astern', at(-4_500, 300, 400), blueCarrier.runway.headingDegrees],
  ];
  describe.each(['navalFighter', 'diveBomber', 'interceptor', 'fighterBomber'] as const)('%s', (id) => {
    it.each(starts)('%s: flies onto the deck and catches a wire', (_label, start, heading) => {
      const outcome = autoLand(id, blueCarrier, start, heading, 130);
      expect(outcome.crashed, String(outcome.crashReason)).toBe(false);
      expect(outcome.phase).toBe('done');
      expect(outcome.hookEngaged).toBe(true);
      expect(outcome.stoppedOnRunway).toBe(true);
      expect(outcome.damage).toBe(0);
      expect(outcome.lowestSpeedRatio).toBeGreaterThan(1.1);
      expect(outcome.seconds).toBeLessThan(130);
    });
  });

  it('lands on the enemy carrier too', () => {
    const rh = (redCarrier.runway.headingDegrees * Math.PI) / 180;
    const rc = redCarrier.runway.center;
    const outcome = autoLand('navalFighter', redCarrier, { x: rc.x + Math.cos(rh) * 2_000, y: 700, z: rc.z - Math.sin(rh) * 2_000 }, 90, 130);
    expect(outcome.crashed, String(outcome.crashReason)).toBe(false);
    expect(outcome.hookEngaged).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  AUTO_LAND_CONFIG,
  autoLandBaseFor,
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
  teamBase,
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

const blueAirfield = teamBase('blue', 'airfield');
const blueCarrier = teamBase('blue', 'carrier');
const redAirfield = teamBase('red', 'airfield');
const redCarrier = teamBase('red', 'carrier');

describe('auto-land: choosing the base', { timeout: 20_000 }, () => {
  it('offers the nearest base within range, of either team', () => {
    const fighter = AIRCRAFT_CLASSES.fighterBomber;
    expect(autoLandBaseFor(fighter, { x: 0, y: 500, z: -6_000 })?.id).toBe('blue-airfield');
    expect(autoLandBaseFor(fighter, { x: 500, y: 500, z: 6_000 })?.id).toBe('red-airfield');
    // Beyond range of everything: no offer.
    expect(autoLandBaseFor(fighter, { x: 0, y: 500, z: -6_000 - AUTO_LAND_CONFIG.offerRange - 500 })).toBeNull();
  });

  it('carriers only for aircraft with a hook, and never a sinking one', () => {
    const nearBlueCarrier = { x: blueCarrier.runway.center.x - 300, y: 400, z: blueCarrier.runway.center.z };
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.navalFighter, nearBlueCarrier)?.id).toBe('blue-carrier');
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.fighterBomber, nearBlueCarrier)?.id).toBe('blue-carrier');
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.heavyBomber, nearBlueCarrier)?.id).toBe('blue-airfield');
    const statuses = createCarrierStatuses();
    statuses.get('blue-carrier')!.sink = 3;
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.navalFighter, nearBlueCarrier, statuses)?.id).toBe('blue-airfield');
    const nearRedCarrier = { x: redCarrier.runway.center.x + 300, y: 400, z: redCarrier.runway.center.z };
    expect(autoLandBaseFor(AIRCRAFT_CLASSES.diveBomber, nearRedCarrier)?.id).toBe('red-carrier');
  });

  it('lands a runway in whichever direction is nearer; a carrier always from astern', () => {
    const fromSouth = planAutoLand(blueAirfield, createAirborneState(AIRCRAFT_CLASSES.fighterBomber, { x: 0, y: 600, z: -9_000 }, 0, 120));
    const fromNorth = planAutoLand(blueAirfield, createAirborneState(AIRCRAFT_CLASSES.fighterBomber, { x: 0, y: 600, z: 1_000 }, 180, 120));
    expect(fromSouth.runway.headingDegrees).toBe(blueAirfield.runway.headingDegrees);
    expect(fromNorth.runway.headingDegrees).toBe((blueAirfield.runway.headingDegrees + 180) % 360);
    const ahead = { x: blueCarrier.runway.center.x + 2_000 * Math.sin((15 * Math.PI) / 180), y: 600, z: blueCarrier.runway.center.z + 2_000 * Math.cos((15 * Math.PI) / 180) };
    expect(planAutoLand(blueCarrier, createAirborneState(AIRCRAFT_CLASSES.navalFighter, ahead, 0, 120)).runway.headingDegrees).toBe(blueCarrier.runway.headingDegrees);
  });
});

describe('auto-land: runways', { timeout: 20_000 }, () => {
  it.each(AIRCRAFT_CLASS_IDS)('%s: from 6 km out, lands and stops undamaged on the centreline, in under two minutes', (id) => {
    const outcome = autoLand(id, blueAirfield, { x: 1_200, y: 800, z: -10_000 }, 20, 120);
    expectCleanLanding(outcome, 3);
    expect(outcome.seconds).toBeLessThan(120);
  });

  it('just after take-off, over the runway, it flies out, turns back (a teardrop) and lands', () => {
    expectCleanLanding(autoLand('interceptor', blueAirfield, { x: 0, y: 30, z: -3_500 }, 0, 80), 3);
  });

  it('turns round from the far side and lands the other way', () => {
    const outcome = autoLand('fighterBomber', blueAirfield, { x: 1_500, y: 900, z: 1_500 }, 0, 140);
    expectCleanLanding(outcome, 3);
  });

  it('from abeam, low and fast, it slows down, lines up and lands', () => {
    const spec = AIRCRAFT_CLASSES.interceptor;
    const outcome = autoLand('interceptor', blueAirfield, { x: -5_000, y: 300, z: -4_000 }, 90, computePerformance(spec).topSpeed * 0.9);
    expectCleanLanding(outcome, 3);
  });

  it('climbs over the central island\'s mountain rather than into it', () => {
    const outcome = autoLand('fighterBomber', blueAirfield, { x: 6_000, y: 350, z: 500 }, 270, 120);
    expect(outcome.lowestEnRoute).toBeGreaterThan(100);
    expectCleanLanding(outcome, 3);
  });

  it('the heavy bomber lands without running off the end', () => {
    expectCleanLanding(autoLand('heavyBomber', blueAirfield, { x: 3_000, y: 1_200, z: -1_000 }, 270, 110), 3);
  });

  it('lands at an enemy airfield too', () => {
    expectCleanLanding(autoLand('fighterBomber', redAirfield, { x: 0, y: 900, z: 0 }, 0, 140), 3);
  });
});

describe('auto-land: carriers', { timeout: 20_000 }, () => {
  const starts: [string, Vec3, number][] = [
    ['from the side', { x: -1_500, y: 700, z: -1_000 }, 240],
    ['from ahead of the bow', { x: -3_300, y: 500, z: 1_500 }, 200],
    ['from astern', { x: -5_500, y: 400, z: -6_500 }, 15],
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
    });
  });

  it('lands on the enemy carrier too', () => {
    const outcome = autoLand('navalFighter', redCarrier, { x: 2_500, y: 700, z: 1_500 }, 90, 130);
    expect(outcome.crashed, String(outcome.crashReason)).toBe(false);
    expect(outcome.hookEngaged).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  LANDING_GEAR_CONFIG,
  baseSpawnPoint,
  computePerformance,
  createAirborneState,
  createApproachState,
  createParkedState,
  createTerrain,
  createWorldGround,
  groundClearance,
  baseById,
  homeBase,
  type AircraftState,
} from '../src/index';
import { fly, holdVerticalSpeed, rollToBank, type PilotView } from './testPilot';

/*
 * Automatic retractable gear: up soon after take-off, down coming in to
 * land, drag when down, and no wheels to land on when up.
 */

const world = createWorldGround(createTerrain());
const wheelHeight = (state: AircraftState, spec = AIRCRAFT_CLASSES.fighterBomber) => state.position.y - groundClearance(spec) - world.heightAt(state.position.x, state.position.z);

describe('landing gear', () => {
  it.each(AIRCRAFT_CLASS_IDS.filter((id) => AIRCRAFT_CLASSES[id].homeBase === 'airfield' && !AIRCRAFT_CLASSES[id].airframe.fixedGear))('%s: retracts within a few seconds of lifting off', (id) => {
    const spec = AIRCRAFT_CLASSES[id];
    const state = createParkedState(spec, baseSpawnPoint(baseById('south-airfield')));
    expect(state.gearPosition).toBe(1);
    let liftOff = -1;
    let retracted = -1;
    fly(
      state,
      spec,
      90,
      (v: PilotView) => ({ throttle: 1, flaps: 0.5, pitch: v.state.telemetry.airspeed > computePerformance(spec).stallSpeed * 1.15 ? Math.max(-1, Math.min(1, (10 - v.attitude.pitchDeg) / 8 - v.pitchRateDeg / 25)) : 0, roll: rollToBank(v, 0) }),
      (v) => {
        if (liftOff < 0 && !v.state.onGround) liftOff = v.time;
        if (retracted < 0 && v.state.gearPosition === 0) retracted = v.time;
        return retracted > 0;
      },
      world,
    );
    expect(state.crashed).toBe(false);
    expect(liftOff).toBeGreaterThan(0);
    expect(retracted - liftOff).toBeLessThan(LANDING_GEAR_CONFIG.travelTime + 8);
    expect(wheelHeight(state, spec)).toBeGreaterThan(LANDING_GEAR_CONFIG.retract.minHeight);
  });

  it.each(AIRCRAFT_CLASS_IDS.filter((id) => AIRCRAFT_CLASSES[id].airframe.fixedGear))("%s: fixed gear stays down in the air (its drag is part of the airframe's)", (id) => {
    const spec = AIRCRAFT_CLASSES[id];
    const state = createAirborneState(spec, { x: 0, y: 800, z: 0 }, 0, computePerformance(spec).stallSpeed * 1.8, 0.8);
    expect(state.gearPosition).toBe(1);
    fly(state, spec, 10, (v) => ({ throttle: 0.8, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 3) }), undefined, world);
    expect(state.gearPosition).toBe(1);
  });

  it('a catapult launch raises it once clear of the deck', () => {
    const spec = AIRCRAFT_CLASSES.navalFighter;
    const state = createParkedState(spec, baseSpawnPoint(homeBase('blue')), true);
    fly(state, spec, 25, (v) => ({ throttle: 1, flaps: 0.5, roll: rollToBank(v, 0), pitch: v.state.onGround ? 0 : holdVerticalSpeed(v, 6) }), undefined, world);
    expect(state.crashed).toBe(false);
    expect(state.gearPosition).toBe(0);
  });

  it('comes down by itself on a descent towards a runway, and is locked before touchdown', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const perf = computePerformance(spec);
    const state = createApproachState(spec, baseById('south-airfield').runway, { distanceFromThreshold: 2_500, glideSlopeDeg: 3, aimPointPastThreshold: 300, speed: perf.approachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    state.gearPosition = 0; // as if it had arrived with it up
    let lockedAt = Infinity;
    fly(state, spec, 120, (v) => ({ throttle: perf.approachThrottle, flaps: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, -perf.approachSpeed * Math.tan((3 * Math.PI) / 180)) }), (v) => {
      if (v.state.gearPosition >= LANDING_GEAR_CONFIG.lockedPosition && lockedAt === Infinity) lockedAt = wheelHeight(v.state, spec);
      return v.state.onGround;
    }, world);
    expect(state.crashed, String(state.crashReason)).toBe(false);
    expect(state.onGround).toBe(true);
    expect(lockedAt).toBeGreaterThan(30);
  });

  it('stays down through a short climb on an approach (getting back onto the glide slope)', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const perf = computePerformance(spec);
    const state = createApproachState(spec, baseById('south-airfield').runway, { distanceFromThreshold: 2_500, glideSlopeDeg: 3, aimPointPastThreshold: 300, speed: perf.approachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    fly(state, spec, 6, (v) => ({ throttle: 0.9, flaps: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 4) }), undefined, world);
    expect(state.velocity.y).toBeGreaterThan(2);
    expect(state.gearPosition).toBe(1);
  });

  it('stays up in fast low flying (a strafing run), and in a level cruise', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const fast = createAirborneState(spec, { x: 0, y: 40, z: -2_000 }, 0, spec.flaps.maxExtensionSpeed + LANDING_GEAR_CONFIG.extend.speedAboveFlapLimit + 15, 1);
    fly(fast, spec, 8, (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, -1) }), undefined, world);
    expect(fast.gearPosition).toBe(0);
    const cruise = createAirborneState(spec, { x: 0, y: 1_000, z: 0 }, 0, 100, 0.6);
    fly(cruise, spec, 10, (v) => ({ roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) }), undefined, world);
    expect(cruise.gearPosition).toBe(0);
  });

  it('adds drag: gear down is slower at the same power', () => {
    const spec = AIRCRAFT_CLASSES.interceptor;
    const run = (gear: number) => {
      // High over the sea, so the automatic gear leaves it where it is.
      const state = createAirborneState(spec, { x: 0, y: 2_000, z: 0 }, 0, 90, 0.5);
      state.gearPosition = gear;
      fly(state, spec, 20, (v) => ({ throttle: 0.5, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) }), undefined, world);
      return state.telemetry.airspeed;
    };
    expect(run(1)).toBeLessThan(run(0) - 1);
  });

  it('touching down with it up is a belly landing', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const runway = baseById('south-airfield').runway;
    const state = createAirborneState(spec, { x: runway.center.x, y: runway.center.y + groundClearance(spec) + 0.4, z: runway.center.z }, runway.headingDegrees, 55, 0);
    state.velocity.y = -1.5;
    fly(state, spec, 3, () => ({ throttle: 0 }), undefined, world);
    expect(state.crashed).toBe(true);
    expect(state.crashReason).toBe('belly landing (gear up)');
  });
});

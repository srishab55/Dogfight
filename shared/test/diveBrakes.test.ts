import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_IDS, computePerformance, createAirborneState, type AircraftClassSpec } from '../src/index';
import { quatFromAxisAngle, multiplyQuat, quatIdentity } from '../src/math/quat';
import { fly, rollToBank } from './testPilot';

/** Pointing straight down at 4 km, idle, at `speed`; returns the speed after `seconds` of holding the dive. */
function verticalDive(spec: AircraftClassSpec, airbrake: number, seconds: number): number {
  const state = createAirborneState(spec, { x: 0, y: 4_000, z: 0 }, 0, 80, 0);
  // Nose down 90 degrees: in our axes a positive rotation about X pitches the nose down.
  multiplyQuat(state.orientation, state.orientation, quatFromAxisAngle(quatIdentity(), { x: 1, y: 0, z: 0 }, Math.PI / 2));
  state.velocity = { x: 0, y: -80, z: 0 };
  state.airbrakePosition = airbrake;
  fly(state, spec, seconds, (v) => ({ throttle: 0, airbrake, roll: rollToBank(v, 0) }));
  return state.telemetry.airspeed;
}

describe('dive brakes', () => {
  const diveBomber = AIRCRAFT_CLASSES.diveBomber;

  it('hold a vertical dive near 400-450 km/h, where a clean dive keeps accelerating far past it', () => {
    const braked = verticalDive(diveBomber, 1, 25);
    const clean = verticalDive(diveBomber, 0, 25);
    expect(braked * 3.6).toBeGreaterThan(350);
    expect(braked * 3.6).toBeLessThan(500);
    expect(clean).toBeGreaterThan(braked * 1.35);
  });

  it('take their travel time to open', () => {
    const state = createAirborneState(diveBomber, { x: 0, y: 2_000, z: 0 }, 0, 100, 0.5);
    fly(state, diveBomber, diveBomber.airbrake!.travelTime / 2, () => ({ airbrake: 1 }));
    expect(state.airbrakePosition).toBeGreaterThan(0.4);
    expect(state.airbrakePosition).toBeLessThan(0.6);
  });

  it('every class has air brakes, and the dive bomber has by far the strongest', () => {
    for (const id of AIRCRAFT_CLASS_IDS) {
      const brakes = AIRCRAFT_CLASSES[id].airbrake;
      expect(brakes).toBeDefined();
      if (id !== 'diveBomber') expect(brakes!.dragIncrement).toBeLessThan(diveBomber.airbrake!.dragIncrement / 1.8);
    }
  });

  it.each(AIRCRAFT_CLASS_IDS)('%s: air brakes slow it down in level flight even at full throttle', (id) => {
    const spec = AIRCRAFT_CLASSES[id];
    const perf = computePerformance(spec);
    const run = (airbrake: number) => {
      const state = createAirborneState(spec, { x: 0, y: 1_500, z: 0 }, 0, perf.topSpeed * 0.9, 1);
      fly(state, spec, 10, (v) => ({ throttle: 1, airbrake, roll: rollToBank(v, 0), pitch: Math.max(-1, Math.min(1, (1_500 - v.state.position.y) / 40 - v.state.velocity.y / 8)) }));
      return state.telemetry.airspeed;
    };
    const start = perf.topSpeed * 0.9;
    expect(run(1)).toBeLessThan(start - 15);
    expect(run(0)).toBeGreaterThan(start - 3);
  });

  it('do not change the stall speed (drag only, no lift)', () => {
    const withBrakes: AircraftClassSpec = diveBomber;
    expect(computePerformance(withBrakes).stallSpeed).toBeCloseTo(computePerformance({ ...diveBomber, airbrake: undefined }).stallSpeed, 6);
  });
});

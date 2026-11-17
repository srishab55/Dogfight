import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_IDS, computePerformance, createAirborneState, createSteeringAssistMemory, getAttitude, steerWithTurnInput } from '../src/index';
import { angleDifference, fly } from './testPilot';

/*
 * Car-like keyboard steering: hold left or right to turn, let go and it
 * flies straight and level again by itself.
 */
describe.each(AIRCRAFT_CLASS_IDS)('%s', (id) => {
  const spec = AIRCRAFT_CLASSES[id];
  const perf = computePerformance(spec);
  const fighter = id !== 'heavyBomber';
  /** Seconds to come round 90 degrees: fighters quickest, the dive bomber a little slower, the heavy bomber slowest. */
  const quarterTurnSeconds = { interceptor: 4.5, fighterBomber: 4.5, navalFighter: 4.5, diveBomber: 5.5, heavyBomber: 10 }[id];

  it('holding "right" turns it round quickly without losing height; letting go levels the wings and holds height', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.cornerSpeed * 0.9, 1);
    const memory = createSteeringAssistMemory();
    const sticks = { pitch: 0, roll: 0, yaw: 0 };
    let turnedAt = Number.NaN;
    let lowest = Infinity;
    let highest = -Infinity;
    // Hold right until the heading has come round 90 degrees, then let go.
    fly(state, spec, 30, (v) => {
      const turning = Number.isNaN(turnedAt);
      if (turning && angleDifference(getAttitude(v.state.orientation).headingDeg, 0) > 85) turnedAt = v.time;
      return { ...steerWithTurnInput(v.state, spec, Number.isNaN(turnedAt) ? 1 : 0, false, memory, sticks), throttle: 1 };
    }, (v) => {
      lowest = Math.min(lowest, v.state.position.y);
      highest = Math.max(highest, v.state.position.y);
      return !Number.isNaN(turnedAt) && v.time > turnedAt + 6;
    });
    expect(turnedAt).toBeLessThan(quarterTurnSeconds);
    expect(1500 - lowest).toBeLessThan(60);
    expect(highest - 1500).toBeLessThan(60);
    const after = getAttitude(state.orientation);
    expect(Math.abs(after.bankDeg)).toBeLessThan(5);
    expect(Math.abs(state.velocity.y)).toBeLessThan(2);
    // It stopped turning near where the key was let go (a little roll-out overshoot is fine).
    expect(Math.abs(angleDifference(after.headingDeg, 90))).toBeLessThan(fighter ? 15 : 20);
  });

  it('with nothing pressed it flies straight and level, and a short tap makes a small heading change', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2, 0.7);
    const memory = createSteeringAssistMemory();
    const sticks = { pitch: 0, roll: 0, yaw: 0 };
    fly(state, spec, 12, (v) => ({ ...steerWithTurnInput(v.state, spec, v.time < 0.4 ? -0.5 : 0, false, memory, sticks), throttle: 0.7 }));
    const attitude = getAttitude(state.orientation);
    expect(Math.abs(attitude.bankDeg)).toBeLessThan(3);
    expect(angleDifference(attitude.headingDeg, 0)).toBeLessThan(0);
    expect(angleDifference(attitude.headingDeg, 0)).toBeGreaterThan(-40);
    expect(Math.abs(state.position.y - 1500)).toBeLessThan(40);
  });
});

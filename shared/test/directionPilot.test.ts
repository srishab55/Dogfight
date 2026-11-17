import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_IDS, computePerformance, createAirborneState, getAttitude, steerTowards, type Vec3 } from '../src/index';
import { angleDifference, fly } from './testPilot';

/*
 * The direction pilot behind mouse flight (and, later, the AI): point it at a
 * direction and it should get the nose there smoothly, without stalling,
 * oscillating or losing much height.
 */

const DEG = Math.PI / 180;
/** World direction for a compass heading and elevation (deg). */
const direction = (headingDeg: number, elevationDeg = 0): Vec3 => ({
  x: Math.cos(elevationDeg * DEG) * Math.sin(headingDeg * DEG),
  y: Math.sin(elevationDeg * DEG),
  z: Math.cos(elevationDeg * DEG) * Math.cos(headingDeg * DEG),
});

describe.each(AIRCRAFT_CLASS_IDS)('%s', (id) => {
  const spec = AIRCRAFT_CLASSES[id];
  const perf = computePerformance(spec);
  const sticks = { pitch: 0, roll: 0, yaw: 0 };
  const steer = (target: Vec3, throttle = 0.9) => (v: Parameters<Parameters<typeof fly>[3]>[0]) => ({ ...steerTowards(v.state, spec, target, sticks), throttle });

  it('turns to a heading 90 degrees right and settles there, wings level', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2.2, 0.9);
    fly(state, spec, 40, steer(direction(90)));
    const attitude = getAttitude(state.orientation);
    expect(Math.abs(angleDifference(attitude.headingDeg, 90))).toBeLessThan(6);
    expect(Math.abs(attitude.bankDeg)).toBeLessThan(8);
    expect(state.position.y).toBeGreaterThan(1300);
    expect(state.crashed).toBe(false);
  });

  it('turns right round to fly back the way it came', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2.2, 1);
    fly(state, spec, 60, steer(direction(180), 1));
    expect(Math.abs(angleDifference(getAttitude(state.orientation).headingDeg, 180))).toBeLessThan(8);
    expect(state.position.y).toBeGreaterThan(1200);
  });

  it('climbs to a target 20 degrees above the horizon', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2.4, 1);
    fly(state, spec, 8, steer(direction(0, 20), 1));
    expect(getAttitude(state.orientation).pitchDeg).toBeGreaterThan(12);
  });

  it('cannot be made to stall: a hard pull at low speed stays below the critical angle', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 1.3, 0.3);
    let stalled = false;
    fly(state, spec, 12, steer(direction(0, 60), 0.3), (v) => {
      stalled ||= v.state.telemetry.stalled;
      return false;
    });
    expect(stalled).toBe(false);
  });

  it('points the nose (the guns) at the target, not just the flight path', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2.2, 0.8);
    const goal = direction(20, -8);
    fly(state, spec, 12, steer(goal, 0.8));
    const noseX = 2 * (state.orientation.x * state.orientation.z + state.orientation.w * state.orientation.y);
    const noseY = 2 * (state.orientation.y * state.orientation.z - state.orientation.w * state.orientation.x);
    const noseZ = 1 - 2 * (state.orientation.x * state.orientation.x + state.orientation.y * state.orientation.y);
    const errorDeg = Math.acos(Math.min(1, noseX * goal.x + noseY * goal.y + noseZ * goal.z)) / DEG;
    expect(errorDeg).toBeLessThan(1.5);
  });

  it('flies straight and level when the target is straight ahead (no wobble)', () => {
    const state = createAirborneState(spec, { x: 0, y: 1500, z: 0 }, 0, perf.stallSpeed * 2, 0.6);
    let worstBank = 0;
    fly(state, spec, 20, steer(direction(0), 0.6), (v) => {
      if (v.time > 3) worstBank = Math.max(worstBank, Math.abs(v.attitude.bankDeg));
      return false;
    });
    expect(worstBank).toBeLessThan(3);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  HOME_RUNWAY,
  TERRAIN_CONFIG,
  computePerformance,
  createApproachState,
  createAirborneState,
  createTerrain,
  getRunwaySpawnPoint,
  createParkedState,
  proceduralHeight,
  stepAircraft,
  neutralControls,
} from '../src/index';
import { STEP } from './testPilot';

const terrain = createTerrain();

describe('terrain', () => {
  it('is deterministic: the same seed builds the same landscape', () => {
    const again = createTerrain();
    expect(Array.from(again.heights.slice(0, 2000))).toEqual(Array.from(terrain.heights.slice(0, 2000)));
  });

  it('heightAt matches the grid exactly at the vertices (render mesh = physics ground)', () => {
    const { origin, cellSize, resolution } = terrain;
    for (const [i, j] of [[10, 10], [128, 40], [200, 250], [3, 199]] as const) {
      const expected = terrain.heights[j * (resolution + 1) + i] ?? NaN;
      expect(terrain.heightAt(origin + i * cellSize, origin + j * cellSize)).toBeCloseTo(expected, 4);
    }
  });

  it('is flat at runway height over the runway and along its approach corridor', () => {
    const c = HOME_RUNWAY.center;
    for (const dz of [-3500, -2500, -800, 0, 500, 800, 2500]) {
      for (const dx of [-200, 0, 150]) expect(Math.abs(terrain.heightAt(c.x + dx, c.z + dz) - c.y)).toBeLessThan(0.5);
    }
  });

  it('has a ring of mountains around the battle area, and flat ground beyond the terrain', () => {
    let highest = 0;
    for (let a = 0; a < 360; a += 5) {
      const r = 8_500;
      highest = Math.max(highest, terrain.heightAt(Math.sin((a * Math.PI) / 180) * r, Math.cos((a * Math.PI) / 180) * r));
    }
    expect(highest).toBeGreaterThan(900);
    expect(terrain.heightAt(TERRAIN_CONFIG.size, 0)).toBe(0);
    // Inside the battle area the hills stay gentle.
    let worstInside = 0;
    for (let x = -5_000; x <= 5_000; x += 500) for (let z = -5_000; z <= 5_000; z += 500) worstInside = Math.max(worstInside, Math.abs(proceduralHeight(x, z)));
    expect(worstInside).toBeLessThan(120);
  });

  it('flying into a mountain is a crash', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    // Find a tall point on the ring and fly at it level, 300 m below its top.
    let peak = { x: 0, z: 0, h: 0 };
    for (let a = 0; a < 360; a += 3) {
      const x = Math.sin((a * Math.PI) / 180) * 8_400;
      const z = Math.cos((a * Math.PI) / 180) * 8_400;
      const h = terrain.heightAt(x, z);
      if (h > peak.h) peak = { x, z, h };
    }
    const heading = (Math.atan2(peak.x, peak.z) * 180) / Math.PI;
    const start = { x: peak.x * 0.6, y: peak.h - 300, z: peak.z * 0.6 };
    const state = createAirborneState(spec, start, heading, 120, 1);
    const controls = { ...neutralControls(), throttle: 1 };
    for (let t = 0; t < 120 && !state.crashed; t += STEP) {
      // Hold altitude crudely so it doesn't just climb over.
      controls.pitch = Math.max(-1, Math.min(1, (start.y - state.position.y) / 30 - state.velocity.y / 10));
      stepAircraft(state, controls, spec, terrain, STEP);
    }
    expect(state.crashed).toBe(true);
  });

  it('take-off and the landing-practice approach still work on the real terrain', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const parked = createParkedState(spec, getRunwaySpawnPoint(HOME_RUNWAY, 60));
    for (let t = 0; t < 5; t += STEP) stepAircraft(parked, { ...neutralControls(), brake: 1 }, spec, terrain, STEP);
    expect(parked.crashed).toBe(false);
    expect(parked.onGround).toBe(true);

    const perf = computePerformance(spec);
    const approach = createApproachState(spec, HOME_RUNWAY, { distanceFromThreshold: 2500, glideSlopeDeg: 3, aimPointPastThreshold: 300, speed: perf.handsOffApproachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    const controls = { ...neutralControls(), throttle: perf.approachThrottle, flaps: 1 };
    for (let t = 0; t < 120 && approach.touchdownCount === 0 && !approach.crashed; t += STEP) stepAircraft(approach, controls, spec, terrain, STEP);
    expect(approach.crashed).toBe(false);
    expect(approach.touchdownCount).toBe(1);
  });
});

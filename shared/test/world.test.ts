import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  BLUE_CARRIER,
  CARRIERS,
  HOME_RUNWAY,
  PRACTICE_TARGET_CONFIG,
  RUNWAYS,
  SEA_FLOOR_HEIGHT,
  TERRAIN_CONFIG,
  WORLD_CONFIG,
  carrierDeckRunway,
  computePerformance,
  createAirborneState,
  createApproachState,
  createParkedState,
  createTerrain,
  createWorldGround,
  getRunwaySpawnPoint,
  naturalHeight,
  neutralControls,
  runwayLocal,
  stepAircraft,
} from '../src/index';
import { STEP } from './testPilot';

const terrain = createTerrain();
const world = createWorldGround(terrain);
const SEA = WORLD_CONFIG.seaLevel;

/** Corners and edge midpoints of a rectangle around a runway, in world space. */
function aroundRunway(runway: (typeof RUNWAYS)[number], halfLength: number, halfWidth: number): Array<{ x: number; z: number }> {
  const h = (runway.headingDegrees * Math.PI) / 180;
  const points = [];
  for (const along of [-halfLength, 0, halfLength]) {
    for (const across of [-halfWidth, 0, halfWidth]) {
      points.push({ x: runway.center.x + along * Math.sin(h) + across * Math.cos(h), z: runway.center.z + along * Math.cos(h) - across * Math.sin(h) });
    }
  }
  return points;
}

describe('island terrain', () => {
  it('is deterministic: the same seed builds the same landscape', () => {
    const again = createTerrain();
    expect(Array.from(again.heights.slice(0, 4000))).toEqual(Array.from(terrain.heights.slice(0, 4000)));
  });

  it('heightAt matches the grid exactly at the vertices (render mesh = physics ground)', () => {
    const { origin, cellSize, resolution } = terrain;
    for (const [i, j] of [[10, 10], [160, 80], [200, 240], [3, 249]] as const) {
      const expected = terrain.heights[j * (resolution + 1) + i] ?? NaN;
      expect(terrain.heightAt(origin + i * cellSize, origin + j * cellSize)).toBeCloseTo(expected, 4);
    }
  });

  it('three islands stand above the sea, the central mountain highest; open sea lies between them', () => {
    const tops = TERRAIN_CONFIG.islands.map((island) => {
      let top = -Infinity;
      for (let dx = -island.radiusX; dx <= island.radiusX; dx += 50) {
        for (let dz = -island.radiusZ; dz <= island.radiusZ; dz += 50) top = Math.max(top, terrain.heightAt(island.center.x + dx, island.center.z + dz));
      }
      return top - SEA;
    });
    const [south, north, central] = tops as [number, number, number];
    expect(south).toBeGreaterThan(150);
    expect(north).toBeGreaterThan(150);
    expect(central).toBeGreaterThan(300);
    expect(central).toBeLessThan(600);
    expect(central).toBeGreaterThan(Math.max(south, north));
    // Sea between the islands (and around the carriers), and the deep sea floor beyond the terrain.
    expect(terrain.heightAt(-2_500, 0)).toBeLessThan(SEA - 20);
    expect(terrain.heightAt(0, -1_150)).toBeLessThan(SEA - 20);
    expect(terrain.heightAt(0, 1_150)).toBeLessThan(SEA - 20);
    expect(terrain.heightAt(TERRAIN_CONFIG.size, 0)).toBe(SEA_FLOOR_HEIGHT);
  });

  it('each runway sits on dry land, flat at runway height, with its approaches clear', () => {
    for (const runway of RUNWAYS) {
      // The island itself, before flattening, covers the whole pad: no artificial causeway.
      for (const p of aroundRunway(runway, runway.length / 2 + 150, 110)) expect(naturalHeight(p.x, p.z)).toBeGreaterThan(SEA + 0.5);
      for (const p of aroundRunway(runway, runway.length / 2, runway.width / 2)) expect(Math.abs(terrain.heightAt(p.x, p.z) - runway.center.y)).toBeLessThan(0.3);
      // Nothing pokes above a 2-degree surface rising from either runway end.
      for (let past = 200; past < 4_000; past += 100) {
        for (const end of [-1, 1]) {
          for (const across of [-250, 0, 250]) {
            const along = end * (runway.length / 2 + past);
            const h = (runway.headingDegrees * Math.PI) / 180;
            const x = runway.center.x + along * Math.sin(h) + across * Math.cos(h);
            const z = runway.center.z + along * Math.cos(h) - across * Math.sin(h);
            expect(terrain.heightAt(x, z)).toBeLessThan(runway.center.y + past * 0.035 + 1);
          }
        }
      }
    }
  });

  it('the practice balloons float well clear of the ground', () => {
    for (const offset of PRACTICE_TARGET_CONFIG.layout) {
      const x = HOME_RUNWAY.center.x + offset.x;
      const z = HOME_RUNWAY.center.z + offset.z;
      expect(HOME_RUNWAY.center.y + offset.y - world.heightAt(x, z)).toBeGreaterThan(100);
    }
  });
});

describe('world ground: sea and carriers', () => {
  it('the sea surface is the ground offshore, and it is water', () => {
    expect(world.heightAt(-2_500, 0)).toBe(SEA);
    expect(world.surfaceAt(-2_500, 0)).toBe('water');
    expect(world.surfaceAt(HOME_RUNWAY.center.x, HOME_RUNWAY.center.z)).toBe('runway');
  });

  it('carriers float in open water; the deck is a surface, the wires a zone on it, the island a solid block', () => {
    for (const carrier of CARRIERS) {
      const deck = carrierDeckRunway(carrier);
      for (const p of aroundRunway(deck, carrier.deckLength, carrier.deckWidth * 2)) expect(naturalHeight(p.x, p.z)).toBeLessThan(SEA - 10);
      const at = (fromStern: number, across: number) => {
        const h = (carrier.headingDegrees * Math.PI) / 180;
        const along = fromStern - carrier.deckLength / 2;
        return { x: carrier.center.x + along * Math.sin(h) + across * Math.cos(h), z: carrier.center.z + along * Math.cos(h) - across * Math.sin(h) };
      };
      const stern = at(10, 0);
      const wires = at((carrier.wires.from + carrier.wires.to) / 2, 0);
      const island = at(carrier.island.along, carrier.island.across);
      expect(world.heightAt(stern.x, stern.z)).toBe(carrier.center.y);
      expect(world.surfaceAt(stern.x, stern.z)).toBe('deck');
      expect(world.surfaceAt(wires.x, wires.z)).toBe('wires');
      expect(world.heightAt(island.x, island.z)).toBe(carrier.center.y + carrier.island.height);
      const beyondBow = at(carrier.deckLength + 20, 0);
      expect(world.surfaceAt(beyondBow.x, beyondBow.z)).toBe('water');
    }
  });

  it('flying into the sea is a crash', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const state = createAirborneState(spec, { x: -2_500, y: SEA + 60, z: 0 }, 0, 90, 0);
    const controls = { ...neutralControls(), pitch: -0.6 };
    for (let t = 0; t < 30 && !state.crashed; t += STEP) stepAircraft(state, controls, spec, world, STEP);
    expect(state.crashed).toBe(true);
    expect(state.crashReason).toMatch(/sea/);
  });

  it('flying into the central mountain is a crash', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const peak = TERRAIN_CONFIG.islands[2]?.peak ?? { x: 0, z: 0, height: 0 };
    const start = { x: peak.x - 4_000, y: SEA + peak.height - 150, z: peak.z };
    const state = createAirborneState(spec, start, 90, 120, 1);
    const controls = { ...neutralControls(), throttle: 1 };
    for (let t = 0; t < 120 && !state.crashed; t += STEP) {
      controls.pitch = Math.max(-1, Math.min(1, (start.y - state.position.y) / 30 - state.velocity.y / 10));
      stepAircraft(state, controls, spec, world, STEP);
    }
    expect(state.crashed).toBe(true);
  });

  it('flying into a carrier island is a crash', () => {
    const spec = AIRCRAFT_CLASSES.navalFighter;
    const deck = carrierDeckRunway(BLUE_CARRIER);
    const h = (deck.headingDegrees * Math.PI) / 180;
    const across = BLUE_CARRIER.island.across;
    // 600 m astern, offset to the island's side, level at deck height + 10 m.
    const start = { x: deck.center.x - 600 * Math.sin(h) + across * Math.cos(h), y: deck.center.y + 10, z: deck.center.z - 600 * Math.cos(h) - across * Math.sin(h) };
    const state = createAirborneState(spec, start, deck.headingDegrees, 70, 0.6);
    const controls = { ...neutralControls(), throttle: 0.6 };
    for (let t = 0; t < 20 && !state.crashed; t += STEP) {
      controls.pitch = Math.max(-1, Math.min(1, (start.y - state.position.y) / 10 - state.velocity.y / 5));
      stepAircraft(state, controls, spec, world, STEP);
    }
    expect(state.crashed).toBe(true);
  });

  it('take-off and the landing-practice approach work on the real island airfield', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const parked = createParkedState(spec, getRunwaySpawnPoint(HOME_RUNWAY, 60));
    for (let t = 0; t < 5; t += STEP) stepAircraft(parked, { ...neutralControls(), brake: 1 }, spec, world, STEP);
    expect(parked.crashed).toBe(false);
    expect(parked.onGround).toBe(true);

    const perf = computePerformance(spec);
    const approach = createApproachState(spec, HOME_RUNWAY, { distanceFromThreshold: 2500, glideSlopeDeg: 3, aimPointPastThreshold: 300, speed: perf.handsOffApproachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    const controls = { ...neutralControls(), throttle: perf.approachThrottle, flaps: 1 };
    for (let t = 0; t < 120 && approach.touchdownCount === 0 && !approach.crashed; t += STEP) stepAircraft(approach, controls, spec, world, STEP);
    expect(approach.crashed).toBe(false);
    expect(approach.touchdownCount).toBe(1);
    expect(Math.abs(runwayLocal(HOME_RUNWAY, approach.position.x, approach.position.z).along)).toBeLessThan(HOME_RUNWAY.length / 2);
  });
});

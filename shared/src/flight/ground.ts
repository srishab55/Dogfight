import { RUNWAYS, WORLD_CONFIG, isOnRunway, type RunwayDefinition, type SurfaceType } from '../config/world';

/**
 * What the flight model needs to know about the ground beneath a point: its
 * height and what it is made of. Flat test ground, the heightmap terrain and
 * the full world (terrain + sea + carriers) all implement it, and the flight
 * model doesn't care which it gets.
 */
export interface GroundQuery {
  heightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): SurfaceType;
}

/** Flat ground at WORLD_CONFIG.groundHeight; runway rectangles, grass everywhere else. */
export function createFlatGround(runways: readonly RunwayDefinition[] = RUNWAYS): GroundQuery {
  return {
    heightAt: () => WORLD_CONFIG.groundHeight,
    surfaceAt: (x, z) => (runways.some((runway) => isOnRunway(runway, x, z)) ? 'runway' : 'grass'),
  };
}

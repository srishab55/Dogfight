import { RUNWAYS, WORLD_CONFIG, isOnRunway, type RunwayDefinition, type SurfaceType } from '../config/world';

/**
 * What the flight model needs to know about the ground beneath a point. This
 * interface is the seam for Phase 3: a heightmap terrain implements the same
 * two methods, and the flight model doesn't change.
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

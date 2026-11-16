import type { Vec3 } from '../types/vector';

/**
 * Gameplay-relevant description of the world. Anything the server will need to
 * know (sizes, runway locations, spawn points) lives here; purely visual
 * settings (colours, fog, texture sizes) live in the client's config.
 */
export const WORLD_CONFIG = {
  /** Side length of the square playable area in metres, centred on the origin. */
  playableAreaSize: 12_000,
  /** Height of the flat ground plane in metres. Rolling terrain arrives in Phase 3. */
  groundHeight: 0,
} as const;

/** A runway is a flat rectangle aircraft can take off from and land on. */
export interface RunwayDefinition {
  readonly id: string;
  /** Centre of the runway surface in world space (m). */
  readonly center: Readonly<Vec3>;
  /** Direction of the runway centreline, in degrees clockwise from +Z (north). */
  readonly headingDegrees: number;
  /** Length along the centreline (m). */
  readonly length: number;
  /** Width across the centreline (m). */
  readonly width: number;
}

/**
 * The Blue team's home runway. Phase 6 adds the Red base and the neutral
 * central airfield; bases sit on the north-south axis so the teams face each
 * other across the map.
 */
export const HOME_RUNWAY: RunwayDefinition = {
  id: 'blue-home',
  center: { x: 0, y: WORLD_CONFIG.groundHeight, z: -4_000 },
  headingDegrees: 0,
  length: 1_200,
  width: 40,
};

/** Every runway in the world. Phase 6 adds the Red base and the neutral central airfield. */
export const RUNWAYS: readonly RunwayDefinition[] = [HOME_RUNWAY];

export type SurfaceType = 'runway' | 'grass';

/** Tyre friction coefficients (force / normal load) per ground surface. */
export interface SurfaceFriction {
  /** Rolling resistance of a free-rolling wheel. */
  readonly rolling: number;
  /** Grip available to the brakes. */
  readonly braking: number;
  /** Sideways grip that stops the tyre skidding. */
  readonly lateral: number;
}

export const SURFACE_FRICTION: Readonly<Record<SurfaceType, SurfaceFriction>> = {
  runway: { rolling: 0.02, braking: 0.6, lateral: 0.8 },
  // Grass: about 3x the rolling drag (longer take-off run), less grip for braking and cornering.
  grass: { rolling: 0.07, braking: 0.35, lateral: 0.55 },
};

/** True if world point (x, z) lies on the runway's rectangle. */
export function isOnRunway(runway: RunwayDefinition, x: number, z: number): boolean {
  const heading = (runway.headingDegrees * Math.PI) / 180;
  const dx = x - runway.center.x;
  const dz = z - runway.center.z;
  // Project onto the runway's own axes: along the centreline and across it.
  const along = dx * Math.sin(heading) + dz * Math.cos(heading);
  const across = dx * Math.cos(heading) - dz * Math.sin(heading);
  return Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2;
}

/** Where and which way an aircraft starts. `position` is the ground contact point. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly headingDegrees: number;
}

/**
 * Spawn point on a runway's centreline, `distanceFromThreshold` metres in from
 * the start of the runway, facing along the runway heading.
 */
export function getRunwaySpawnPoint(runway: RunwayDefinition, distanceFromThreshold: number): SpawnPoint {
  const heading = (runway.headingDegrees * Math.PI) / 180;
  // Unit vector along the runway. Heading 0 points to +Z, heading 90 to +X.
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  // The threshold is half a runway length behind the centre.
  const offset = -runway.length / 2 + distanceFromThreshold;
  return {
    position: {
      x: runway.center.x + forwardX * offset,
      y: runway.center.y,
      z: runway.center.z + forwardZ * offset,
    },
    headingDegrees: runway.headingDegrees,
  };
}

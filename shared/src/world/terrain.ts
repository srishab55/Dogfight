import { TERRAIN_CONFIG, type IslandDefinition } from '../config/terrain';
import { PAVED_AREAS, RUNWAYS, WORLD_CONFIG, isOnRunway, runwayLocal, type RunwayDefinition } from '../config/world';
import type { GroundQuery } from '../flight/ground';

/**
 * Heightmap terrain: islands in the sea, with flattened airfields, sampled
 * once onto a grid.
 *
 * The client renders exactly this grid, with the same two triangles per
 * cell, and `heightAt` interpolates on those same triangles. The ground the
 * physics collides with is therefore exactly the ground you see, with no
 * invisible bumps and no wheels sinking into a slope.
 *
 * `heightAt` is the solid ground, which lies below the sea surface offshore.
 * The flight model collides with the *world* ground (see worldGround.ts),
 * which adds the sea surface and the carriers.
 */
export interface Terrain extends GroundQuery {
  /** Heights at grid vertices, row-major by z then x: index = j * (resolution + 1) + i. */
  readonly heights: Float32Array;
  readonly resolution: number;
  readonly size: number;
  /** World x or z of grid line `i` or `j`. */
  readonly origin: number;
  readonly cellSize: number;
}

/** World height of the open sea floor: the terrain's height beyond the grid. */
export const SEA_FLOOR_HEIGHT = WORLD_CONFIG.seaLevel - TERRAIN_CONFIG.seaFloorDepth;

export function createTerrain(runways: readonly RunwayDefinition[] = RUNWAYS): Terrain {
  const { size, resolution } = TERRAIN_CONFIG;
  const cellSize = size / resolution;
  const origin = -size / 2;
  const verticesPerSide = resolution + 1;
  const heights = new Float32Array(verticesPerSide * verticesPerSide);
  for (let j = 0; j < verticesPerSide; j++) {
    for (let i = 0; i < verticesPerSide; i++) {
      heights[j * verticesPerSide + i] = proceduralHeight(origin + i * cellSize, origin + j * cellSize, runways);
    }
  }

  const heightAt = (x: number, z: number): number => {
    const gx = (x - origin) / cellSize;
    const gz = (z - origin) / cellSize;
    if (gx < 0 || gz < 0 || gx >= resolution || gz >= resolution) return SEA_FLOOR_HEIGHT;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const row = j * verticesPerSide;
    const h00 = heights[row + i] ?? 0;
    const h10 = heights[row + i + 1] ?? 0;
    const h01 = heights[row + verticesPerSide + i] ?? 0;
    const h11 = heights[row + verticesPerSide + i + 1] ?? 0;
    // Each cell is split along its (1,0)-(0,1) diagonal into two triangles,
    // matching the render mesh. Interpolate on the triangle containing the point.
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };

  return {
    heights,
    resolution,
    size,
    origin,
    cellSize,
    heightAt,
    surfaceAt: (x, z) => (PAVED_AREAS.some((area) => isOnRunway(area, x, z)) ? 'runway' : heightAt(x, z) < WORLD_CONFIG.seaLevel ? 'water' : 'grass'),
  };
}

/**
 * The continuous terrain shape, before gridding: the islands, then the
 * airfield pads and approach clearances.
 */
export function proceduralHeight(x: number, z: number, runways: readonly RunwayDefinition[] = RUNWAYS): number {
  let height = naturalHeight(x, z);
  const field = TERRAIN_CONFIG.airfield;
  for (const runway of runways) {
    const { along, across } = runwayLocal(runway, x, z);
    // Flat pad: blend to the runway's elevation.
    const beyondEnd = Math.max(0, Math.abs(along) - (runway.length / 2 + field.padOverrun));
    const beyondSide = Math.max(0, Math.abs(across) - field.padHalfWidth);
    const pad = 1 - smoothstep(0, field.blendDistance, Math.hypot(beyondEnd, beyondSide));
    height += (runway.center.y - height) * pad;

    // Approach clearance: below a 2-degree surface rising from each runway end.
    const pastEnd = Math.abs(along) - runway.length / 2;
    if (pastEnd > 0 && pastEnd < field.approachLength) {
      const inCorridor = 1 - smoothstep(field.approachHalfWidth, field.approachHalfWidth + field.blendDistance, Math.abs(across));
      const ceiling = runway.center.y + pastEnd * field.clearanceGradient;
      if (height > ceiling) height += (ceiling - height) * inCorridor;
    }
  }
  return height;
}

/** The islands and sea bed alone, without airfields (world height, m). The highest island wins where they overlap. */
export function naturalHeight(x: number, z: number): number {
  let aboveSea = -TERRAIN_CONFIG.seaFloorDepth;
  TERRAIN_CONFIG.islands.forEach((island, index) => {
    aboveSea = Math.max(aboveSea, islandHeight(island, index, x, z));
  });
  return WORLD_CONFIG.seaLevel + aboveSea;
}

/**
 * One island's height above sea level at (x, z).
 *
 * u is the normalised distance from the island's centre (1 on the coast),
 * stretched by noise so coastlines get bays and headlands. Inland (u < 1),
 * a beach rises to the coastal plain, hills grow further in, and a ridged
 * mountain stands on top. Offshore (u > 1), the sea bed shelves down to the
 * open-sea depth. Both sides give 0 at u = 1, so the coast is continuous.
 */
function islandHeight(island: IslandDefinition, index: number, x: number, z: number): number {
  const { seed, coastline, shelfWidth, seaFloorDepth, coastalPlainHeight, beachWidth } = TERRAIN_CONFIG;
  const rotation = (island.rotationDeg * Math.PI) / 180;
  const dx = x - island.center.x;
  const dz = z - island.center.z;
  // Into the island's own axes (radiusX across, radiusZ along its rotated length).
  const localX = dx * Math.cos(rotation) - dz * Math.sin(rotation);
  const localZ = dx * Math.sin(rotation) + dz * Math.cos(rotation);
  let u = Math.hypot(localX / island.radiusX, localZ / island.radiusZ);
  u *= 1 + coastline.amplitude * fbm(x / coastline.wavelength, z / coastline.wavelength, coastline.octaves, seed + 7 * index);

  if (u >= 1) return -seaFloorDepth * smoothstep(1, 1 + shelfWidth, u);

  const inland = 1 - u; // 0 on the coast, 1 at the centre
  const plain = coastalPlainHeight * smoothstep(0, beachWidth, inland);
  const hills = island.hills.amplitude * smoothstep(beachWidth, 0.45, inland) * (0.5 + 0.5 * fbm(x / island.hills.wavelength, z / island.hills.wavelength, 4, seed + 31 * index));
  const peak = island.peak;
  const fromSummit = Math.min(1, Math.hypot(x - peak.x, z - peak.z) / peak.radius);
  const ridges = ridgedNoise(x / 700, z / 700, 5, seed + 101 + index);
  // A cone with concave flanks, roughened by ridges; it fades out near the coast, so no sea cliffs.
  const mountain = peak.height * (1 - fromSummit) ** 1.6 * (0.7 + 0.3 * ridges) * smoothstep(0.02, 0.3, inland);
  return plain + hills + mountain;
}

// ── Noise ──────────────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random value in [-1, 1] for an integer lattice point. */
function latticeValue(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374_761_393) + Math.imul(iz, 668_265_263) + Math.imul(seed, 1_442_695_041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4_294_967_295) * 2 - 1;
}

/** Smooth value noise: lattice values blended with a smoothstep curve. Range about [-1, 1]. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = latticeValue(ix, iz, seed);
  const b = latticeValue(ix + 1, iz, seed);
  const c = latticeValue(ix, iz + 1, seed);
  const d = latticeValue(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Fractal Brownian motion: octaves of noise, each twice the frequency and
 * half the amplitude. Range about [-1, 1]. Exported so the client can paint
 * matching detail (forest patches) without a second noise implementation.
 */
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * frequency, z * frequency, seed + o * 17) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** Ridged noise, (1 - |noise|)^2 per octave: sharp crests and valleys, like mountain ranges. Range [0, 1]. */
function ridgedNoise(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const ridge = 1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + o * 31));
    sum += ridge * ridge * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / norm;
}

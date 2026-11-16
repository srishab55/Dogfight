import { TERRAIN_CONFIG } from '../config/terrain';
import { RUNWAYS, WORLD_CONFIG, isOnRunway, type RunwayDefinition } from '../config/world';
import type { GroundQuery } from '../flight/ground';

/**
 * Heightmap terrain: hills, a mountain ring and flattened airfields, sampled
 * once onto a grid.
 *
 * The client renders exactly this grid, with the same two triangles per
 * cell, and `heightAt` interpolates on those same triangles. The ground the
 * physics collides with is therefore exactly the ground you see, with no
 * invisible bumps and no wheels sinking into a slope.
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
    if (gx < 0 || gz < 0 || gx >= resolution || gz >= resolution) return WORLD_CONFIG.groundHeight;
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
    surfaceAt: (x, z) => (runways.some((runway) => isOnRunway(runway, x, z)) ? 'runway' : 'grass'),
  };
}

/**
 * The continuous terrain shape, before gridding:
 *   hills (fBm noise) + mountain ring (ridged noise, masked by distance)
 *   then blended to runway height inside the airfield zones,
 *   and faded to flat ground at the terrain's edge.
 */
export function proceduralHeight(x: number, z: number, runways: readonly RunwayDefinition[] = RUNWAYS): number {
  const { hills, mountains, seed } = TERRAIN_CONFIG;

  const hillHeight = fbm(x / hills.wavelength, z / hills.wavelength, hills.octaves, seed) * hills.amplitude;

  // Rounded-square distance from the centre (a superellipse, p = 6), so the ring follows the square map.
  const distance = Math.pow(Math.abs(x) ** 6 + Math.abs(z) ** 6, 1 / 6);
  const ring = smoothstep(mountains.riseStart, mountains.riseEnd, distance) * (1 - smoothstep(mountains.fallStart, mountains.fallEnd, distance));
  const ridges = ridgedNoise(x / mountains.wavelength, z / mountains.wavelength, mountains.octaves, seed + 101);
  const mountainHeight = ring * (mountains.baseHeight + ridges * mountains.peakHeight);

  let height = hillHeight * (1 - 0.6 * ring) + mountainHeight;

  // Airfields: blend to the runway's own elevation.
  for (const runway of runways) {
    const weight = airfieldWeight(runway, x, z);
    height += (runway.center.y - height) * weight;
  }

  // Fade to the flat ground beyond the terrain's edge.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const half = TERRAIN_CONFIG.size / 2;
  const edgeFade = 1 - smoothstep(half - 600, half - 50, edge);
  return WORLD_CONFIG.groundHeight + (height - WORLD_CONFIG.groundHeight) * edgeFade;
}

/** 1 inside a runway's flat zone (the runway plus its approach corridors), fading to 0 over the blend distance. */
function airfieldWeight(runway: RunwayDefinition, x: number, z: number): number {
  const { approachLength, halfWidth, blendDistance } = TERRAIN_CONFIG.airfield;
  const heading = (runway.headingDegrees * Math.PI) / 180;
  const dx = x - runway.center.x;
  const dz = z - runway.center.z;
  const along = dx * Math.sin(heading) + dz * Math.cos(heading);
  const across = dx * Math.cos(heading) - dz * Math.sin(heading);
  const outsideAlong = Math.max(0, Math.abs(along) - (runway.length / 2 + approachLength));
  const outsideAcross = Math.max(0, Math.abs(across) - halfWidth);
  return 1 - smoothstep(0, blendDistance, Math.hypot(outsideAlong, outsideAcross));
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

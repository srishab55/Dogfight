/**
 * Procedural island terrain. Pure data: the same seed and numbers produce the
 * same landscape on the client (rendering) and the server (collisions, Phase 5).
 *
 * Heights here are metres above SEA LEVEL (WORLD_CONFIG.seaLevel).
 */
export interface IslandDefinition {
  readonly id: string;
  /** Centre of the island's ellipse (m). */
  readonly center: { readonly x: number; readonly z: number };
  /** Semi-axes of the ellipse before the coastline noise (m). */
  readonly radiusX: number;
  readonly radiusZ: number;
  /** Rotation of the ellipse, clockwise from north (deg). */
  readonly rotationDeg: number;
  /** Rolling hills inland: maximum height above the coastal plain (m) and feature size (m). */
  readonly hills: { readonly amplitude: number; readonly wavelength: number };
  /** One mountain: its summit position, height above sea (m) and the radius of its base (m). */
  readonly peak: { readonly x: number; readonly z: number; readonly height: number; readonly radius: number };
}

export const TERRAIN_CONFIG = {
  /** Side length of the terrain square, centred on the origin (m). Open sea continues beyond it. */
  size: 16_000,
  /** Grid cells per side: 50 m cells. Physics and rendering use the same triangles. */
  resolution: 320,
  seed: 1942,
  /** Depth of the open sea floor (m below sea level). The sea hides it. */
  seaFloorDepth: 60,
  /** The sea bed shelves down from the coast to full depth over this fraction of the island's radius. */
  shelfWidth: 0.5,
  /** Ragged coastlines: noise stretches or shrinks the island's radius by up to this fraction. */
  coastline: { amplitude: 0.2, wavelength: 1_300, octaves: 4 },
  /** Height of the low coastal plain behind the beaches (m above sea). */
  coastalPlainHeight: 7,
  /** The beach rises to the plain over this fraction of the island's radius. */
  beachWidth: 0.08,
  islands: [
    {
      id: 'blue-island',
      center: { x: 300, z: -4_050 },
      radiusX: 1_350,
      radiusZ: 2_100,
      rotationDeg: 0,
      hills: { amplitude: 110, wavelength: 900 },
      peak: { x: 950, z: -4_500, height: 280, radius: 900 },
    },
    {
      id: 'red-island',
      center: { x: 250, z: 4_350 },
      radiusX: 1_350,
      radiusZ: 2_100,
      rotationDeg: 0,
      hills: { amplitude: 120, wavelength: 900 },
      peak: { x: -350, z: 4_750, height: 320, radius: 900 },
    },
    {
      id: 'central-island',
      center: { x: 2_900, z: 0 },
      radiusX: 1_650,
      radiusZ: 1_250,
      rotationDeg: 35,
      hills: { amplitude: 150, wavelength: 700 },
      peak: { x: 3_050, z: 100, height: 760, radius: 1_150 },
    },
  ] satisfies readonly IslandDefinition[],
  /**
   * Airfields: a flat pad around each runway, and below each approach path
   * an obstacle-clearance surface that terrain is cut down to (never raised).
   */
  airfield: {
    /** The pad reaches this far either side of the centreline and beyond each runway end (m). */
    padHalfWidth: 110,
    padOverrun: 150,
    /** The pad blends back into natural ground over this distance (m). */
    blendDistance: 250,
    /** Beyond the pad, under each approach, terrain stays below this climb gradient from the runway (2 degrees). */
    clearanceGradient: 0.035,
    approachLength: 4_000,
    approachHalfWidth: 300,
  },
} as const;

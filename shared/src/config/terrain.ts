/**
 * Procedural terrain. Pure data: the same seed and numbers produce the same
 * landscape on the client (rendering) and the server (collisions, Phase 5).
 */
export const TERRAIN_CONFIG = {
  /** Side length of the terrain square, centred on the origin (m). Flat ground continues beyond it. */
  size: 20_000,
  /** Grid cells per side: 78 m cells. Physics and rendering use the same triangles. */
  resolution: 256,
  seed: 1942,
  /** Gentle rolling hills across the whole map. */
  hills: { amplitude: 70, wavelength: 3_200, octaves: 4 },
  /**
   * A ring of mountains framing the battle area. "Distance" is a rounded-square
   * distance from the centre, so the ring follows the square map.
   */
  mountains: {
    riseStart: 6_600,
    riseEnd: 8_000,
    fallStart: 9_000,
    fallEnd: 10_000,
    /** Height of the ridges at full strength (m), plus a smooth base rise under them. */
    peakHeight: 1_500,
    baseHeight: 350,
    wavelength: 2_400,
    octaves: 5,
  },
  /**
   * Flat land around every runway and along its approach line in both
   * directions, cutting a valley through the mountains so approaches are
   * clear.
   */
  airfield: {
    /** Length of the cleared approach corridor beyond each runway end (m). */
    approachLength: 4_000,
    /** Half-width of the flat area across the runway and its approaches (m). */
    halfWidth: 320,
    /** Distance over which the flattening blends back into natural terrain (m). */
    blendDistance: 800,
  },
} as const;

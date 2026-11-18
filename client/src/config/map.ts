/** The map (N) and the base beacons: how bases are found from far away. */

/** Owner colours on the map, the beacons and the base labels (brighter than the paint, to read at a glance). */
export const BASE_COLORS = {
  blue: '#3d8bff',
  red: '#ff4a3d',
  /** An enemy base with no defences left: land on it to capture it. */
  open: '#ffb020',
  /** A base nobody holds yet: land and stop on it to take it. */
  neutral: '#d8dee6',
} as const;

/** A base's colour on the map, its beacon and its label. */
export function baseColor(owner: 'blue' | 'red' | null, open = false): string {
  return open ? BASE_COLORS.open : owner === null ? BASE_COLORS.neutral : BASE_COLORS[owner];
}

export const MINIMAP_CONFIG = {
  /** World area shown: a square this many metres either side of the map centre (covers both carriers and the AI's patrol area). */
  halfExtent: 4_400,
  /** Size of the terrain picture drawn once at start (px). */
  backgroundResolution: 256,
  /** On-screen size (CSS px): the corner map, and the big map. */
  smallSize: 200,
  largeSize: 560,
  /** Redraws per second (it's a map, not a gauge). */
  redrawHz: 15,
  /** Sea colours by depth, land colours by height above the sea (m). */
  deepSea: '#0d2f52',
  shallowSea: '#2a86b0',
  beach: '#d9c993',
  lowland: '#4f7d3a',
  highland: '#7b7a52',
  peak: '#b3ad9a',
  /** Highest point (m), for the land colour ramp; the shading comes from the slope. */
  peakHeight: 420,
  storageKey: 'dogfight.map',
} as const;

/**
 * A column of light in the owner's colour rising from each base, drawn
 * without fog, so a base can be seen across the whole map. It is widened
 * with distance to stay a few pixels wide, fades towards its top, fades out
 * when you're close (where you can see the base itself), and blinks amber
 * while an enemy base is defenceless.
 */
export const BEACON_CONFIG = {
  height: 1_200,
  /** Radius close to (m), and the minimum radius as a fraction of the distance (about 10 px wide at 1280 px). */
  radius: 7,
  radiusPerDistance: 0.005,
  intensity: 1,
  /** Fades from full to its near intensity between these distances (m). */
  nearFadeFrom: 1_500,
  nearFadeTo: 400,
  nearIntensity: 0.12,
  /** Blinks per second while defenceless. */
  openBlinkHz: 1.2,
  /** The HUD label sits a little above a point this high over the base, shown from this distance out (m). */
  labelHeight: 20,
  labelMinDistance: 1_200,
} as const;

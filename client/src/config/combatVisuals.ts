/** Look of tracers, impacts and practice balloons. Gameplay rules live in shared/src/config/weapons.ts. */

/**
 * Tracers are drawn as glowing streaks behind each round. A 15 cm round seen
 * from 300 m is a fraction of a pixel, so streaks widen and lengthen with
 * distance from the camera, like the glare of real tracer seen in film.
 */
export const TRACER_CONFIG = {
  color: '#ffd27a',
  minWidth: 0.12,
  /** Extra width per metre of distance from the camera (m/m): about 2 px at any range at 720p. */
  widthPerMetre: 0.0025,
  minLength: 6,
  lengthPerMetre: 0.02,
  maxLength: 45,
} as const;

export const IMPACT_EFFECT_CONFIG = {
  /** Most effects alive at once; the oldest are recycled. */
  capacity: 192,
  /** A round hitting the ground. */
  dust: { color: '#8c7b5a', size: 3.2, duration: 0.9, rise: 2 },
  /** Spray thrown up where a round hits the sea. */
  splash: { color: '#e6eef2', size: 3.6, duration: 0.8, rise: 3 },
  /** A round hitting a balloon. */
  spark: { color: '#ffe7a3', size: 1.6, duration: 0.16, rise: 0 },
  /** A balloon bursting. */
  burst: { color: '#fff1cf', size: 12, duration: 0.5, rise: 0 },
  /** Shreds of a burst balloon drifting down. */
  shreds: { color: '#c8432f', size: 7, duration: 1.6, rise: -6 },
} as const;

export const BALLOON_CONFIG = {
  primaryColor: '#d6402c',
  stripeColor: '#f3eee4',
  /** How long a balloon glows after taking a hit (s). */
  hitFlashSeconds: 0.12,
} as const;

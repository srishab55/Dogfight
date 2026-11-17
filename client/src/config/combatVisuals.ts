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

/** AA tracer colour: red-orange, so incoming fire reads differently from your own. */
export const ENEMY_TRACER_COLOR = '#ff6a3a';

/**
 * Smoke, flames and explosions: soft camera-facing sprites. Fire is drawn
 * additively and brighter than white, so the post-process bloom makes it glow.
 */
export const FIRE_AND_SMOKE_CONFIG = {
  smokeCapacity: 1_400,
  fireCapacity: 700,
  /** Puff lifetimes (s), sizes at birth and death (m), and how fast puffs rise (m/s). */
  smoke: { life: 6, startSize: 3, endSize: 16, rise: 5, drift: 1.5 },
  flame: { life: 0.7, startSize: 3.5, endSize: 1, rise: 6 },
  /** Grey of light (engine-damage) smoke and of black (fire) smoke, sRGB 0-1. */
  lightSmokeShade: 0.78,
  darkSmokeShade: 0.1,
  /** Flame colour (HDR: above 1 blooms). */
  flameColor: [3.2, 1.5, 0.45],
  /** Explosions: fireball size (m) per unit of `scale`, and how many smoke puffs and flames make one. */
  explosion: { fireballSize: 16, flames: 14, puffs: 10, life: 0.9 },
} as const;

/**
 * Burning things. Emitters spawn puffs at these rates (per second) while a
 * target burns; damaged aircraft trail smoke.
 */
export const BURN_CONFIG = {
  /** A destroyed gun or parked aircraft: flames for this long, then smoke until it's replaced (s). */
  wreckFlameSeconds: 30,
  wreckSmokePerSecond: 5,
  wreckFlamesPerSecond: 14,
  /** The carrier: smoke below this hull fraction, fires below the second, a blaze once destroyed. */
  carrierSmokeBelow: 0.7,
  carrierFireBelow: 0.35,
  /** Aircraft: light smoke below this hull fraction, black smoke and flames below the second. */
  aircraftSmokeBelow: 0.6,
  aircraftFireBelow: 0.3,
  aircraftSmokePerSecond: 22,
} as const;

/** Look of the AA guns and of wrecks. */
export const DEFENCE_VISUAL_CONFIG = {
  sandbagColor: '#8b7d5c',
  gunColor: '#3b3f36',
  wreckColor: '#1d1b19',
  /** Red flash on the screen edge when you're hit (s). */
  hitFlashSeconds: 0.35,
  /** Camera kick when hit (m of shake, decaying). */
  hitShake: 0.35,
} as const;

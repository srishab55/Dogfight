import type { AirframeId } from '@dogfight/shared';

/**
 * Sound. Everything is synthesised in the browser (Web Audio API): no sound
 * files to download or license. Levels are linear gains (1 = full scale).
 */
export const AUDIO_CONFIG = {
  /** Overall volume, and whether to start muted (M toggles; the choice is remembered). */
  masterVolume: 0.7,
  startMuted: false,
  /** Sounds further than this aren't played at all (m). */
  maxDistance: 6_000,
  /** Distance at which a positioned sound is at its full level; it halves with each doubling beyond (m). */
  referenceDistance: 70,
  /** Sound travels at this speed, so distant explosions are heard after they're seen (m/s). */
  speedOfSound: 343,
  gunVolume: 0.32,
  /** Most of your own gunshots played per second (four guns fire 52/s; one sound per few rounds is enough). */
  maxGunshotsPerSecond: 26,
  aaVolume: 0.9,
  explosionVolume: 1,
  hitVolume: 0.55,
  touchdownVolume: 0.6,
  wind: { volume: 0.22, startSpeed: 25, fullSpeed: 170 },
  stallHorn: { frequency: 420, pulseHz: 4.5, volume: 0.09 },
  pullUp: { frequencies: [880, 620], beepSeconds: 0.18, volume: 0.07 },
  /** Your own engine. */
  engineVolume: 0.2,
} as const;

/**
 * Engine character per airframe: the firing frequency at idle and at full
 * power (Hz), how rough it is, and how many engines (beating against each
 * other, slightly detuned).
 *
 * Firing frequency = rpm / 60 x cylinders / 2 for a four-stroke: a V12 at
 * 2,600 rpm fires at about 260 Hz; a 14-cylinder radial at 2,400 rpm about 280 Hz.
 * Played an octave down, which reads better on laptop speakers.
 */
export const ENGINE_SOUND_CONFIG: Readonly<Record<AirframeId, { idleHz: number; fullHz: number; roughness: number; engines: number }>> = {
  fighter: { idleHz: 38, fullHz: 128, roughness: 0.35, engines: 1 },
  // A smoother, higher-revving V12.
  interceptor: { idleHz: 42, fullHz: 138, roughness: 0.3, engines: 1 },
  // A rotary engine: a low, uneven buzz.
  triplane: { idleHz: 22, fullHz: 74, roughness: 0.85, engines: 1 },
  biplane: { idleHz: 30, fullHz: 104, roughness: 0.6, engines: 1 },
  navalFighter: { idleHz: 30, fullHz: 108, roughness: 0.6, engines: 1 },
  diveBomber: { idleHz: 28, fullHz: 96, roughness: 0.65, engines: 1 },
  fourEngineBomber: { idleHz: 26, fullHz: 88, roughness: 0.55, engines: 4 },
};

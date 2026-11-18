/**
 * Game feel (game-skills/GameFeel): every juicy event is given an
 * importance tier, so the whole game's feedback stays proportional. Small
 * events nudge; large ones punch, briefly. All of it is visual: it moves the
 * camera, never the aircraft, and hit-stop slows the clock the world is
 * drawn and stepped by, not the rules (each physics step is unchanged).
 */
export type FeedbackTier = 'small' | 'medium' | 'large';

export const FEEDBACK_TIERS: Readonly<Record<FeedbackTier, { readonly trauma: number; readonly hitStopSeconds: number }>> = {
  /** A firm touchdown, a catapult shot, a balloon popping near you. */
  small: { trauma: 0.15, hitStopSeconds: 0 },
  /** You're hit; a gun or building blows up near you; an aircraft goes down near you. */
  medium: { trauma: 0.4, hitStopSeconds: 0 },
  /** You shoot an aircraft down (with a moment's freeze); you crash; a fuel depot goes up beside you. */
  large: { trauma: 0.75, hitStopSeconds: 0.07 },
};

export const FEEDBACK_CONFIG = {
  /** Explosions near you are felt out to this far, less with distance (m). */
  falloffDistance: 700,
  /** Hit-stop runs the world at this fraction of real time. */
  hitStopTimeScale: 0.12,
  /** An enemy aircraft flashes this long when your rounds hit it (s). */
  hitFlashSeconds: 0.08,
  /** How bright the flash is (0-1 of white). */
  hitFlashStrength: 0.7,
  /** Recent damage on an enemy shows beside its marker until this long after the last hit (s). */
  damagePopSeconds: 1.2,
  /** The kill marker shows where your target went down for this long (s). */
  killMarkerSeconds: 1.1,
} as const;

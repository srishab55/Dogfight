/** Landing aids and landing practice. */

/**
 * The "L" key: start established on final approach with landing flaps. Speed
 * and throttle come from each class's derived performance (hands-off
 * approach speed, and the throttle that holds a 3-degree slope), so left
 * alone it flies down the glide slope to the aim point.
 */
export const LANDING_PRACTICE = {
  distanceFromThreshold: 2_500,
  glideSlopeDeg: 3,
  /** Where the glide slope meets the runway, past the threshold (m). The PAPI lights stand here. */
  aimPointPastThreshold: 300,
  /** How long the briefing message stays up (s). */
  briefingSeconds: 6,
} as const;

/**
 * PAPI (precision approach path indicator): four lights beside the runway at
 * the aim point. Each shows white if you're above its angle and red if below.
 * On the glide slope you see two white, two red. All white is too high, all
 * red too low.
 */
export const PAPI_CONFIG = {
  /** Light angles from the runway edge outwards (deg), centred on the 3-degree glide slope. */
  lightAnglesDeg: [3.5, 3.17, 2.83, 2.5],
  /** Distance from the runway edge to the first light, and between lights (m). */
  edgeOffset: 15,
  spacing: 9,
  /** Light housing size at close range (m); scaled up with distance so it stays visible from final. */
  size: 1.6,
  /** The lights never shrink below about this many metres per kilometre of viewing distance. */
  minSizePerKilometre: 9,
  whiteColor: '#fff6e0',
  redColor: '#ff2a1a',
} as const;

/** Touchdown feedback on the HUD, by sink rate (m/s). Damage itself is decided by the flight model. */
export const TOUCHDOWN_GRADES: ReadonlyArray<{ readonly maxSinkRate: number; readonly label: string; readonly tone: 'good' | 'ok' | 'bad' }> = [
  { maxSinkRate: 1.5, label: 'SMOOTH', tone: 'good' },
  { maxSinkRate: 2.5, label: 'GOOD', tone: 'good' },
  { maxSinkRate: 4, label: 'FIRM', tone: 'ok' },
  { maxSinkRate: Infinity, label: 'HARD', tone: 'bad' },
];

/** How long the touchdown message stays on screen (s). */
export const TOUCHDOWN_MESSAGE_SECONDS = 5;

/** The flight-path marker is hidden below this airspeed, where the direction of travel is meaningless (m/s). */
export const FLIGHT_PATH_MARKER_MIN_SPEED = 15;

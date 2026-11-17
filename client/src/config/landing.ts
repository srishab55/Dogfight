/** Landing aids and landing practice. */

import { BLUE_CARRIER } from '@dogfight/shared';

/**
 * The "L" key: start established on final approach with landing flaps, to
 * the island airfield, or for carrier aircraft to the carrier. Speed and
 * throttle come from each class's derived performance (hands-off approach
 * speed, and the throttle that holds a 3-degree slope), so left alone it
 * flies down the glide slope to the aim point.
 */
export const LANDING_PRACTICE = {
  glideSlopeDeg: 3,
  airfield: {
    distanceFromThreshold: 2_500,
    /** Where the glide slope meets the runway, past the threshold (m). The PAPI lights stand here. */
    aimPointPastThreshold: 300,
  },
  carrier: {
    distanceFromThreshold: 1_500,
    /**
     * Early in the wire zone (m from the stern), so a slightly long
     * touchdown still traps. Must match the carrier landing test.
     */
    aimPointPastThreshold: BLUE_CARRIER.wires.from + 15,
  },
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
  /** On a carrier the lights sit on a sponson just outboard of the port deck edge, closer together. */
  carrierEdgeOffset: 2,
  carrierSpacing: 2.5,
  /** Light housing size at close range (m); scaled up with distance so it stays visible from final. */
  size: 1.6,
  /** The lights never shrink below about this many metres per kilometre of viewing distance. */
  minSizePerKilometre: 9,
  /**
   * Like real PAPI optics, they only show inside the approach sector: in front
   * of the aim point, within this angle either side of the centreline (deg),
   * and nearer than this (m).
   */
  sectorHalfAngleDeg: 15,
  maxRange: 9_000,
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

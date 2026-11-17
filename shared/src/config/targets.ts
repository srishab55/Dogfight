/**
 * Enemy targets: anti-aircraft guns, parked aircraft and the carriers. Pure
 * data and rules shared by client and (Phase 5) server. Positions are given
 * relative to a team's runway or carrier, so moving a base moves its defences.
 */

/**
 * Light anti-aircraft cannon, like a WWII 40 mm Bofors: rapid single shots
 * with tracer, fired in bursts. It leads its target (aims where the aircraft
 * will be when the shell gets there), but it slews at a limited rate, so a
 * fast crossing target or a jinking one is much harder to hit than one
 * flying straight at it.
 */
export const AA_GUN_CONFIG = {
  /** Opens fire at aircraft closer than this (m). */
  range: 1_800,
  muzzleVelocity: 880,
  roundsPerSecond: 4,
  projectileLifetime: 2.6,
  /**
   * A 40 mm shell hits far harder than a machine-gun round (1). Tuned with
   * the scatter below so a four-gun battery takes roughly a third of a
   * Fighter-Bomber's hull on one pass at 300 m: dangerous, but you survive
   * a pass or two.
   */
  damagePerRound: 8,
  /** Random scatter of each shell around the aim line (deg). */
  dispersionDeg: 0.6,
  /** Bursts: seconds of firing, then seconds of pause. */
  burstSeconds: 2.5,
  pauseSeconds: 1.8,
  /** Turret slew rates (deg/s). */
  traverseRateDeg: 60,
  elevationRateDeg: 40,
  /** Fires only once the barrels point within this angle of the aim point (deg). */
  fireWithinDeg: 4,
  /** Won't fire lower than this above the horizon (deg): it would hit its own ground. */
  minElevationDeg: 3,
  /** A good burst knocks one out: about 20 hits from machine guns. */
  maxHealth: 20,
  /** Seconds after being destroyed before a fresh gun is in place. */
  respawnSeconds: 90,
  /** Hit sphere around the mount (m). */
  hitRadius: 3,
  /** Barrel pivot above the ground or deck (m). */
  mountHeight: 1.6,
} as const;

/** Aircraft parked on an airfield's apron: soft targets. */
export const PARKED_AIRCRAFT_CONFIG = {
  maxHealth: 14,
  respawnSeconds: 120,
  /** One sphere around the fuselage and wing roots (m). */
  hitRadius: 4.5,
} as const;

/**
 * Carriers. Rounds that strike the hull, deck or island damage them; armour
 * stops half of each round. Destroyed, a carrier burns, settles by the stern
 * and sinks over about a minute, then (practice rules until Phase 6) a fresh
 * one takes its place.
 */
export const CARRIER_DAMAGE_CONFIG = {
  maxHealth: 800,
  /** Fraction of each gun round's damage that gets through the armour. */
  gunVulnerability: 0.5,
  /** Seconds from destruction until fully under. */
  sinkSeconds: 70,
  /** Seconds from destruction until a fresh carrier is back. */
  respawnSeconds: 180,
  /** How far it finally goes down (m below its normal deck height): deck, island and mast all under. */
  finalSinkDepth: 50,
  /** Visual only: the stern goes down first and it lists to port as it sinks (deg at full). */
  maxSternDownDeg: 9,
  maxListDeg: 12,
} as const;

/**
 * Where the defences are. Airfield positions are relative to the runway's
 * centre in its own frame (`along` towards its heading, `across` to its
 * right, m); carrier positions are distance from the stern and side (+1
 * starboard, -1 port).
 */
export const ENEMY_LAYOUT = {
  team: 'red',
  airfieldAaGuns: [
    { along: -420, across: 90 },
    { along: -420, across: -90 },
    { along: 120, across: 95 },
    { along: 420, across: -90 },
  ],
  /** Parked beside the runway, nose towards it (heading = runway heading - 90 deg on the right side). */
  parkedAircraft: [
    { along: -200, across: 72 },
    { along: -170, across: 72 },
    { along: -140, across: 72 },
    { along: -110, across: 72 },
  ],
  carrierAaGuns: [
    { fromStern: 45, side: -1 },
    { fromStern: 45, side: 1 },
    { fromStern: 205, side: -1 },
    { fromStern: 235, side: 1 },
  ],
} as const;

/**
 * Aircraft hit shapes, from each airframe's own dimensions: three spheres
 * along the fuselage and two along each wing. Coarse, but bullets that hit
 * them hit the aircraft you see, and misses look like misses.
 */
export const AIRCRAFT_HIT_SHAPE_CONFIG = {
  /** Fuselage spheres at these fractions from nose to tail, radius = widest fuselage radius x this. */
  fuselageStations: [0.18, 0.5, 0.8],
  fuselageRadiusScale: 1.5,
  /** Wing spheres at these fractions of the half-span, radius = local chord x this. */
  wingStations: [0.33, 0.72],
  wingRadiusScale: 0.55,
} as const;

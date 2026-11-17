/**
 * Enemy targets: anti-aircraft guns, parked aircraft and the carriers. Pure
 * data and rules shared by client and (Phase 5) server. Positions are given
 * relative to a team's runway or carrier, so moving a base moves its defences.
 */

/**
 * Each base's one anti-aircraft gun: a quad 40 mm mount on a raised concrete
 * flak platform, with a tall flag, so you can see it from far off. It fires
 * rapid tracer in bursts and leads its target (aims where the aircraft will
 * be when the shell gets there), but it slews at a limited rate, so a fast
 * crossing target or a jinking one is much harder to hit than one flying
 * straight at it.
 */
export const AA_GUN_CONFIG = {
  /** Opens fire at aircraft closer than this (m). */
  range: 2_000,
  muzzleVelocity: 880,
  /** Four barrels: about five shells a second. */
  roundsPerSecond: 5,
  projectileLifetime: 2.8,
  /** A 40 mm shell hits far harder than a machine-gun round (1). */
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
  /** About 50 machine-gun hits: two good passes, or one long one. */
  maxHealth: 50,
  /** Seconds after being destroyed before it's rebuilt (if the base hasn't been captured). */
  respawnSeconds: 240,
  /** Hit sphere around the platform and gun (m). */
  hitRadius: 7,
  /** The guns sit on top of the platform (m above the ground or deck). */
  mountHeight: 5,
} as const;

/**
 * A base's buildings. Destroying them, with its AA gun, leaves the base
 * defenceless: land on it and it's yours. Size: the hit sphere's radius (m);
 * health in machine-gun hits; rebuilt after `respawnSeconds` unless captured.
 */
export const BASE_STRUCTURE_CONFIG = {
  hangar: { hitRadius: 17, height: 7, maxHealth: 80, respawnSeconds: 240 },
  fuelDepot: { hitRadius: 12, height: 4, maxHealth: 40, respawnSeconds: 240 },
  radar: { hitRadius: 8, height: 9, maxHealth: 30, respawnSeconds: 240 },
} as const;

/** Capturing: stop on a defenceless enemy base's runway (or aprons) for this long. */
export const CAPTURE_CONFIG = {
  seconds: 5,
  /** Counts as stopped below this ground speed (m/s). */
  maxGroundSpeed: 3,
} as const;

/** Aircraft parked on an airfield's apron: soft targets. */
export const PARKED_AIRCRAFT_CONFIG = {
  maxHealth: 14,
  respawnSeconds: 120,
  /** One sphere around the fuselage and wing roots (m). */
  hitRadius: 6,
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
 * right, m), all on the flattened airfield pad; carrier positions are
 * distance from the stern and side (+1 starboard, -1 port).
 */
export const ENEMY_LAYOUT = {
  team: 'red',
  airfieldAaGun: { along: -20, across: -98 },
  hangar: { along: -250, across: 100 },
  fuelDepot: { along: 160, across: 98 },
  radar: { along: 400, across: -98 },
  /** Parked in front of the hangar, nose towards the runway. */
  parkedAircraft: [
    { along: -287, across: 66 },
    { along: -262, across: 66 },
    { along: -237, across: 66 },
    { along: -212, across: 66 },
  ],
  carrierAaGun: { fromStern: 205, side: -1 },
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

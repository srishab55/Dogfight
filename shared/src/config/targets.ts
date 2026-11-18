/**
 * Enemy targets: anti-aircraft guns, parked aircraft and the carriers. Pure
 * data and rules shared by client and (Phase 5) server. Positions are given
 * relative to a team's runway or carrier, so moving a base moves its defences.
 */

/**
 * Everything at a base (AA guns and their platforms, hangars, fuel depots,
 * radars) is built this much larger than life, hit spheres and heights
 * included, so it's big enough to find and aim at from the air (your
 * request). The client scales the models by the same factor.
 */
export const BASE_UNIT_SCALE = 1.6;

/**
 * The bases' anti-aircraft guns, two at each: a quad 40 mm mount on a
 * raised concrete flak platform, with a tall flag, so you can see it from
 * far off. It fires rapid tracer in bursts and leads its target (aims where
 * the aircraft will be when the shell gets there), but it slews at a
 * limited rate, so a fast crossing target or a jinking one is much harder to
 * hit than one flying straight at it.
 */
export const AA_GUN_CONFIG = {
  /** Opens fire at aircraft closer than this (m). */
  range: 2_400,
  muzzleVelocity: 880,
  /** Four barrels: about five shells a second. */
  roundsPerSecond: 5,
  projectileLifetime: 2.8,
  /** A 40 mm shell hits far harder than a machine-gun round (1). */
  damagePerRound: 9,
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
  /** About 70 machine-gun hits: two or three good passes. Once destroyed it stays destroyed (see CAPTURE_CONFIG). */
  maxHealth: 70,
  /** Hit sphere around the platform and gun (m). */
  hitRadius: 7 * BASE_UNIT_SCALE,
  /** The guns sit on top of the platform (m above the ground or deck). */
  mountHeight: 5 * BASE_UNIT_SCALE,
} as const;

/**
 * A base's buildings. Destroying them, with its AA gun, leaves the base
 * defenceless: land on it and it's yours. Size: the hit sphere's radius (m),
 * centred `height` above the ground; health in machine-gun hits. Destroyed,
 * they stay destroyed (see CAPTURE_CONFIG). The radar's sphere reaches down
 * to the ground, so rounds fired from an aircraft on the runway hit it.
 */
export const BASE_STRUCTURE_CONFIG = {
  hangar: { hitRadius: 17 * BASE_UNIT_SCALE, height: 7 * BASE_UNIT_SCALE, maxHealth: 80 },
  fuelDepot: { hitRadius: 12 * BASE_UNIT_SCALE, height: 4 * BASE_UNIT_SCALE, maxHealth: 40 },
  radar: { hitRadius: 9 * BASE_UNIT_SCALE, height: 7 * BASE_UNIT_SCALE, maxHealth: 30 },
} as const;

/**
 * Capturing: stop on a base nobody holds, or a defenceless enemy one, for
 * this long (on an airfield's runway, service lane or aprons; on a carrier's
 * deck). Nothing at a base rebuilds itself: what's destroyed stays destroyed
 * until the base is captured. Then everything there changes sides, and its
 * destroyed or never-built defences (AA gun, hangar, fuel depot, radar) are
 * built for the new owner after `repairSeconds`.
 */
export const CAPTURE_CONFIG = {
  seconds: 5,
  /** Counts as stopped below this ground speed (m/s). */
  maxGroundSpeed: 3,
  /** After a capture, the new owner's crews rebuild the base's defences in this long (s). */
  repairSeconds: 30,
} as const;

/** Aircraft parked on an airfield's apron: soft targets (none are placed on the current map). */
export const PARKED_AIRCRAFT_CONFIG = {
  /** Destroyed, they stay wrecks; on a capture, any left intact are captured with the base. */
  maxHealth: 14,
  /** One sphere around the fuselage and wing roots (m). */
  hitRadius: 6,
} as const;

/**
 * Carrier hulls, when they can be sunk (`createTargets({ carrierHulls: true })`;
 * not in a match, where carriers are captured instead, like airfields).
 * Rounds that strike the hull, deck or island damage them; armour stops
 * half of each round. Destroyed, a carrier burns, settles by the stern and
 * sinks over about a minute, then a fresh one takes its place.
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
 * Where each base's defences are. Every island airfield has the same
 * layout, relative to its runway's centre in the runway's own frame
 * (`along` towards its heading, `across` to its right, m), all on the
 * flattened pad: the AA gun on the left, the hangar and fuel depot on the
 * right behind the service lane (which runs at across 63-81). Carrier
 * positions are distance from the stern and side (+1 starboard, -1 port).
 */
export const BASE_LAYOUT = {
  /** Two AA guns, both on the side away from the hangars, 400 m apart: together they cover the whole runway. */
  airfieldAaGuns: [
    { along: -20, across: -98 },
    { along: 380, across: -98 },
  ],
  hangar: { along: -250, across: 108 },
  fuelDepot: { along: 160, across: 102 },
  /**
   * Beside the runway near its far end, 15 m off its edge: an aircraft that
   * lands stops a few hundred metres short of it, nearly in line, so a touch
   * of rudder and it can shoot it from the ground.
   */
  radar: { along: -450, across: -54 },
  /**
   * Two on each carrier: forward on the port side, aft on the starboard side
   * (clear of the wires and the island), 1 m in from the deck's edge. (Their
   * platforms are drawn narrower than an airfield's, to stay clear of the landing line.)
   */
  carrierAaGuns: [
    { fromStern: 205, side: -1 },
    { fromStern: 60, side: 1 },
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

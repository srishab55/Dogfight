import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';

/**
 * Gameplay-relevant description of the world. Anything the server will need to
 * know (sizes, runway and carrier locations, spawn points) lives here; purely
 * visual settings (colours, fog, texture sizes) live in the client's config.
 *
 * The map is a small stretch of sea: three islands and two aircraft carriers.
 * Each team's home is its carrier (Blue in the south-west, Red in the
 * north-east). Each island has an airfield that belongs to nobody when a
 * match starts: land on one to take it. The layout is point-symmetric about
 * the origin, so both teams are the same distance from everything.
 */
export const WORLD_CONFIG = {
  /** Side length of the square playable area in metres, centred on the origin. */
  playableAreaSize: 8_000,
  /**
   * World height datum (m): the island airfields' elevation. Flat test
   * ground sits here too. Altitudes in the game are measured from it.
   */
  groundHeight: 0,
  /** The sea surface (m). The airfields stand 5 m above it. */
  seaLevel: -5,
} as const;

/** A runway is a flat rectangle aircraft can take off from and land on. */
export interface RunwayDefinition {
  readonly id: string;
  /** Centre of the runway surface in world space (m). */
  readonly center: Readonly<Vec3>;
  /** Direction of the runway centreline, in degrees clockwise from +Z (north). */
  readonly headingDegrees: number;
  /** Length along the centreline (m). */
  readonly length: number;
  /** Width across the centreline (m). */
  readonly width: number;
}

/** Island runways are this wide (m): room to land a little off the centreline. */
const RUNWAY_WIDTH = 60;

/**
 * The south island's airfield, nearest Blue's carrier. Every runway lies
 * east-west, so every approach is over open sea (and none crosses another
 * island's mountain, which the approach clearances would cut down).
 */
export const SOUTH_RUNWAY: RunwayDefinition = {
  id: 'south-airfield',
  center: { x: -300, y: WORLD_CONFIG.groundHeight, z: -2_100 },
  headingDegrees: 90,
  length: 1_200,
  width: RUNWAY_WIDTH,
};

/** The north island's airfield, nearest Red's carrier (the south one turned about the centre). */
export const NORTH_RUNWAY: RunwayDefinition = {
  id: 'north-airfield',
  center: { x: 300, y: WORLD_CONFIG.groundHeight, z: 2_100 },
  headingDegrees: 270,
  length: 1_200,
  width: RUNWAY_WIDTH,
};

/** The central island's airfield, east-west along its southern side, between the two carriers. */
export const CENTRAL_RUNWAY: RunwayDefinition = {
  id: 'central-airfield',
  center: { x: 0, y: WORLD_CONFIG.groundHeight, z: -180 },
  headingDegrees: 90,
  length: 1_100,
  width: RUNWAY_WIDTH,
};

/** Landing practice, the practice balloons and flat-ground tests use this runway. */
export const HOME_RUNWAY = SOUTH_RUNWAY;

/** Every island runway. */
export const RUNWAYS: readonly RunwayDefinition[] = [SOUTH_RUNWAY, CENTRAL_RUNWAY, NORTH_RUNWAY];

/**
 * Each airfield's service lane: a paved strip parallel to the runway on its
 * hangar side, joined to it by a taxiway at each end. Pull off the runway
 * onto it to be rearmed and repaired, leaving the runway clear. Positions in
 * the runway's own frame (m).
 */
export const SERVICE_LANE = {
  /** Centreline of the lane, to the right of the runway's centreline. */
  across: 72,
  width: 18,
  /** It runs between these points along the runway; the taxiways join at both ends. */
  from: -380,
  to: 380,
  taxiwayWidth: 18,
} as const;

/** A runway's service lane and its two taxiways, as paved rectangles. */
export function serviceLaneAreas(runway: RunwayDefinition): RunwayDefinition[] {
  const s = SERVICE_LANE;
  const h = (runway.headingDegrees * Math.PI) / 180;
  const at = (along: number, across: number) => ({
    x: runway.center.x + along * Math.sin(h) + across * Math.cos(h),
    y: runway.center.y,
    z: runway.center.z + along * Math.cos(h) - across * Math.sin(h),
  });
  const laneLength = s.to - s.from;
  // Each taxiway spans from the runway's edge to the lane's far edge.
  const taxiFrom = runway.width / 2 - 2;
  const taxiTo = s.across + s.width / 2;
  const taxiCentre = (taxiFrom + taxiTo) / 2;
  return [
    { id: `${runway.id}-lane`, center: at((s.from + s.to) / 2, s.across), headingDegrees: runway.headingDegrees, length: laneLength, width: s.width },
    ...[s.from, s.to].map((along, i) => ({ id: `${runway.id}-taxiway-${i}`, center: at(along, taxiCentre), headingDegrees: (runway.headingDegrees + 90) % 360, length: taxiTo - taxiFrom, width: s.taxiwayWidth })),
  ];
}

/** Every paved surface: the runways, their service lanes and taxiways. Wheels roll on these with runway friction. */
export const PAVED_AREAS: readonly RunwayDefinition[] = [...RUNWAYS, ...RUNWAYS.flatMap(serviceLaneAreas)];

/**
 * An aircraft carrier, anchored. Its flight deck is a short runway with
 * arrestor wires across its after end: a hooked aircraft that touches down
 * among them is caught and stopped within a few dozen metres.
 */
export interface CarrierDefinition {
  readonly id: string;
  readonly team: Team;
  /** Centre of the flight deck, at deck height (m). */
  readonly center: Readonly<Vec3>;
  /** Direction from stern to bow, clockwise from north (deg). */
  readonly headingDegrees: number;
  readonly deckLength: number;
  readonly deckWidth: number;
  /** Arrestor wires span this distance range, measured forward from the stern (m). */
  readonly wires: { readonly from: number; readonly to: number; readonly count: number };
  /**
   * Crash barrier: a cable net across the deck just past the wires. An
   * aircraft that misses every wire (or has no hook) and rolls into it on
   * its wheels is stopped, with some damage (FlightModel), instead of going off the bow.
   */
  readonly barrier: { readonly fromStern: number };
  /** The bow catapult's track, measured forward from the stern (m). Its aircraft spawn at the start of it. */
  readonly catapult: { readonly from: number; readonly to: number };
  /**
   * The island (bridge and funnel) on the starboard (right) side: its centre
   * along the deck from the stern and across from the centreline, its
   * footprint, and its height above the deck (m). It is solid: hitting it is a crash.
   */
  readonly island: { readonly along: number; readonly across: number; readonly length: number; readonly width: number; readonly height: number };
  /** Hull depth below the deck down to the waterline (m). */
  readonly freeboard: number;
}

const CARRIER_FREEBOARD = 16;
const CARRIER_DECK_HEIGHT = WORLD_CONFIG.seaLevel + CARRIER_FREEBOARD;
/**
 * The bow catapult. An anchored carrier has no wind over its deck, and
 * without one a loaded carrier aircraft needs more than the whole deck to
 * reach flying speed, so it is launched. A holdback bar keeps the aircraft
 * in place while the engine runs up; at full throttle the catapult fires and
 * accelerates it along the track: 3 g over 45 m, leaving the bow at about
 * 56 m/s (200 km/h). A WWII H-4 catapult gave less ground speed, but the
 * ship steamed into the wind for an extra 25-30 knots of airspeed; this
 * anchored carrier has none, so the catapult supplies it.
 */
export const CATAPULT_CONFIG = {
  /** Acceleration the catapult adds to the engine's (m/s^2). */
  acceleration: 30,
  /** Fires when the throttle lever and the engine are both at least this high. */
  launchThrottle: 0.95,
  stroke: 45,
} as const;

const CARRIER_SHAPE = {
  deckLength: 260,
  deckWidth: 34,
  // Ten wires over the first 125 m: generous, so a slightly long touchdown still traps.
  wires: { from: 15, to: 125, count: 10 },
  barrier: { fromStern: 140 },
  catapult: { from: 200, to: 200 + CATAPULT_CONFIG.stroke },
  island: { along: 150, across: 12.5, length: 34, width: 7, height: 22 },
  freeboard: CARRIER_FREEBOARD,
} as const;

/** Blue's carrier, its home: west of the south island, bow to the north-north-east. */
export const BLUE_CARRIER: CarrierDefinition = {
  id: 'blue-carrier',
  team: 'blue',
  center: { x: -2_700, y: CARRIER_DECK_HEIGHT, z: -700 },
  headingDegrees: 15,
  ...CARRIER_SHAPE,
};

/** Red's carrier, its home: east of the north island, bow to the south-south-west. */
export const RED_CARRIER: CarrierDefinition = {
  id: 'red-carrier',
  team: 'red',
  center: { x: 2_700, y: CARRIER_DECK_HEIGHT, z: 700 },
  headingDegrees: 195,
  ...CARRIER_SHAPE,
};

export const CARRIERS: readonly CarrierDefinition[] = [BLUE_CARRIER, RED_CARRIER];

/** The flight deck as a runway: threshold at the stern, heading to the bow. Used for spawns, approaches and approach lights. */
export function carrierDeckRunway(carrier: CarrierDefinition): RunwayDefinition {
  return { id: `${carrier.id}-deck`, center: carrier.center, headingDegrees: carrier.headingDegrees, length: carrier.deckLength, width: carrier.deckWidth };
}

/**
 * Where world point (x, z) lies in a runway's own frame: `along` from its
 * centre towards its heading, `across` to the right of the centreline (m).
 */
export function runwayLocal(runway: RunwayDefinition, x: number, z: number): { along: number; across: number } {
  const heading = (runway.headingDegrees * Math.PI) / 180;
  const dx = x - runway.center.x;
  const dz = z - runway.center.z;
  return { along: dx * Math.sin(heading) + dz * Math.cos(heading), across: dx * Math.cos(heading) - dz * Math.sin(heading) };
}

/** True if world point (x, z) lies on the runway's rectangle. */
export function isOnRunway(runway: RunwayDefinition, x: number, z: number, margin = 0): boolean {
  const { along, across } = runwayLocal(runway, x, z);
  return Math.abs(along) <= runway.length / 2 + margin && Math.abs(across) <= runway.width / 2 + margin;
}

/** What a point on a carrier is: the deck, the wire zone, the barrier, the island (a solid block), or not on this carrier at all. */
export type CarrierPart = 'deck' | 'wires' | 'barrier' | 'island' | null;

/** The barrier is a strip this wide across the deck (m): a wheel rolling over it meets the net. */
const BARRIER_DEPTH = 4;

export function carrierPartAt(carrier: CarrierDefinition, x: number, z: number): CarrierPart {
  // Inline rather than runwayLocal(): this runs for every ground query, and must not allocate.
  const heading = (carrier.headingDegrees * Math.PI) / 180;
  const dx = x - carrier.center.x;
  const dz = z - carrier.center.z;
  const across = dx * Math.cos(heading) - dz * Math.sin(heading);
  const fromStern = dx * Math.sin(heading) + dz * Math.cos(heading) + carrier.deckLength / 2;
  if (fromStern < 0 || fromStern > carrier.deckLength || Math.abs(across) > carrier.deckWidth / 2) return null;
  const island = carrier.island;
  if (Math.abs(fromStern - island.along) <= island.length / 2 && Math.abs(across - island.across) <= island.width / 2) return 'island';
  if (fromStern >= carrier.wires.from && fromStern <= carrier.wires.to) return 'wires';
  if (Math.abs(fromStern - carrier.barrier.fromStern) <= BARRIER_DEPTH / 2) return 'barrier';
  return 'deck';
}

export type SurfaceType = 'runway' | 'grass' | 'deck' | 'wires' | 'barrier' | 'water';

/** Tyre friction coefficients (force / normal load) per ground surface. */
export interface SurfaceFriction {
  /** Rolling resistance of a free-rolling wheel. */
  readonly rolling: number;
  /** Grip available to the brakes. */
  readonly braking: number;
  /** Sideways grip that stops the tyre skidding. */
  readonly lateral: number;
}

const DECK_FRICTION: SurfaceFriction = { rolling: 0.025, braking: 0.55, lateral: 0.8 };

export const SURFACE_FRICTION: Readonly<Record<SurfaceType, SurfaceFriction>> = {
  runway: { rolling: 0.02, braking: 0.6, lateral: 0.8 },
  // Grass: about 3x the rolling drag (longer take-off run), less grip for braking and cornering.
  grass: { rolling: 0.07, braking: 0.35, lateral: 0.55 },
  deck: DECK_FRICTION,
  wires: DECK_FRICTION,
  barrier: DECK_FRICTION,
  // Wheels in the sea: the flight model treats any contact as ditching; these only matter for one step.
  water: { rolling: 1, braking: 0, lateral: 1 },
};

/**
 * Somewhere a team's aircraft can land to rearm and repair: an island
 * airfield (its runway plus service lane and aprons) or a carrier's deck.
 */
export interface BaseDefinition {
  readonly id: string;
  /** Who holds it when a match starts: a team's carrier is its own; island airfields belong to nobody (null). */
  readonly team: Team | null;
  readonly name: string;
  readonly kind: 'airfield' | 'carrier';
  /** The runway, or for a carrier its flight deck. */
  readonly runway: RunwayDefinition;
  /** How far beyond the runway's edges the service area reaches (m). 0 for a carrier: the deck is the base. */
  readonly serviceMargin: number;
}

/** Airfield service areas reach this far beyond the runway's edges: over the service lane and the aprons (m). */
const AIRFIELD_SERVICE_MARGIN = SERVICE_LANE.across + SERVICE_LANE.width / 2 - RUNWAY_WIDTH / 2 + 5;

export const BASES: readonly BaseDefinition[] = [
  { id: 'blue-carrier', team: 'blue', name: 'Blue carrier', kind: 'carrier', runway: carrierDeckRunway(BLUE_CARRIER), serviceMargin: 0 },
  { id: 'red-carrier', team: 'red', name: 'Red carrier', kind: 'carrier', runway: carrierDeckRunway(RED_CARRIER), serviceMargin: 0 },
  { id: 'south-airfield', team: null, name: 'South airfield', kind: 'airfield', runway: SOUTH_RUNWAY, serviceMargin: AIRFIELD_SERVICE_MARGIN },
  { id: 'central-airfield', team: null, name: 'Central airfield', kind: 'airfield', runway: CENTRAL_RUNWAY, serviceMargin: AIRFIELD_SERVICE_MARGIN },
  { id: 'north-airfield', team: null, name: 'North airfield', kind: 'airfield', runway: NORTH_RUNWAY, serviceMargin: AIRFIELD_SERVICE_MARGIN },
];

/** Who holds a base now (null: nobody yet); see combat/baseControl.ts. */
export type BaseOwnerLookup = (base: BaseDefinition) => Team | null;

/** The team's base containing world point (x, z), or null. Captured bases count for their new owner. */
export function friendlyBaseAt(team: Team, x: number, z: number, ownerOf: BaseOwnerLookup = (base) => base.team): BaseDefinition | null {
  return BASES.find((base) => ownerOf(base) === team && isOnRunway(base.runway, x, z, base.serviceMargin)) ?? null;
}

/** A team's home: its carrier. */
export function homeBase(team: Team): BaseDefinition {
  const base = BASES.find((b) => b.team === team && b.kind === 'carrier');
  if (!base) throw new Error(`No carrier for team ${team}`);
  return base;
}

/** A base by id (throws if there's none: ids are fixed data). */
export function baseById(id: string): BaseDefinition {
  const base = BASES.find((b) => b.id === id);
  if (!base) throw new Error(`No base ${id}`);
  return base;
}

/** Where and which way an aircraft starts. `position` is the ground contact point. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly headingDegrees: number;
}

/**
 * Spawn point on a runway's centreline, `distanceFromThreshold` metres in from
 * the start of the runway, facing along the runway heading.
 */
export function getRunwaySpawnPoint(runway: RunwayDefinition, distanceFromThreshold: number): SpawnPoint {
  const heading = (runway.headingDegrees * Math.PI) / 180;
  // Unit vector along the runway. Heading 0 points to +Z, heading 90 to +X.
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  // The threshold is half a runway length behind the centre.
  const offset = -runway.length / 2 + distanceFromThreshold;
  return {
    position: {
      x: runway.center.x + forwardX * offset,
      y: runway.center.y,
      z: runway.center.z + forwardZ * offset,
    },
    headingDegrees: runway.headingDegrees,
  };
}

/** Spawn distances from the threshold (m): near the start of a runway; on a carrier, at the start of the bow catapult. */
export const SPAWN_DISTANCE = { airfield: 60, carrier: CARRIER_SHAPE.catapult.from } as const;

/** Where a base's aircraft start. Carrier aircraft start on the catapult. */
export function baseSpawnPoint(base: BaseDefinition): SpawnPoint {
  return getRunwaySpawnPoint(base.runway, base.kind === 'carrier' ? SPAWN_DISTANCE.carrier : SPAWN_DISTANCE.airfield);
}

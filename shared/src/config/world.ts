import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';

/**
 * Gameplay-relevant description of the world. Anything the server will need to
 * know (sizes, runway and carrier locations, spawn points) lives here; purely
 * visual settings (colours, fog, texture sizes) live in the client's config.
 *
 * The map is a small stretch of sea: three islands and two aircraft carriers.
 * Blue holds the southern island and its carrier, Red the northern ones;
 * the mountainous central island lies between them.
 */
export const WORLD_CONFIG = {
  /** Side length of the square playable area in metres, centred on the origin. */
  playableAreaSize: 14_000,
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

/** Blue's airfield, on the southern island, facing north towards the enemy. */
export const BLUE_RUNWAY: RunwayDefinition = {
  id: 'blue-airfield',
  center: { x: 0, y: WORLD_CONFIG.groundHeight, z: -4_000 },
  headingDegrees: 0,
  length: 1_200,
  width: 40,
};

/** Red's airfield, on the northern island, facing south. */
export const RED_RUNWAY: RunwayDefinition = {
  id: 'red-airfield',
  center: { x: 500, y: WORLD_CONFIG.groundHeight, z: 4_300 },
  headingDegrees: 180,
  length: 1_200,
  width: 40,
};

/** The player's home runway until teams arrive in Phase 6. */
export const HOME_RUNWAY = BLUE_RUNWAY;

/** Every island runway. */
export const RUNWAYS: readonly RunwayDefinition[] = [BLUE_RUNWAY, RED_RUNWAY];

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
  wires: { from: 22, to: 92, count: 7 },
  catapult: { from: 200, to: 200 + CATAPULT_CONFIG.stroke },
  island: { along: 150, across: 12.5, length: 34, width: 7, height: 22 },
  freeboard: CARRIER_FREEBOARD,
} as const;

/** Blue's carrier lies west of the Blue island, bow to the north-north-east. */
export const BLUE_CARRIER: CarrierDefinition = {
  id: 'blue-carrier',
  team: 'blue',
  center: { x: -4_300, y: CARRIER_DECK_HEIGHT, z: -2_300 },
  headingDegrees: 15,
  ...CARRIER_SHAPE,
};

/** Red's carrier lies east of the Red island, bow to the south-south-west. */
export const RED_CARRIER: CarrierDefinition = {
  id: 'red-carrier',
  team: 'red',
  center: { x: 4_600, y: CARRIER_DECK_HEIGHT, z: 2_700 },
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

/** What a point on a carrier is: the deck, the wire zone, the island (a solid block), or not on this carrier at all. */
export type CarrierPart = 'deck' | 'wires' | 'island' | null;

export function carrierPartAt(carrier: CarrierDefinition, x: number, z: number): CarrierPart {
  const { along, across } = runwayLocal(carrierDeckRunway(carrier), x, z);
  const fromStern = along + carrier.deckLength / 2;
  if (fromStern < 0 || fromStern > carrier.deckLength || Math.abs(across) > carrier.deckWidth / 2) return null;
  const island = carrier.island;
  if (Math.abs(fromStern - island.along) <= island.length / 2 && Math.abs(across - island.across) <= island.width / 2) return 'island';
  if (fromStern >= carrier.wires.from && fromStern <= carrier.wires.to) return 'wires';
  return 'deck';
}

export type SurfaceType = 'runway' | 'grass' | 'deck' | 'wires' | 'water';

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
  // Wheels in the sea: the flight model treats any contact as ditching; these only matter for one step.
  water: { rolling: 1, braking: 0, lateral: 1 },
};

/**
 * Somewhere a team's aircraft can land to rearm and repair: an island
 * airfield (its runway plus taxiways and aprons) or a carrier's deck.
 */
export interface BaseDefinition {
  readonly id: string;
  readonly team: Team;
  readonly name: string;
  readonly kind: 'airfield' | 'carrier';
  /** The runway, or for a carrier its flight deck. */
  readonly runway: RunwayDefinition;
  /** How far beyond the runway's edges the service area reaches (m). 0 for a carrier: the deck is the base. */
  readonly serviceMargin: number;
}

export const BASES: readonly BaseDefinition[] = [
  { id: 'blue-airfield', team: 'blue', name: 'Blue airfield', kind: 'airfield', runway: BLUE_RUNWAY, serviceMargin: 60 },
  { id: 'blue-carrier', team: 'blue', name: 'Blue carrier', kind: 'carrier', runway: carrierDeckRunway(BLUE_CARRIER), serviceMargin: 0 },
  { id: 'red-airfield', team: 'red', name: 'Red airfield', kind: 'airfield', runway: RED_RUNWAY, serviceMargin: 60 },
  { id: 'red-carrier', team: 'red', name: 'Red carrier', kind: 'carrier', runway: carrierDeckRunway(RED_CARRIER), serviceMargin: 0 },
];

/** The team's base containing world point (x, z), or null. */
export function friendlyBaseAt(team: Team, x: number, z: number): BaseDefinition | null {
  return BASES.find((base) => base.team === team && isOnRunway(base.runway, x, z, base.serviceMargin)) ?? null;
}

/** The team's base of the given kind (each team has one airfield and one carrier). */
export function teamBase(team: Team, kind: BaseDefinition['kind']): BaseDefinition {
  const base = BASES.find((b) => b.team === team && b.kind === kind);
  if (!base) throw new Error(`No ${kind} base for team ${team}`);
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

// Public surface of @dogfight/shared.
// Rule: nothing in this package may import Babylon.js or use browser APIs,
// because the authoritative game server (Phase 5) runs this same code in Node.js.

export type { Vec3 } from './types/vector';
export type { Team } from './types/team';

export {
  WORLD_CONFIG,
  HOME_RUNWAY,
  RUNWAYS,
  SURFACE_FRICTION,
  getRunwaySpawnPoint,
  isOnRunway,
  type RunwayDefinition,
  type SpawnPoint,
  type SurfaceType,
} from './config/world';
export { SIMULATION_CONFIG, PHYSICS_CONSTANTS } from './config/simulation';
export { PRIMITIVE_AIRFRAME, PRIMITIVE_GROUND_CLEARANCE } from './config/airframe';
export { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_IDS, type AircraftClassId, type AircraftClassSpec } from './config/aircraftClasses';

export type { Quat } from './math/quat';

export {
  createParkedState,
  createAirborneState,
  createApproachState,
  type ApproachSetup,
  copyAircraftState,
  cloneAircraftState,
  type AircraftState,
  type FlightTelemetry,
} from './flight/AircraftState';
export { neutralControls, sanitizeControls, type FlightControls } from './flight/FlightControls';
export { stepAircraft } from './flight/FlightModel';
export { createFlatGround, type GroundQuery } from './flight/ground';
export { TERRAIN_CONFIG } from './config/terrain';
export { createTerrain, fbm, proceduralHeight, type Terrain } from './world/terrain';
export { getAttitude, type Attitude } from './flight/attitude';
export { computePerformance, type AircraftPerformance } from './flight/performance';
export { stallAngles } from './flight/aerodynamics';
export { DEFAULT_DIRECTION_PILOT, steerTowards, type DirectionPilotTuning, type StickInputs } from './flight/directionPilot';

export { GUN_SPECS, PRACTICE_TARGET_CONFIG, type GunSpec } from './config/weapons';
export { PRIMITIVE_GUN_MOUNTS } from './config/airframe';
export { createGunState, gunMounts, stepGuns, type GunState } from './combat/guns';
export { ProjectilePool, segmentSphereIntersection, type ImpactListener, type SphereTarget } from './combat/projectiles';
export { createPracticeTargets, isTargetAlive, type PracticeTarget } from './combat/targets';
export { CombatWorld, type CombatEvent, type Shooter } from './combat/CombatWorld';

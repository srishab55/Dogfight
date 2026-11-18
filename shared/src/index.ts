// Public surface of @dogfight/shared.
// Rule: nothing in this package may import Babylon.js or use browser APIs,
// because the authoritative game server (Phase 5) runs this same code in Node.js.

export type { Vec3 } from './types/vector';
export type { Team } from './types/team';

export {
  WORLD_CONFIG,
  HOME_RUNWAY,
  SOUTH_RUNWAY,
  CENTRAL_RUNWAY,
  NORTH_RUNWAY,
  RUNWAYS,
  PAVED_AREAS,
  SERVICE_LANE,
  serviceLaneAreas,
  BLUE_CARRIER,
  RED_CARRIER,
  CARRIERS,
  BASES,
  CATAPULT_CONFIG,
  SPAWN_DISTANCE,
  SURFACE_FRICTION,
  baseSpawnPoint,
  carrierDeckRunway,
  carrierPartAt,
  friendlyBaseAt,
  getRunwaySpawnPoint,
  isOnRunway,
  runwayLocal,
  homeBase,
  baseById,
  type BaseDefinition,
  type BaseOwnerLookup,
  type CarrierDefinition,
  type CarrierPart,
  type RunwayDefinition,
  type SpawnPoint,
  type SurfaceType,
} from './config/world';
export { SIMULATION_CONFIG, PHYSICS_CONSTANTS } from './config/simulation';
export {
  AIRFRAMES,
  REFERENCE_WING_SPAN,
  defineAirframe,
  type Airframe,
  type AirframeDesign,
  type AirframeId,
  type CrashPoint,
  type EngineDesign,
  type FinDesign,
  type GlazingDesign,
  type LandingGearDesign,
  type LatheProfile,
  type PlainWingDesign,
  type StoreDesign,
  type StrutDesign,
  type TailplaneDesign,
  type WheelDefinition,
  type WingDesign,
} from './config/airframe';
export {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  groundClearance,
  hasTailhook,
  type AircraftClassId,
  type AircraftClassSpec,
} from './config/aircraftClasses';

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
export { TERRAIN_CONFIG, type IslandDefinition } from './config/terrain';
export { SEA_FLOOR_HEIGHT, createTerrain, fbm, naturalHeight, proceduralHeight, type Terrain } from './world/terrain';
export { createWorldGround } from './world/worldGround';
export { getAttitude, type Attitude } from './flight/attitude';
export { computePerformance, type AircraftPerformance } from './flight/performance';
export { stallAngles, wingSpan } from './flight/aerodynamics';
export { DEFAULT_DIRECTION_PILOT, steerTowards, type DirectionPilotTuning, type StickInputs } from './flight/directionPilot';
export { STEERING_ASSIST_CONFIG, createSteeringAssistMemory, steerWithTurnInput, type SteeringAssistMemory } from './flight/steeringAssist';
export { AUTO_LAND_CONFIG, autoLandBaseFor, planAutoLand, stepAutoLand, type AutoLand, type AutoLandPhase, autoLandCost, chooseAutoLandBase, type AutoLandPreferences } from './flight/autoLand';
export { LANDING_GEAR_CONFIG, gearLocked, stepLandingGear } from './flight/landingGear';

export { GUN_SPECS, PRACTICE_TARGET_CONFIG, SERVICE_CONFIG, type GunSpec, HIT_ASSIST_CONFIG, TARGET_VISIBILITY_CONFIG } from './config/weapons';
export { enlargeBlend, shownScale, visibilityScale } from './combat/visibility';
export { createGunState, fullAmmo, gunMounts, hashToUnit, stepGuns, type GunState } from './combat/guns';
export { AA_GUN_CONFIG, AIRCRAFT_HIT_SHAPE_CONFIG, BASE_STRUCTURE_CONFIG, BASE_UNIT_SCALE, CAPTURE_CONFIG, CARRIER_DAMAGE_CONFIG, BASE_LAYOUT, PARKED_AIRCRAFT_CONFIG } from './config/targets';
export { airStartBases, basesHeld, createBaseControls, startingBases, stepBaseControls, type BaseControl, type BaseEvent, type Capturer } from './combat/baseControl';
export { createAaGun, stepAaGun, type AaGunState, type AaTarget } from './combat/antiAircraft';
export { airframeHitSpheres, placeHitSpheres, placedSphere, type HitSphere, type PlacedSphere } from './combat/hitShapes';
export { createCarrierStatuses, type CarrierStatus, type CarrierStatusMap } from './world/carrierStatus';
export { createServiceStatus, needsService, stepService, type ServiceEvent, type ServiceStatus } from './combat/service';
export { ProjectilePool, segmentSphereIntersection, teamCode, type ImpactListener, type SphereTarget } from './combat/projectiles';
export { BASE_DEFENCE_KINDS, createPracticeTargets, createTargets, damageTarget, isTargetAlive, updateTargets, type CombatTarget, type PracticeTarget, type TargetKind, type TargetOptions } from './combat/targets';
export { CombatWorld, type CombatEvent, type Shooter } from './combat/CombatWorld';

export { MATCH_CONFIG } from './config/match';
export { AI_CONFIG } from './config/ai';
export { createMatch, remainingSeconds, stepMatch, type MatchResult, type MatchState } from './match/match';
export { Status, action, condition, cooldown, guard, inverter, selector, sequence, timeout, type BtNode } from './ai/behaviourTree';
export { AiPilot, createSquadron, type AiContact, type AiRole, type AiWorld } from './ai/AiPilot';
export { AiForce } from './ai/AiForce';
export { leadDirection, roundsWouldHit } from './combat/aimAssist';

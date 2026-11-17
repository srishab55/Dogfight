import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import {
  AIRCRAFT_CLASSES,
  AIRFRAMES,
  CARRIERS,
  baseSpawnPoint,
  cloneAircraftState,
  computePerformance,
  copyAircraftState,
  createAirborneState,
  createApproachState,
  createParkedState,
  hasTailhook,
  stepAircraft,
  teamBase,
  type AircraftClassId,
  type AircraftClassSpec,
  type AircraftPerformance,
  type AircraftState,
  type AirframeId,
  type BaseDefinition,
  type FlightControls,
  type GroundQuery,
  type Team,
} from '@dogfight/shared';
import { FLAP_STYLE_BY_CLASS, PROPELLER_VISUAL_CONFIG } from '../config/aircraftVisuals';
import { LANDING_PRACTICE } from '../config/landing';
import type { AircraftVisual } from './AircraftVisual';
import { createAircraftModel } from './aircraftModel';
import { PaintChoices } from './paint';

/** Landing flaps' position at which the arrestor hook is lowered (the landing notch). */
const HOOK_DOWN_FLAPS = 0.75;
/** ...and, for the land fighters (which carry a hook too), only this close to a carrier (m). */
const HOOK_NEAR_CARRIER = 3_000;
/** Flaps for a catapult launch: the take-off notch. */
const CATAPULT_FLAPS = 0.5;

/**
 * The locally flown aircraft: simulation state (from the shared flight model)
 * plus its visual.
 *
 * Physics runs in fixed steps, but frames are drawn in between. This keeps the
 * last two physics states and draws a blend of them, so motion is smooth at
 * any refresh rate. (Drawing only the latest state judders whenever a frame
 * gets 0 or 2 physics steps.) The blend means the picture lags physics by up
 * to one step (16.7 ms). Every engine with a fixed timestep makes this trade.
 *
 * One model is built per airframe type up front (four), and only the one
 * being flown is enabled, so switching aircraft is instant.
 */
export class PlayerAircraft {
  spec: AircraftClassSpec;
  performance: AircraftPerformance;
  state: AircraftState;
  private readonly previous: AircraftState;
  private readonly models: Readonly<Record<AirframeId, AircraftVisual>>;
  /** The base you chose to take off from (J), or null: the class's usual home. */
  private chosenBase: BaseDefinition | null = null;

  /** Interpolated pose for this frame, read by the cameras and shadows. */
  readonly renderPosition = new Vector3();
  readonly renderOrientation = new Quaternion();
  private readonly previousPosition = new Vector3();
  private readonly currentPosition = new Vector3();
  private readonly previousOrientation = new Quaternion();
  private readonly currentOrientation = new Quaternion();

  constructor(
    scene: Scene,
    private readonly ground: GroundQuery,
    readonly team: Team,
    classId: AircraftClassId,
  ) {
    const build = (id: AirframeId) => createAircraftModel(scene, AIRFRAMES[id], team, `player-${id}`);
    this.models = Object.fromEntries((Object.keys(AIRFRAMES) as AirframeId[]).map((id) => [id, build(id)])) as Record<AirframeId, AircraftVisual>;
    this.spec = AIRCRAFT_CLASSES[classId];
    this.performance = computePerformance(this.spec);
    this.state = createParkedState(this.spec, baseSpawnPoint(this.homeBase));
    this.previous = cloneAircraftState(this.state);
    this.applyClass(classId);
    this.resetTo(this.parkedAtHome());
  }

  /** Your paint for each type (O). */
  readonly paint = new PaintChoices();

  /** Repaints the aircraft being flown with the next scheme; returns its name. */
  cyclePaint(): string {
    const scheme = this.paint.next(this.spec.id);
    this.visual.setPaint(scheme.body);
    return scheme.name;
  }

  /** The model of the aircraft being flown. */
  get visual(): AircraftVisual {
    return this.models[this.spec.airframe.id];
  }

  /** Every model's shadow-casting meshes (all four types), for the shadow generator. */
  get allMeshes(): readonly Mesh[] {
    return Object.values(this.models).flatMap((model) => model.meshes);
  }

  /**
   * Where this aircraft starts, respawns and practises landings: the base you
   * chose to take off from (J), if this class can use it (a carrier needs a
   * hook), else the class's usual home: the team's island airfield, or its
   * carrier for carrier aircraft.
   */
  get homeBase(): BaseDefinition {
    const chosen = this.chosenBase;
    if (chosen && (chosen.kind !== 'carrier' || hasTailhook(this.spec))) return chosen;
    return teamBase(this.team, this.spec.homeBase);
  }

  /** The base you chose to take off from, or null for the class's usual one. */
  get startBase(): BaseDefinition | null {
    return this.chosenBase;
  }

  setStartBase(base: BaseDefinition | null): void {
    this.chosenBase = base;
  }

  /** Back at the home base, engine idle (on the catapult, for carrier aircraft), optionally as a different class. */
  respawnAtBase(classId: AircraftClassId = this.spec.id): void {
    this.applyClass(classId);
    this.resetTo(this.parkedAtHome());
  }

  /**
   * Level flight `height` metres above the home base at 1.8x stall speed, with
   * the engine at 70%. Skips the take-off when testing stalls and manoeuvres.
   */
  airStart(height: number): void {
    const spawn = baseSpawnPoint(this.homeBase);
    const p = spawn.position;
    const state = createAirborneState(this.spec, { x: p.x, y: p.y + height, z: p.z }, spawn.headingDegrees, this.performance.stallSpeed * 1.8, 0.7);
    this.resetTo(state);
  }

  /**
   * Landing practice: established on a 3-degree final approach to the home
   * base, lined up, landing flaps down, at the hands-off approach speed and
   * the throttle that holds the glide slope. For the island runway the slope
   * meets the runway at the PAPI lights; for a carrier it meets the deck
   * just past the first arrestor wire, beside the carrier's approach lights.
   */
  approachStart(): void {
    const base = this.homeBase;
    const practice = base.kind === 'carrier' ? LANDING_PRACTICE.carrier : LANDING_PRACTICE.airfield;
    const state = createApproachState(this.spec, base.runway, {
      distanceFromThreshold: practice.distanceFromThreshold,
      glideSlopeDeg: LANDING_PRACTICE.glideSlopeDeg,
      aimPointPastThreshold: practice.aimPointPastThreshold,
      speed: this.performance.handsOffApproachSpeed,
      throttle: this.performance.approachThrottle,
      flaps: 1,
    });
    this.resetTo(state);
  }

  step(controls: Readonly<FlightControls>, dt: number): void {
    copyAircraftState(this.previous, this.state);
    stepAircraft(this.state, controls, this.spec, this.ground, dt);
  }

  /**
   * Blends the last two physics states by `alpha` (0-1) and updates the visual.
   * @param controls current stick positions, which drive the control surfaces.
   */
  updateVisual(alpha: number, frameSeconds: number, controls?: Readonly<FlightControls>): void {
    const a = this.previous;
    const b = this.state;
    this.previousPosition.set(a.position.x, a.position.y, a.position.z);
    this.currentPosition.set(b.position.x, b.position.y, b.position.z);
    Vector3.LerpToRef(this.previousPosition, this.currentPosition, alpha, this.renderPosition);
    this.previousOrientation.set(a.orientation.x, a.orientation.y, a.orientation.z, a.orientation.w);
    this.currentOrientation.set(b.orientation.x, b.orientation.y, b.orientation.z, b.orientation.w);
    Quaternion.SlerpToRef(this.previousOrientation, this.currentOrientation, alpha, this.renderOrientation);

    const visual = this.visual;
    visual.setPose(this.renderPosition, this.renderOrientation);
    const flaps = a.flapPosition + (b.flapPosition - a.flapPosition) * alpha;
    visual.setFlapDeflection(flaps);
    visual.setAirbrake(a.airbrakePosition + (b.airbrakePosition - a.airbrakePosition) * alpha);
    visual.setGear(a.gearPosition + (b.gearPosition - a.gearPosition) * alpha);
    // The hook comes down with landing flaps (carrier aircraft, or anyone near a carrier), and stays down while it holds a wire.
    const nearCarrier = this.spec.homeBase === 'carrier' || CARRIERS.some((c) => Math.hypot(c.center.x - b.position.x, c.center.z - b.position.z) < HOOK_NEAR_CARRIER);
    visual.setTailhook(b.hookEngaged || (flaps >= HOOK_DOWN_FLAPS && nearCarrier) ? 1 : 0);
    if (controls && !b.crashed) visual.updateControlSurfaces(frameSeconds, controls.pitch, controls.roll, controls.yaw);
    visual.updatePropeller(frameSeconds, this.engineFraction(b));
  }

  /**
   * How fast the propellers should turn, 0-1: driven by the engine (the
   * throttle, already lagged by spool-up), or windmilling in the airflow
   * when gliding at idle. Stopped when parked with the engine at idle.
   */
  private engineFraction(state: AircraftState): number {
    if (state.crashed) return 0;
    const windmill = Math.min(0.6, (state.telemetry.airspeed / 100) * PROPELLER_VISUAL_CONFIG.windmillFractionAt100ms);
    return Math.max(state.throttle, windmill);
  }

  /**
   * Parked at the home base. On a carrier: on the catapult, with take-off
   * flaps already set, as for a real catapult launch. With them the aircraft
   * leaves the bow able to hold its height hands-off.
   */
  private parkedAtHome(): AircraftState {
    const base = this.homeBase;
    const onCatapult = base.kind === 'carrier';
    const state = createParkedState(this.spec, baseSpawnPoint(base), onCatapult);
    if (onCatapult) state.flapPosition = CATAPULT_FLAPS;
    return state;
  }

  private applyClass(classId: AircraftClassId): void {
    this.spec = AIRCRAFT_CLASSES[classId];
    this.performance = computePerformance(this.spec);
    for (const [id, model] of Object.entries(this.models)) model.setEnabled(id === this.spec.airframe.id);
    this.visual.setPaint(this.paint.schemeFor(classId).body);
    this.visual.setScale(this.spec.airframeScale);
    this.visual.setFlapStyle(FLAP_STYLE_BY_CLASS[classId]);
  }

  private resetTo(state: AircraftState): void {
    this.state = state;
    copyAircraftState(this.previous, state);
    this.visual.resetPropeller(this.engineFraction(state));
    this.updateVisual(1, 0);
  }
}

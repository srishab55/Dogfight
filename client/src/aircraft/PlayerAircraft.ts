import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  AIRCRAFT_CLASSES,
  HOME_RUNWAY,
  cloneAircraftState,
  computePerformance,
  copyAircraftState,
  createAirborneState,
  createApproachState,
  createParkedState,
  stepAircraft,
  type AircraftClassId,
  type AircraftClassSpec,
  type AircraftPerformance,
  type AircraftState,
  type FlightControls,
  type GroundQuery,
  type SpawnPoint,
} from '@dogfight/shared';
import { FLAP_STYLE_BY_CLASS, PROPELLER_VISUAL_CONFIG } from '../config/aircraftVisuals';
import { LANDING_PRACTICE } from '../config/landing';
import type { AircraftVisual } from './AircraftVisual';
import { createPrimitiveAircraft } from './primitiveAircraftModel';

/**
 * The locally flown aircraft: simulation state (from the shared flight model)
 * plus its visual.
 *
 * Physics runs in fixed steps, but frames are drawn in between. This keeps the
 * last two physics states and draws a blend of them, so motion is smooth at
 * any refresh rate. (Drawing only the latest state judders whenever a frame
 * gets 0 or 2 physics steps.) The blend means the picture lags physics by up
 * to one step (16.7 ms). Every engine with a fixed timestep makes this trade.
 */
export class PlayerAircraft {
  readonly visual: AircraftVisual;
  spec: AircraftClassSpec;
  performance: AircraftPerformance;
  state: AircraftState;
  private readonly previous: AircraftState;

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
    private readonly spawn: SpawnPoint,
    classId: AircraftClassId,
  ) {
    this.visual = createPrimitiveAircraft(scene, 'blue', 'player-aircraft');
    this.spec = AIRCRAFT_CLASSES[classId];
    this.performance = computePerformance(this.spec);
    this.state = createParkedState(this.spec, spawn);
    this.previous = cloneAircraftState(this.state);
    this.applyClass(classId);
  }

  /** Back on the runway, engine idle, optionally as a different class. */
  respawnOnRunway(classId: AircraftClassId = this.spec.id): void {
    this.applyClass(classId);
    this.resetTo(createParkedState(this.spec, this.spawn));
  }

  /**
   * Level flight `height` metres above the runway at 1.8x stall speed, with the
   * engine at 70%. Skips the take-off when testing stalls and manoeuvres.
   */
  airStart(height: number): void {
    const p = this.spawn.position;
    const state = createAirborneState(this.spec, { x: p.x, y: p.y + height, z: p.z }, this.spawn.headingDegrees, this.performance.stallSpeed * 1.8, 0.7);
    this.resetTo(state);
  }

  /**
   * Landing practice: established on a 3-degree final approach, 2.5 km out,
   * lined up with the runway, landing flaps down, at the hands-off approach
   * speed and the throttle that holds the glide slope. The glide slope meets
   * the runway at the PAPI lights.
   */
  approachStart(): void {
    const state = createApproachState(this.spec, HOME_RUNWAY, {
      distanceFromThreshold: LANDING_PRACTICE.distanceFromThreshold,
      glideSlopeDeg: LANDING_PRACTICE.glideSlopeDeg,
      aimPointPastThreshold: LANDING_PRACTICE.aimPointPastThreshold,
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

    this.visual.setPose(this.renderPosition, this.renderOrientation);
    this.visual.setFlapDeflection(a.flapPosition + (b.flapPosition - a.flapPosition) * alpha);
    if (controls && !b.crashed) this.visual.updateControlSurfaces(frameSeconds, controls.pitch, controls.roll, controls.yaw);
    this.visual.updatePropeller(frameSeconds, this.engineFraction(b));
  }

  /**
   * How fast the propeller should turn, 0-1: driven by the engine (the
   * throttle, already lagged by spool-up), or windmilling in the airflow
   * when gliding at idle. Stopped when parked with the engine at idle.
   */
  private engineFraction(state: AircraftState): number {
    if (state.crashed) return 0;
    const windmill = Math.min(0.6, (state.telemetry.airspeed / 100) * PROPELLER_VISUAL_CONFIG.windmillFractionAt100ms);
    return Math.max(state.throttle, windmill);
  }

  private applyClass(classId: AircraftClassId): void {
    this.spec = AIRCRAFT_CLASSES[classId];
    this.performance = computePerformance(this.spec);
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

import { Quaternion, type Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CONTROL_SURFACE_VISUAL_CONFIG, FLAP_STYLES, PROPELLER_VISUAL_CONFIG } from '../config/aircraftVisuals';
import { degreesToRadians, smoothingFactor } from '../math/orientation';
import type { GearLeg, HingedSurface } from './aircraftModel';

type FlapStyle = (typeof FLAP_STYLES)[keyof typeof FLAP_STYLES];

/** One propeller: the solid blades (spun) and the blur disc that replaces them at speed. */
export interface PropellerVisual {
  readonly blades: Mesh;
  readonly disc: Mesh;
}

const TWO_PI = Math.PI * 2;

/**
 * The renderable representation of one aircraft. It only *displays* a state;
 * it never decides where the aircraft is. The pose comes from the flight
 * model, and from Phase 5 from the server.
 */
export class AircraftVisual {
  private propellerAngle = 0;
  /** Current visual propeller speed (rev/s), lagging the engine for a visible spin-up. */
  private propellerRevs = 0;
  private hidden = false;
  private flapStyle: FlapStyle = FLAP_STYLES.slotted;
  /** Current (lagged) surface deflections, -1 to 1, following the stick. */
  private readonly deflection = { pitch: 0, roll: 0, yaw: 0 };

  constructor(
    /** Parent of every part. Its origin is the aircraft's centre of mass. */
    readonly root: TransformNode,
    private readonly propellers: readonly PropellerVisual[],
    private readonly surfaces: readonly HingedSurface[],
    /** Solid meshes that cast shadows. */
    readonly meshes: readonly Mesh[],
    /** Decals and other meshes that are drawn but don't cast shadows. */
    private readonly decals: readonly Mesh[],
    /** Arrestor hook pivot, if fitted: rotating it about X lowers the hook. */
    private readonly tailhook: TransformNode | null = null,
    /** Retractable landing gear legs. */
    private readonly gearLegs: readonly GearLeg[] = [],
  ) {
    root.rotationQuaternion ??= Quaternion.Identity();
  }

  /** Propeller speed as a fraction of full power's (0-1), lagged like the spin-up you see: drives the engine sound. */
  get propellerSpeed(): number {
    return this.propellerRevs / PROPELLER_VISUAL_CONFIG.maxRevsPerSecond;
  }

  setPose(position: Vector3, orientation: Quaternion): void {
    this.root.position.copyFrom(position);
    // Set in the constructor, so it is never null here.
    this.root.rotationQuaternion?.copyFrom(orientation);
  }

  /** Shows or hides this model entirely (one model per airframe type exists; only the flown one is enabled). */
  setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
  }

  /** Hide the airframe, e.g. in cockpit view, where it would block the forward view (there is no cockpit model yet). */
  setVisible(visible: boolean): void {
    this.hidden = !visible;
    for (const mesh of [...this.meshes, ...this.decals]) mesh.isVisible = visible;
    this.applyPropellerBlur();
  }

  /** Uniform scale, matching the aircraft class's `airframeScale` so the visuals match the physics. */
  setScale(scale: number): void {
    this.root.scaling.setAll(scale);
  }

  /** Slotted (fighters) or Fowler (bombers: they also slide aft). */
  setFlapStyle(style: keyof typeof FLAP_STYLES): void {
    this.flapStyle = FLAP_STYLES[style];
  }

  /** Flap deflection from 0 (up) to 1 (fully down), mirroring the flight model's flap position. */
  setFlapDeflection(fraction: number): void {
    const angle = -degreesToRadians(this.flapStyle.maxDeflectionDeg) * fraction;
    const slide = this.flapStyle.aftTravel * fraction;
    for (const surface of this.surfaces) {
      if (surface.kind !== 'flap') continue;
      this.rotate(surface, angle);
      surface.aftDirection.scaleToRef(slide, surface.pivot.position).addInPlace(surface.restPosition);
    }
  }

  /** Dive-brake opening from 0 to 1: the upper plates swing up and the lower ones down. */
  setAirbrake(fraction: number): void {
    const angle = degreesToRadians(CONTROL_SURFACE_VISUAL_CONFIG.diveBrakeMaxDeg) * fraction;
    for (const surface of this.surfaces) if (surface.kind === 'diveBrake') this.rotate(surface, surface.face * angle);
  }

  /** Arrestor hook from stowed (0) to lowered (1). */
  setTailhook(fraction: number): void {
    if (!this.tailhook) return;
    const { tailhookStowedDeg, tailhookLoweredDeg } = CONTROL_SURFACE_VISUAL_CONFIG;
    this.tailhook.rotation.x = -degreesToRadians(tailhookStowedDeg + (tailhookLoweredDeg - tailhookStowedDeg) * fraction);
  }

  /** Landing gear from retracted (0) to down (1), mirroring the flight model's gear position. */
  setGear(fraction: number): void {
    // Eased, so each leg swings out quickly and settles into place.
    const t = Math.max(0, Math.min(1, fraction));
    const folded = 1 - t * t * (3 - 2 * t);
    for (const leg of this.gearLegs) {
      if (leg.axis === 'x') leg.pivot.rotation.x = leg.foldAngle * folded;
      else leg.pivot.rotation.z = leg.foldAngle * folded;
    }
  }

  /**
   * Moves the ailerons, elevators and rudder to match the stick (-1 to 1 per
   * axis, pilot convention), through a short actuator lag:
   *  - roll right: right aileron trailing edge up, left one down;
   *  - pitch up: elevator trailing edges up;
   *  - yaw right: rudder trailing edge to the right.
   */
  updateControlSurfaces(deltaSeconds: number, pitch: number, roll: number, yaw: number): void {
    const config = CONTROL_SURFACE_VISUAL_CONFIG;
    const t = smoothingFactor(config.actuatorSharpness, deltaSeconds);
    const d = this.deflection;
    d.pitch += (pitch - d.pitch) * t;
    d.roll += (roll - d.roll) * t;
    d.yaw += (yaw - d.yaw) * t;
    for (const surface of this.surfaces) {
      if (surface.kind === 'aileron') this.rotate(surface, surface.side * d.roll * degreesToRadians(config.aileronMaxDeg));
      else if (surface.kind === 'elevator') this.rotate(surface, d.pitch * degreesToRadians(config.elevatorMaxDeg));
      // Positive rudder angle swings the trailing edge left, so yaw right is negative.
      else if (surface.kind === 'rudder') this.rotate(surface, -d.yaw * degreesToRadians(config.rudderMaxDeg));
    }
  }

  private rotate(surface: HingedSurface, angle: number): void {
    if (surface.pivot.rotationQuaternion) Quaternion.RotationAxisToRef(surface.axis, angle, surface.pivot.rotationQuaternion);
  }

  /**
   * Spins the propellers towards `engineFraction` (0 = stopped, 1 = full
   * power), with a lag so they visibly wind up from a standstill. Fast enough,
   * the blades fade into a translucent blur disc (see PROPELLER_VISUAL_CONFIG).
   */
  updatePropeller(deltaSeconds: number, engineFraction: number): void {
    const config = PROPELLER_VISUAL_CONFIG;
    const target = Math.max(0, Math.min(1, engineFraction)) * config.maxRevsPerSecond;
    this.propellerRevs += (target - this.propellerRevs) * smoothingFactor(1 / config.spinUpTime, deltaSeconds);
    if (this.propellerRevs < 0.02 && target === 0) this.propellerRevs = 0;

    // Negative: clockwise seen from the cockpit, like most real propellers.
    this.propellerAngle = (this.propellerAngle - this.propellerRevs * TWO_PI * deltaSeconds) % TWO_PI;
    for (const propeller of this.propellers) propeller.blades.rotation.z = this.propellerAngle;
    this.applyPropellerBlur();
  }

  /** Jump the propellers straight to a speed, e.g. on respawn: stopped on the runway, already turning on an air start. */
  resetPropeller(engineFraction: number): void {
    this.propellerRevs = Math.max(0, Math.min(1, engineFraction)) * PROPELLER_VISUAL_CONFIG.maxRevsPerSecond;
    this.applyPropellerBlur();
  }

  dispose(): void {
    // Disposes child meshes too. Materials are left alone: aircraft of the same
    // team will share them once there are several.
    this.root.dispose();
  }

  /** Cross-fades from solid blades to the blur disc as the propellers speed up. */
  private applyPropellerBlur(): void {
    const { blurStartRevsPerSecond, blurEndRevsPerSecond, discOpacity } = PROPELLER_VISUAL_CONFIG;
    const t = Math.max(0, Math.min(1, (this.propellerRevs - blurStartRevsPerSecond) / (blurEndRevsPerSecond - blurStartRevsPerSecond)));
    const blur = t * t * (3 - 2 * t); // smoothstep, so the fade has no visible start or end
    for (const { blades, disc } of this.propellers) {
      blades.visibility = 1 - blur;
      blades.isVisible = !this.hidden && blur < 0.98;
      disc.visibility = discOpacity * blur;
      disc.isVisible = !this.hidden && blur > 0.02;
    }
  }
}

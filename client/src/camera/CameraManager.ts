import type { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3, type Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { GroundQuery } from '@dogfight/shared';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { CHASE_CAMERA_CONFIG, COCKPIT_CAMERA_CONFIG, ORBIT_CAMERA_CONFIG } from '../config/camera';
import { CameraEffects, type CameraEffectInputs } from './CameraEffects';
import { RENDER_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';
import { ChaseCamera } from './ChaseCamera';
import { CockpitCamera } from './CockpitCamera';
import { MouseAimCamera } from './MouseAimCamera';

/** Camera modes, in the order the "change camera" key cycles through them. */
export const CAMERA_MODES = ['chase', 'cockpit', 'orbit'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

/**
 * Owns every camera and decides which one is active. The rest of the game asks
 * it to follow a target and never touches Babylon cameras directly.
 */
export class CameraManager {
  private readonly chase: ChaseCamera;
  /** Replaces the chase camera while mouse flight is active: looks along the aim. */
  private readonly mouseAim: MouseAimCamera;
  private readonly cockpit: CockpitCamera;
  /** Mouse-controlled camera for inspecting the aircraft: drag to orbit, scroll to zoom. */
  private readonly orbit: ArcRotateCamera;
  private currentMode: CameraMode = 'chase';
  private readonly effects = new CameraEffects();

  constructor(
    private readonly scene: Scene,
    private readonly ground: GroundQuery,
  ) {
    this.chase = new ChaseCamera(scene, ground);
    this.mouseAim = new MouseAimCamera(scene, ground);
    this.cockpit = new CockpitCamera(scene);

    const config = ORBIT_CAMERA_CONFIG;
    this.orbit = new ArcRotateCamera(
      'orbit-camera',
      degreesToRadians(config.initialAlphaDegrees),
      degreesToRadians(config.initialBetaDegrees),
      config.initialRadius,
      Vector3.Zero(),
      scene,
    );
    this.orbit.minZ = RENDER_CONFIG.cameraNearPlane;
    this.orbit.maxZ = RENDER_CONFIG.cameraFarPlane;
    this.orbit.lowerRadiusLimit = config.minRadius;
    this.orbit.upperRadiusLimit = config.maxRadius;
    this.orbit.wheelDeltaPercentage = config.wheelDeltaPercentage;
    // Mouse only: the orbit camera's default arrow-key rotation would fight the throttle.
    this.orbit.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

    scene.activeCamera = this.chase.camera;
  }

  get mode(): CameraMode {
    return this.currentMode;
  }

  cycleMode(): void {
    const next = CAMERA_MODES[(CAMERA_MODES.indexOf(this.currentMode) + 1) % CAMERA_MODES.length] ?? 'chase';
    this.setMode(next);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.currentMode) return;
    if (this.currentMode === 'orbit') this.orbit.detachControl();
    this.currentMode = mode;
    if (mode === 'orbit') this.orbit.attachControl(true);
    this.selectActiveCamera(null);
  }

  /** Match camera distances to the aircraft's size (its class's airframe scale). */
  setTargetScale(scale: number): void {
    this.chase.setTargetScale(scale);
    this.mouseAim.setTargetScale(scale);
    this.cockpit.setTargetScale(scale);
  }

  /** Jump the cameras to the target without smoothing (spawn, teleport). */
  snapToTarget(position: Vector3, orientation: Quaternion, aim: Vector3 | null = null): void {
    this.chase.snapTo(position, orientation);
    if (aim) this.mouseAim.snapTo(aim, position);
    this.cockpit.update(position, orientation);
    this.orbit.target.copyFrom(position);
    this.keepOrbitAboveGround(position);
  }

  /** Every camera, e.g. for attaching the post-processing pipeline to all of them. */
  allCameras(): Camera[] {
    return [this.chase.camera, this.mouseAim.camera, this.cockpit.camera, this.orbit];
  }

  /**
   * Call once per frame, after the target's pose is final and before rendering.
   * @param aim mouse-flight aim direction, or null when flying with the keyboard.
   * @param effects what drives speed FOV and shake this frame (omit for none).
   */
  update(deltaSeconds: number, position: Vector3, orientation: Quaternion, aim: Vector3 | null = null, effects?: CameraEffectInputs): void {
    // Every camera updates even while inactive, so switching is seamless.
    this.chase.update(deltaSeconds, position, orientation);
    if (aim) this.mouseAim.update(deltaSeconds, aim, position);
    this.selectActiveCamera(aim);
    this.cockpit.update(position, orientation);
    if (effects && this.currentMode !== 'orbit') {
      const camera = this.currentMode === 'cockpit' ? this.cockpit.camera : aim ? this.mouseAim.camera : this.chase.camera;
      const baseFov = this.currentMode === 'cockpit' ? COCKPIT_CAMERA_CONFIG.fieldOfViewDegrees : CHASE_CAMERA_CONFIG.fieldOfViewDegrees;
      this.effects.apply(camera, baseFov, deltaSeconds, effects);
    }
    // Mutating the target in place keeps the orbit's angles and zoom. Assigning
    // a new target instead would recompute them from the camera's old position.
    this.orbit.target.copyFrom(position);
    this.keepOrbitAboveGround(position);
  }

  private selectActiveCamera(aim: Vector3 | null): void {
    const camera =
      this.currentMode === 'orbit' ? this.orbit : this.currentMode === 'cockpit' ? this.cockpit.camera : aim ? this.mouseAim.camera : this.chase.camera;
    if (this.scene.activeCamera !== camera) this.scene.activeCamera = camera;
  }

  /**
   * The orbit camera sits radius * cos(beta) above its target, where beta is
   * the angle down from straight overhead. Staying above `minY` therefore means
   *   target.y + radius * cos(beta) >= minY  =>  beta <= acos((minY - target.y) / radius).
   * Babylon clamps beta to `upperBetaLimit` each frame. The limit is
   * recomputed because zoom (radius) and the target's height keep changing.
   */
  private keepOrbitAboveGround(target: Vector3): void {
    // Uses the ground under the target: good enough for the orbit radius (up to 150 m).
    const minY = this.ground.heightAt(target.x, target.z) + ORBIT_CAMERA_CONFIG.minHeightAboveGround;
    const cosine = Math.min(1, Math.max(-1, (minY - target.y) / this.orbit.radius));
    this.orbit.upperBetaLimit = Math.acos(cosine);
  }

  dispose(): void {
    this.orbit.detachControl();
    this.orbit.dispose();
    this.chase.camera.dispose();
    this.mouseAim.camera.dispose();
    this.cockpit.camera.dispose();
  }
}

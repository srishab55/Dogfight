import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { GroundQuery } from '@dogfight/shared';
import { CHASE_CAMERA_CONFIG } from '../config/camera';
import { RENDER_CONFIG } from '../config/graphics';
import { degreesToRadians, lookRotationToRef, smoothingFactor } from '../math/orientation';

/**
 * Third-person chase camera for aircraft.
 *
 * How it works: the camera keeps a *smoothed copy* of the aircraft's
 * orientation, which chases the real one with exponential smoothing. The camera
 * sits at a fixed offset behind the aircraft *in that smoothed frame*, and
 * looks at a point ahead of the nose.
 *
 * Consequences:
 *  - Distance is fixed regardless of speed. A camera that smooths *position*
 *    instead falls further behind the faster you fly.
 *  - In a turn the smoothed frame lags, so you see the aircraft bank and swing
 *    across the screen, which shows its rotation.
 *  - The camera rolls with the aircraft (smoothed), so loops and inverted
 *    flight frame correctly. Babylon's FollowCamera only follows heading and
 *    breaks when the aircraft goes past vertical.
 */
export class ChaseCamera {
  readonly camera: TargetCamera;

  private readonly smoothedOrientation = Quaternion.Identity();
  private readonly offset: Vector3;
  private readonly lookAtOffset: Vector3;
  // Scratch vectors so per-frame updates allocate nothing.
  private readonly worldOffset = new Vector3();
  private readonly lookAtPoint = new Vector3();
  private readonly viewDirection = new Vector3();
  private readonly cameraUp = new Vector3();

  constructor(
    scene: Scene,
    private readonly ground: GroundQuery,
  ) {
    const config = CHASE_CAMERA_CONFIG;
    this.offset = new Vector3();
    this.lookAtOffset = new Vector3();
    this.setTargetScale(1);

    // TargetCamera is the plain camera base class with no built-in mouse or
    // keyboard controls. All its motion comes from update().
    this.camera = new TargetCamera('chase-camera', Vector3.Zero(), scene);
    this.camera.fov = degreesToRadians(config.fieldOfViewDegrees);
    this.camera.minZ = RENDER_CONFIG.cameraNearPlane;
    this.camera.maxZ = RENDER_CONFIG.cameraFarPlane;
    // Drive the camera entirely by quaternion, including its up vector (roll).
    this.camera.rotationQuaternion = Quaternion.Identity();
    this.camera.updateUpVectorFromRotation = true;
  }

  /** Keeps the same framing for bigger or smaller aircraft (the class's airframe scale). */
  setTargetScale(scale: number): void {
    const { offset, lookAtOffset } = CHASE_CAMERA_CONFIG;
    this.offset.set(offset.x, offset.y, offset.z).scaleInPlace(scale);
    this.lookAtOffset.set(lookAtOffset.x, lookAtOffset.y, lookAtOffset.z).scaleInPlace(scale);
  }

  /** Jump straight to the ideal position with no smoothing, e.g. on spawn or teleport. */
  snapTo(targetPosition: Vector3, targetOrientation: Quaternion): void {
    this.smoothedOrientation.copyFrom(targetOrientation);
    this.place(targetPosition);
  }

  update(deltaSeconds: number, targetPosition: Vector3, targetOrientation: Quaternion): void {
    const t = smoothingFactor(CHASE_CAMERA_CONFIG.rotationSharpness, deltaSeconds);
    // Slerp moves along the shortest arc between two orientations.
    Quaternion.SlerpToRef(this.smoothedOrientation, targetOrientation, t, this.smoothedOrientation);
    this.place(targetPosition);
  }

  private place(targetPosition: Vector3): void {
    const q = this.smoothedOrientation;
    const position = this.camera.position;

    // Camera position = aircraft position + (smoothed orientation applied to the local offset).
    this.offset.rotateByQuaternionToRef(q, this.worldOffset);
    targetPosition.addToRef(this.worldOffset, position);

    // Never dip below the ground (terrain included), e.g. when flying inverted close to it.
    const minimumY = this.ground.heightAt(position.x, position.z) + CHASE_CAMERA_CONFIG.minHeightAboveGround;
    if (position.y < minimumY) position.y = minimumY;

    this.lookAtOffset.rotateByQuaternionToRef(q, this.worldOffset);
    targetPosition.addToRef(this.worldOffset, this.lookAtPoint);
    this.lookAtPoint.subtractToRef(position, this.viewDirection);

    // The camera's up is the aircraft's (smoothed) up, so it rolls with the aircraft.
    Vector3.UpReadOnly.rotateByQuaternionToRef(q, this.cameraUp);
    if (this.camera.rotationQuaternion) {
      lookRotationToRef(this.viewDirection, this.cameraUp, this.camera.rotationQuaternion);
    }
  }
}

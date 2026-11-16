import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { GroundQuery } from '@dogfight/shared';
import { CHASE_CAMERA_CONFIG } from '../config/camera';
import { MOUSE_FLIGHT_CONFIG } from '../config/controls';
import { RENDER_CONFIG } from '../config/graphics';
import { degreesToRadians, lookRotationToRef, smoothingFactor } from '../math/orientation';

/**
 * Camera for mouse flight: it looks where you AIM, not where the aircraft
 * points. Sitting behind the aircraft along the aim line with the horizon
 * kept level, it puts the aim point at screen centre. The aircraft swings
 * round in front of you until its nose catches up.
 */
export class MouseAimCamera {
  readonly camera: TargetCamera;
  private readonly direction = new Vector3(0, 0, 1);
  private readonly offset = new Vector3();
  private scale = 1;

  constructor(
    scene: Scene,
    private readonly ground: GroundQuery,
  ) {
    this.camera = new TargetCamera('mouse-aim-camera', Vector3.Zero(), scene);
    this.camera.fov = degreesToRadians(CHASE_CAMERA_CONFIG.fieldOfViewDegrees);
    this.camera.minZ = RENDER_CONFIG.cameraNearPlane;
    this.camera.maxZ = RENDER_CONFIG.cameraFarPlane;
    this.camera.rotationQuaternion = Quaternion.Identity();
    this.camera.updateUpVectorFromRotation = true;
  }

  setTargetScale(scale: number): void {
    this.scale = scale;
  }

  snapTo(aim: Vector3, target: Vector3): void {
    this.direction.copyFrom(aim);
    this.place(target);
  }

  update(deltaSeconds: number, aim: Vector3, target: Vector3): void {
    // A little smoothing hides mouse jitter; high sharpness keeps it feeling direct.
    Vector3.LerpToRef(this.direction, aim, smoothingFactor(MOUSE_FLIGHT_CONFIG.camera.sharpness, deltaSeconds), this.direction);
    this.direction.normalize();
    this.place(target);
  }

  private place(target: Vector3): void {
    const { distance, height } = MOUSE_FLIGHT_CONFIG.camera;
    const position = this.camera.position;
    this.direction.scaleToRef(distance * this.scale, this.offset);
    target.subtractToRef(this.offset, position);
    position.y += height * this.scale;
    position.y = Math.max(position.y, this.ground.heightAt(position.x, position.z) + CHASE_CAMERA_CONFIG.minHeightAboveGround);
    // Horizon stays level (world up); if aiming straight up or down, keep the last orientation.
    if (this.camera.rotationQuaternion) lookRotationToRef(this.direction, Vector3.UpReadOnly, this.camera.rotationQuaternion);
  }
}

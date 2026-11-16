import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { PRIMITIVE_AIRFRAME } from '@dogfight/shared';
import { COCKPIT_CAMERA_CONFIG } from '../config/camera';
import { RENDER_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';

/**
 * First-person view from the pilot's eye. Locked rigidly to the airframe with
 * no smoothing: it sees exactly what the aircraft does, which is the most
 * precise view for judging attitude and aim.
 *
 * There is no cockpit model yet (Phase 3), so the game hides the player's
 * airframe in this view and the HUD shows a boresight cross where the nose points.
 */
export class CockpitCamera {
  readonly camera: TargetCamera;
  private readonly eye = new Vector3();
  private readonly worldEye = new Vector3();

  constructor(scene: Scene) {
    this.camera = new TargetCamera('cockpit-camera', Vector3.Zero(), scene);
    this.camera.fov = degreesToRadians(COCKPIT_CAMERA_CONFIG.fieldOfViewDegrees);
    this.camera.minZ = RENDER_CONFIG.cameraNearPlane;
    this.camera.maxZ = RENDER_CONFIG.cameraFarPlane;
    this.camera.rotationQuaternion = Quaternion.Identity();
    this.camera.updateUpVectorFromRotation = true;
    this.setTargetScale(1);
  }

  setTargetScale(scale: number): void {
    const { x, y, z } = PRIMITIVE_AIRFRAME.cockpitEye;
    this.eye.set(x, y, z).scaleInPlace(scale);
  }

  update(position: Vector3, orientation: Quaternion): void {
    this.eye.rotateByQuaternionToRef(orientation, this.worldEye);
    position.addToRef(this.worldEye, this.camera.position);
    // Aircraft and camera both look along local +Z with +Y up, so the orientation copies across directly.
    this.camera.rotationQuaternion?.copyFrom(orientation);
  }
}

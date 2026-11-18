import type { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { CAMERA_EFFECTS_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';

/** What drives the effects this frame. */
export interface CameraEffectInputs {
  /** Airspeed (m/s). */
  readonly speed: number;
  /** Flow separation 0-1: the stall buffet. */
  readonly buffet: number;
  readonly firing: boolean;
  readonly loadFactor: number;
  /** Extra shake from being hit, decaying (m). */
  readonly impact?: number;
  /** The Camera shake setting, 0-1: scales every shake (the field of view still widens with speed). */
  readonly shakeScale?: number;
}

/**
 * Small camera effects that sell speed and violence:
 *  - the field of view widens with speed (things rush past at the edges);
 *  - shake from stall buffet, gunfire recoil and high g;
 *  - impact shake by "trauma" (game-skills/GameFeel): events add trauma
 *    (0-1), it decays steadily, and the shake goes with trauma squared, so
 *    small knocks barely move the view and big ones punch, and it always
 *    settles by itself.
 * Shake uses a sum of sine waves at unrelated frequencies: smooth, never
 * repeating noticeably, and free of random-number jitter. Applied after the
 * camera is positioned, and undone the next frame, so it never accumulates.
 */
export class CameraEffects {
  private time = 0;
  private trauma = 0;

  /** An impact: adds to the trauma (it doesn't reset it), up to 1. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  private readonly applied = { x: 0, y: 0, z: 0 };

  apply(camera: TargetCamera, baseFovDegrees: number, deltaSeconds: number, inputs: CameraEffectInputs): void {
    const config = CAMERA_EFFECTS_CONFIG;
    this.time += deltaSeconds;

    const extra = Math.min(config.fovMaxExtraDegrees, Math.max(0, ((inputs.speed - config.fovSpeedStart) / 100) * config.fovDegreesPer100));
    camera.fov = degreesToRadians(baseFovDegrees + extra);

    this.trauma = Math.max(0, this.trauma - config.traumaDecayPerSecond * deltaSeconds);
    const amplitude =
      (inputs.shakeScale ?? 1) *
      (config.stallShake * inputs.buffet +
        (inputs.firing ? config.firingShake : 0) +
        config.gShakePerG * Math.max(0, inputs.loadFactor - 4) +
        (inputs.impact ?? 0) +
        config.traumaShake * this.trauma * this.trauma);
    const w = 2 * Math.PI * config.shakeFrequency * this.time;
    this.applied.x = amplitude * (Math.sin(w) * 0.6 + Math.sin(w * 2.37 + 1.3) * 0.4);
    this.applied.y = amplitude * (Math.sin(w * 1.13 + 0.7) * 0.6 + Math.sin(w * 3.11 + 2.1) * 0.4);
    this.applied.z = amplitude * 0.3 * Math.sin(w * 0.79 + 0.4);
    camera.position.x += this.applied.x;
    camera.position.y += this.applied.y;
    camera.position.z += this.applied.z;
  }
}

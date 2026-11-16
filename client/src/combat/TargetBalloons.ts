import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { isTargetAlive, type PracticeTarget } from '@dogfight/shared';
import { BALLOON_CONFIG } from '../config/combatVisuals';

const HIT_GLOW = new Color3(0.6, 0.6, 0.6);
const NO_GLOW = Color3.Black();

/** Draws the practice balloons: red and white striped, flashing when hit, hidden while burst. */
export class TargetBalloons {
  private readonly balloons: Array<{ target: PracticeTarget; mesh: Mesh; material: PBRMaterial; flash: number }>;

  constructor(scene: Scene, targets: readonly PracticeTarget[]) {
    const texture = createStripeTexture(scene);
    this.balloons = targets.map((target) => {
      const mesh = CreateSphere(`balloon-${target.id}`, { diameter: target.radius * 2, segments: 16 }, scene);
      mesh.position.set(target.position.x, target.position.y, target.position.z);
      mesh.isPickable = false;
      const material = new PBRMaterial(`balloon-${target.id}-material`, scene);
      material.albedoTexture = texture;
      material.roughness = 0.6;
      material.metallic = 0;
      mesh.material = material;
      return { target, mesh, material, flash: 0 };
    });
  }

  /** Briefly lights up a balloon that just took a hit. */
  flash(targetId: number): void {
    const balloon = this.balloons.find((b) => b.target.id === targetId);
    if (balloon) balloon.flash = BALLOON_CONFIG.hitFlashSeconds;
  }

  update(deltaSeconds: number): void {
    for (const balloon of this.balloons) {
      balloon.mesh.isVisible = isTargetAlive(balloon.target);
      balloon.flash = Math.max(0, balloon.flash - deltaSeconds);
      balloon.material.emissiveColor.copyFrom(balloon.flash > 0 ? HIT_GLOW : NO_GLOW);
    }
  }
}

/** Vertical gores, alternating red and white, like a classic barrage or target balloon. */
function createStripeTexture(scene: Scene): DynamicTexture {
  const width = 256;
  const height = 64;
  const texture = new DynamicTexture('balloon-stripes', { width, height }, scene, true);
  const ctx = texture.getContext();
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? BALLOON_CONFIG.primaryColor : BALLOON_CONFIG.stripeColor;
    ctx.fillRect((i * width) / stripes, 0, width / stripes, height);
  }
  texture.update(false);
  return texture;
}

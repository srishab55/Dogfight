import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';

export interface PbrSurfaceOptions {
  /** sRGB hex colour, as shown in a colour picker. */
  color: string;
  /** 0 = mirror-smooth, 1 = fully matte. */
  roughness: number;
  /** 0 = dielectric (paint, rubber), 1 = bare metal. */
  metallic?: number;
}

/**
 * Creates a physically based (metallic/roughness) material from an sRGB colour.
 *
 * PBR lighting maths happens in linear colour space, so the sRGB hex value is
 * converted. Skipping this makes every colour look washed out.
 *
 * Note: metallic surfaces get their colour from reflected surroundings. Until
 * Phase 3 adds an environment map there is nothing to reflect, so keep metallic
 * low for now or surfaces render dark.
 */
export function createPbrSurface(scene: Scene, name: string, options: PbrSurfaceOptions): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = srgbHexToLinear(options.color);
  material.roughness = options.roughness;
  material.metallic = options.metallic ?? 0;
  return material;
}

export function srgbHexToLinear(hex: string): Color3 {
  return Color3.FromHexString(hex).toLinearSpace();
}

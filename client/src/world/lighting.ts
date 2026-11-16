import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { LIGHTING_CONFIG } from '../config/graphics';
import { srgbHexToLinear } from '../rendering/materials';

export interface SceneLights {
  readonly sun: DirectionalLight;
  readonly ambient: HemisphericLight;
}

/**
 * Two lights cover outdoor daylight cheaply:
 *  - a directional "sun" (parallel rays, casts the shadows);
 *  - a hemispheric fill that stands in for light scattered by the sky (from
 *    above) and bounced off the ground (from below), so shaded sides are never
 *    pitch black.
 */
export function createLighting(scene: Scene, directionToSun: Vector3): SceneLights {
  const sun = new DirectionalLight('sun', directionToSun.negate(), scene);
  sun.intensity = LIGHTING_CONFIG.sunIntensity;
  // Light colours multiply linear-space PBR maths, so convert from sRGB.
  sun.diffuse = srgbHexToLinear(LIGHTING_CONFIG.sunColor);
  sun.specular = sun.diffuse.clone();

  const ambient = new HemisphericLight('sky-fill', Vector3.Up(), scene);
  ambient.intensity = LIGHTING_CONFIG.ambientIntensity;
  ambient.diffuse = srgbHexToLinear(LIGHTING_CONFIG.ambientSkyColor);
  ambient.groundColor = srgbHexToLinear(LIGHTING_CONFIG.ambientGroundColor);
  // A hemispheric light has no real position, so specular highlights from it look wrong.
  ambient.specular = Color3.Black();

  return { sun, ambient };
}

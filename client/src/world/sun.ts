import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SUN_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';

/**
 * Unit vector pointing from the ground *towards* the sun. The sky shader uses
 * it to draw the sun disc; the sunlight shines along its negation. Both come
 * from this one function, so the visible sun and the shadows always agree.
 */
export function getDirectionToSun(): Vector3 {
  const elevation = degreesToRadians(SUN_CONFIG.elevationDegrees);
  const azimuth = degreesToRadians(SUN_CONFIG.azimuthDegrees);
  return new Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
}

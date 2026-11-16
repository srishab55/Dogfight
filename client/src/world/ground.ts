import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { RunwayDefinition } from '@dogfight/shared';
import { RUNWAY_VISUAL_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';
import { createRunwayTexture } from './proceduralTextures';

export function createRunway(scene: Scene, runway: RunwayDefinition): Mesh {
  const mesh = CreateGround(`runway-${runway.id}`, { width: runway.width, height: runway.length, subdivisions: 1 }, scene);
  mesh.position.set(runway.center.x, runway.center.y + RUNWAY_VISUAL_CONFIG.surfaceOffset, runway.center.z);
  mesh.rotation.y = degreesToRadians(runway.headingDegrees);
  mesh.isPickable = false;
  mesh.receiveShadows = true;

  const material = new PBRMaterial(`runway-${runway.id}-material`, scene);
  material.albedoTexture = createRunwayTexture(scene, runway.length, runway.width);
  material.roughness = 0.85;
  material.metallic = 0;
  // Polygon offset pulls the runway towards the camera in the depth test, so
  // it doesn't flicker against the ground 3 cm below it ("z-fighting").
  material.zOffset = -2;
  mesh.material = material;

  mesh.freezeWorldMatrix();
  return mesh;
}

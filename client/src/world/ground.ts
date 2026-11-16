import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { WORLD_CONFIG, type RunwayDefinition } from '@dogfight/shared';
import { GROUND_CONFIG, RUNWAY_VISUAL_CONFIG, TERRAIN_VISUAL_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';
import { createFarmlandTexture, createRunwayTexture } from './proceduralTextures';

/**
 * The flat far ground beyond the terrain, out to the haze. It sits a few
 * metres below the terrain's flat edges so the two surfaces never flicker
 * against each other where they overlap.
 */
export function createGround(scene: Scene): Mesh {
  // Two triangles is enough for a flat plane; fog and lighting are per pixel.
  const ground = CreateGround('ground', { width: GROUND_CONFIG.visualSize, height: GROUND_CONFIG.visualSize, subdivisions: 1 }, scene);
  ground.position.y = WORLD_CONFIG.groundHeight - TERRAIN_VISUAL_CONFIG.outerGroundDrop;
  ground.isPickable = false;
  ground.receiveShadows = true;

  const texture = createFarmlandTexture(scene);
  const repeats = GROUND_CONFIG.visualSize / GROUND_CONFIG.textureTileSize;
  texture.uScale = repeats;
  texture.vScale = repeats;

  const material = new PBRMaterial('ground-material', scene);
  material.albedoTexture = texture;
  material.roughness = 1;
  material.metallic = 0;
  ground.material = material;

  // The ground never moves, so skip recomputing its world matrix every frame.
  ground.freezeWorldMatrix();
  return ground;
}

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

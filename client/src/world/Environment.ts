import type { Scene } from '@babylonjs/core/scene';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { HOME_RUNWAY, type Terrain } from '@dogfight/shared';
import { createTerrainMesh } from './terrainMesh';
import { CLOUD_CONFIG, SHADOW_CONFIG } from '../config/graphics';
import { Clouds } from './Clouds';
import { createGround, createRunway } from './ground';
import { createLighting } from './lighting';
import { PapiLights } from './PapiLights';
import { applyAtmosphere, createSky } from './sky';
import { getDirectionToSun } from './sun';
import { SunShadows } from './SunShadows';

/**
 * Everything static in the world: sky, fog, lights, ground and airfields.
 * The rest of the game only talks to this class, so terrain and base
 * buildings (Phases 3 and 6) can be added without touching game code.
 */
export class Environment {
  private readonly shadows: SunShadows | null;
  private readonly papi: PapiLights;
  private readonly clouds: Clouds | null;

  constructor(scene: Scene, terrain: Terrain) {
    const directionToSun = getDirectionToSun();
    applyAtmosphere(scene);
    createSky(scene, directionToSun);
    const { sun } = createLighting(scene, directionToSun);
    createGround(scene);
    createTerrainMesh(scene, terrain);
    createRunway(scene, HOME_RUNWAY);
    this.papi = new PapiLights(scene, HOME_RUNWAY);
    this.clouds = CLOUD_CONFIG.enabled ? new Clouds(scene) : null;
    this.shadows = SHADOW_CONFIG.enabled ? new SunShadows(sun) : null;
  }

  addShadowCasters(meshes: readonly AbstractMesh[]): void {
    this.shadows?.addCasters(meshes);
  }

  /**
   * Per-frame update.
   * @param focus the player's aircraft; shadows centre on it.
   * @param approachObserver the point the glide slope is defined for (the aircraft's wheels); the PAPI lights read its height.
   * @param cameraPosition where the active camera is; clouds fade puffs close to it.
   */
  update(focus: Vector3, approachObserver: Vector3, cameraPosition: Vector3): void {
    this.shadows?.update(focus);
    this.papi.update(approachObserver);
    this.clouds?.update(cameraPosition);
  }

  dispose(): void {
    // Meshes, lights and materials are disposed with the scene.
    this.shadows?.dispose();
    this.clouds?.dispose();
  }
}

import type { Scene } from '@babylonjs/core/scene';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CARRIERS, RUNWAYS, carrierDeckRunway, type Terrain } from '@dogfight/shared';
import { CLOUD_CONFIG, SHADOW_CONFIG } from '../config/graphics';
import { LANDING_PRACTICE, PAPI_CONFIG } from '../config/landing';
import { createCarrierModel } from './CarrierModel';
import { Clouds } from './Clouds';
import { createRunway } from './ground';
import { createLighting } from './lighting';
import { Ocean } from './Ocean';
import { PapiLights } from './PapiLights';
import { applyAtmosphere, createSky } from './sky';
import { getDirectionToSun } from './sun';
import { SunShadows } from './SunShadows';
import { createTerrainMesh } from './terrainMesh';

/**
 * Everything static in the world: sky, fog, lights, the sea, the islands and
 * their airfields, and the carriers. The rest of the game only talks to this
 * class, so base buildings (Phase 6) can be added without touching game code.
 */
export class Environment {
  private readonly shadows: SunShadows | null;
  private readonly approachLights: PapiLights[] = [];
  private readonly clouds: Clouds | null;
  private readonly ocean: Ocean;

  constructor(scene: Scene, terrain: Terrain) {
    const directionToSun = getDirectionToSun();
    applyAtmosphere(scene);
    createSky(scene, directionToSun);
    const { sun } = createLighting(scene, directionToSun);
    this.ocean = new Ocean(scene, terrain, directionToSun);
    createTerrainMesh(scene, terrain);
    for (const runway of RUNWAYS) {
      createRunway(scene, runway);
      this.approachLights.push(new PapiLights(scene, runway, LANDING_PRACTICE.airfield.aimPointPastThreshold));
    }
    const carrierMeshes: AbstractMesh[] = [];
    for (const carrier of CARRIERS) {
      carrierMeshes.push(...createCarrierModel(scene, carrier).getChildMeshes());
      // Approach lights beside the deck, where the carrier glide slope meets it.
      this.approachLights.push(
        new PapiLights(scene, carrierDeckRunway(carrier), LANDING_PRACTICE.carrier.aimPointPastThreshold, { edgeOffset: PAPI_CONFIG.carrierEdgeOffset, spacing: PAPI_CONFIG.carrierSpacing }),
      );
    }
    this.clouds = CLOUD_CONFIG.enabled ? new Clouds(scene) : null;
    this.shadows = SHADOW_CONFIG.enabled ? new SunShadows(sun) : null;
    this.shadows?.addCasters(carrierMeshes);
  }

  addShadowCasters(meshes: readonly AbstractMesh[]): void {
    this.shadows?.addCasters(meshes);
  }

  /**
   * Per-frame update.
   * @param focus the player's aircraft; shadows centre on it.
   * @param approachObserver the point the glide slope is defined for (the aircraft's wheels); the approach lights read its height.
   * @param cameraPosition where the active camera is; the sea follows it and clouds fade puffs close to it.
   */
  update(deltaSeconds: number, focus: Vector3, approachObserver: Vector3, cameraPosition: Vector3): void {
    this.shadows?.update(focus);
    for (const lights of this.approachLights) lights.update(approachObserver);
    this.clouds?.update(cameraPosition);
    this.ocean.update(deltaSeconds, cameraPosition);
  }

  dispose(): void {
    // Meshes, lights and materials are disposed with the scene.
    this.shadows?.dispose();
    this.clouds?.dispose();
  }
}

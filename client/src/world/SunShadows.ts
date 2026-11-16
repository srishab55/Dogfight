import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { SHADOW_CONFIG } from '../config/graphics';

/**
 * Sun shadows that follow a focus point (the player's aircraft).
 *
 * A single shadow map covering the whole 12 km map would give each texel
 * several metres: a blurry blob. Instead only aircraft cast shadows, and
 * Babylon fits the map's width and height around the casters every frame (the
 * light's default `autoUpdateExtends`), giving centimetre-level detail.
 *
 * The depth range is set manually. Auto-fitting it to the casters as well would
 * exclude the ground behind them, so the ground would never receive the shadow.
 * Each frame we park the light `lightDistance` metres "up-sun" of the aircraft,
 * so the ground receives the shadow while it is within `depthRange` of that point.
 */
export class SunShadows {
  private readonly generator: ShadowGenerator;
  private readonly offset = new Vector3();

  constructor(private readonly sun: DirectionalLight) {
    this.generator = new ShadowGenerator(SHADOW_CONFIG.mapSize, sun);
    // Percentage-closer filtering softens the edges. It needs WebGL2;
    // Babylon falls back automatically if unavailable.
    this.generator.usePercentageCloserFiltering = true;
    this.generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.generator.bias = SHADOW_CONFIG.bias;
    this.generator.normalBias = SHADOW_CONFIG.normalBias;

    sun.shadowMinZ = 1;
    sun.shadowMaxZ = SHADOW_CONFIG.depthRange;
  }

  addCasters(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) this.generator.addShadowCaster(mesh, false);
  }

  /** Call once per frame, before rendering, with the point shadows should be centred on. */
  update(focus: Vector3): void {
    this.sun.direction.scaleToRef(-SHADOW_CONFIG.lightDistance, this.offset);
    focus.addToRef(this.offset, this.sun.position);
  }

  dispose(): void {
    this.generator.dispose();
  }
}

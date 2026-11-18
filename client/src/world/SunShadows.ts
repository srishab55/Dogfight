import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { SHADOW_CONFIG } from '../config/graphics';

/**
 * Sun shadows that follow a focus point (the player's aircraft).
 *
 * A single shadow map covering the whole 12 km map would give each texel
 * several metres: a blurry blob. Instead the map covers a fixed square
 * (`frustumSize`) around the aircraft, so its shadow, and those of the
 * buildings and guns near it, are sharp. (Fitting the map to the casters
 * would stretch it over every building on the map.)
 *
 * The depth range is set manually. Auto-fitting it to the casters as well would
 * exclude the ground behind them, so the ground would never receive the shadow.
 * Each frame we park the light `lightDistance` metres "up-sun" of the aircraft,
 * so the ground receives the shadow while it is within `depthRange` of that point.
 */
export class SunShadows {
  private readonly generator: ShadowGenerator;
  private readonly offset = new Vector3();
  /** Everything that casts a shadow (the map draws only those near the focus; none while shadows are off). */
  private readonly casters: AbstractMesh[] = [];
  private off = false;
  /** Seconds until the casters near the focus are picked again. */
  private untilCull = 0;

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
    sun.shadowFrustumSize = SHADOW_CONFIG.frustumSize;
  }

  /**
   * The Graphics setting: off, or a 1024 (medium) or 2048 (high) shadow map.
   *
   * Off doesn't switch the light's shadows off: that recompiles every
   * material, and the frames drawn with the old shaders meanwhile trip WebGL
   * errors. Instead nothing is drawn into the map: it is rendered once,
   * empty (everything lit), and then never again. That saves the real cost,
   * drawing the casters every frame.
   */
  setQuality(quality: 'off' | 'medium' | 'high'): void {
    const map = this.generator.getShadowMap();
    if (!map) return;
    this.off = quality === 'off';
    if (this.off) {
      map.renderList = [];
      map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    } else {
      map.renderList = [];
      this.untilCull = 0; // picked on the next update
      map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
      const size = quality === 'high' ? 2_048 : SHADOW_CONFIG.mapSize;
      if (map.getSize().width !== size) map.resize(size);
    }
    map.resetRefreshCounter();
  }

  addCasters(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) this.casters.push(mesh);
    this.untilCull = 0;
  }

  /**
   * Call once per frame, before rendering, with the point shadows should be
   * centred on (`deltaSeconds` paces the caster culling).
   *
   * The map covers only a square `frustumSize` across around the focus, so
   * drawing every caster on the map into it was wasted work: measured, the
   * shadow pass was about 160 of 230 draw calls and most of the frame's
   * garbage (Babylon prepares each caster's shader every frame). A few times
   * a second the map's list is rebuilt from the casters whose bounds come
   * within `cullRadius` of the focus; the margin covers how far anything can
   * move before the next rebuild.
   */
  update(focus: Vector3, deltaSeconds = 0): void {
    this.sun.direction.scaleToRef(-SHADOW_CONFIG.lightDistance, this.offset);
    focus.addToRef(this.offset, this.sun.position);
    if (this.off) return;
    this.untilCull -= deltaSeconds;
    if (this.untilCull > 0) return;
    this.untilCull = SHADOW_CONFIG.cullInterval;
    const map = this.generator.getShadowMap();
    if (!map) return;
    const list = map.renderList ?? [];
    list.length = 0;
    const reach = SHADOW_CONFIG.cullRadius;
    for (const mesh of this.casters) {
      if (mesh.isDisposed()) continue;
      const sphere = mesh.getBoundingInfo().boundingSphere;
      const c = sphere.centerWorld;
      const dx = c.x - focus.x;
      const dz = c.z - focus.z;
      const r = reach + sphere.radiusWorld;
      if (dx * dx + dz * dz < r * r) list.push(mesh);
    }
    map.renderList = list;
  }

  /** How many casters the map draws now (for the debug overlay). */
  get activeCasters(): number {
    return this.generator.getShadowMap()?.renderList?.length ?? 0;
  }

  dispose(): void {
    this.generator.dispose();
  }
}

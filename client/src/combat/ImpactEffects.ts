import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { IMPACT_EFFECT_CONFIG } from '../config/combatVisuals';

export type ImpactKind = 'dust' | 'spark' | 'burst' | 'shreds';

interface Effect {
  x: number;
  y: number;
  z: number;
  age: number;
  readonly kind: ImpactKind;
}

/**
 * Short-lived puffs and flashes (dust kicked up by rounds, hit sparks,
 * balloon bursts). Pooled and drawn with thin instances: one draw call per
 * kind, however many are alive. Each puff swells quickly and then shrinks
 * away, which reads as a puff without needing transparency.
 */
export class ImpactEffects {
  private readonly effects: Effect[] = [];
  private readonly layers: Record<ImpactKind, { mesh: Mesh; matrices: Float32Array }>;

  constructor(scene: Scene) {
    const capacity = IMPACT_EFFECT_CONFIG.capacity;
    const layer = (kind: ImpactKind, glowing: boolean) => {
      const mesh = CreateSphere(`effect-${kind}`, { diameter: 1, segments: 8 }, scene);
      const material = new StandardMaterial(`effect-${kind}-material`, scene);
      const color = Color3.FromHexString(IMPACT_EFFECT_CONFIG[kind].color);
      if (glowing) {
        material.disableLighting = true;
        material.emissiveColor = color;
      } else {
        material.diffuseColor = color;
        material.specularColor = Color3.Black();
      }
      mesh.material = material;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      const matrices = new Float32Array(capacity * 16);
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
      mesh.thinInstanceCount = 0;
      return { mesh, matrices };
    };
    this.layers = { dust: layer('dust', false), spark: layer('spark', true), burst: layer('burst', true), shreds: layer('shreds', false) };
  }

  spawn(kind: ImpactKind, x: number, y: number, z: number): void {
    // Recycle the oldest effect when full.
    if (this.effects.length >= IMPACT_EFFECT_CONFIG.capacity) this.effects.shift();
    this.effects.push({ x, y, z, age: 0, kind });
  }

  update(deltaSeconds: number): void {
    const counts: Record<ImpactKind, number> = { dust: 0, spark: 0, burst: 0, shreds: 0 };
    let write = 0;
    for (const effect of this.effects) {
      effect.age += deltaSeconds;
      const config = IMPACT_EFFECT_CONFIG[effect.kind];
      const t = effect.age / config.duration;
      if (t >= 1) continue;
      this.effects[write++] = effect;
      // Swell fast, shrink slowly: sqrt(t) ramps up, (1 - t) takes it away.
      const size = config.size * Math.sqrt(t) * (1 - t) * 2.6;
      const { matrices } = this.layers[effect.kind];
      const o = counts[effect.kind]++ * 16;
      matrices.fill(0, o, o + 16);
      matrices[o] = size;
      matrices[o + 5] = size;
      matrices[o + 10] = size;
      matrices[o + 12] = effect.x;
      matrices[o + 13] = effect.y + config.rise * effect.age;
      matrices[o + 14] = effect.z;
      matrices[o + 15] = 1;
    }
    this.effects.length = write;
    for (const kind of Object.keys(this.layers) as ImpactKind[]) {
      const layer = this.layers[kind];
      layer.mesh.thinInstanceCount = counts[kind];
      layer.mesh.thinInstanceBufferUpdated('matrix');
    }
  }

  dispose(): void {
    for (const layer of Object.values(this.layers)) layer.mesh.dispose();
  }
}

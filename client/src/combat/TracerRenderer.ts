import type { Scene } from '@babylonjs/core/scene';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { ProjectilePool } from '@dogfight/shared';
import { TRACER_CONFIG } from '../config/combatVisuals';

/**
 * Draws every round in flight as a glowing streak, all in ONE draw call using
 * thin instances: one box mesh, plus a buffer of per-instance transform
 * matrices refilled each frame. 200 separate meshes would cost 200 draw calls.
 */
export class TracerRenderer {
  private readonly mesh: Mesh;
  private readonly matrices: Float32Array;

  constructor(
    scene: Scene,
    private readonly pool: ProjectilePool,
  ) {
    this.mesh = CreateBox('tracers', { size: 1 }, scene);
    const material = new StandardMaterial('tracer-material', scene);
    // Unlit and self-coloured: tracers burn, so lighting shouldn't darken them.
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(TRACER_CONFIG.color);
    this.mesh.material = material;
    this.mesh.isPickable = false;
    // Bright at range: don't fade tracers into the haze.
    this.mesh.applyFog = false;
    // Instances are everywhere, so skip frustum culling of the shared mesh.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.matrices = new Float32Array(pool.capacity * 16);
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceCount = 0;
  }

  /** Rebuilds the instance matrices from the rounds currently in flight. */
  update(cameraPosition: Vector3): void {
    const p = this.pool;
    const m = this.matrices;
    let count = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (!p.active[i]) continue;
      const x = p.px[i] ?? 0;
      const y = p.py[i] ?? 0;
      const z = p.pz[i] ?? 0;
      const vx = p.vx[i] ?? 0;
      const vy = p.vy[i] ?? 0;
      const vz = p.vz[i] ?? 0;
      const speed = Math.hypot(vx, vy, vz) || 1;
      // Forward axis along the flight direction.
      const fx = vx / speed;
      const fy = vy / speed;
      const fz = vz / speed;
      // Right = up x forward (left-handed); fall back to world X if flying straight up or down.
      let rx = fz;
      let rz = -fx;
      let rLength = Math.hypot(rx, rz);
      if (rLength < 1e-6) {
        rx = 1;
        rz = 0;
        rLength = 1;
      }
      rx /= rLength;
      rz /= rLength;
      // Up = forward x right, with right = (rx, 0, rz).
      const ux = fy * rz;
      const uy = fz * rx - fx * rz;
      const uz = -fy * rx;

      const distance = Math.hypot(x - cameraPosition.x, y - cameraPosition.y, z - cameraPosition.z);
      const width = Math.max(TRACER_CONFIG.minWidth, distance * TRACER_CONFIG.widthPerMetre);
      const length = Math.min(TRACER_CONFIG.maxLength, TRACER_CONFIG.minLength + distance * TRACER_CONFIG.lengthPerMetre);

      // Babylon matrices are row-major with row vectors: rows 0-2 are the
      // scaled local X/Y/Z axes, row 3 is the translation. The streak trails
      // behind the round, so its centre sits half a length back.
      const o = count * 16;
      m[o] = rx * width;
      m[o + 1] = 0;
      m[o + 2] = rz * width;
      m[o + 3] = 0;
      m[o + 4] = ux * width;
      m[o + 5] = uy * width;
      m[o + 6] = uz * width;
      m[o + 7] = 0;
      m[o + 8] = fx * length;
      m[o + 9] = fy * length;
      m[o + 10] = fz * length;
      m[o + 11] = 0;
      m[o + 12] = x - (fx * length) / 2;
      m[o + 13] = y - (fy * length) / 2;
      m[o + 14] = z - (fz * length) / 2;
      m[o + 15] = 1;
      count++;
    }
    this.mesh.thinInstanceCount = count;
    this.mesh.thinInstanceBufferUpdated('matrix');
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

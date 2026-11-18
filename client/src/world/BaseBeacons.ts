import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { BASES, type BaseDefinition } from '@dogfight/shared';
import type { BaseView } from '../combat/baseViews';
import { BASE_COLORS, BEACON_CONFIG } from '../config/map';
import beaconVertexShader from './shaders/beacon.vertex.glsl?raw';
import beaconFragmentShader from './shaders/beacon.fragment.glsl?raw';

interface Beacon {
  readonly baseId: string;
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
}

const COLORS = {
  blue: Color3.FromHexString(BASE_COLORS.blue),
  red: Color3.FromHexString(BASE_COLORS.red),
  open: Color3.FromHexString(BASE_COLORS.open),
  neutral: Color3.FromHexString(BASE_COLORS.neutral),
} as const;

/**
 * A column of light rising from every base in its owner's colour (see
 * BEACON_CONFIG): find a base from anywhere on the map. It changes colour
 * when the base is captured, blinks amber while an enemy base is
 * defenceless, and goes out when a carrier sinks.
 */
export class BaseBeacons {
  private readonly beacons: Beacon[];

  constructor(scene: Scene, bases: readonly BaseDefinition[] = BASES) {
    this.beacons = bases.map((base) => {
      const mesh = CreateCylinder(`beacon-${base.id}`, { height: 1, diameter: 2, tessellation: 20, cap: Mesh.NO_CAP }, scene);
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      const material = new ShaderMaterial(
        `beacon-${base.id}`,
        scene,
        { vertexSource: beaconVertexShader, fragmentSource: beaconFragmentShader },
        { attributes: ['position', 'normal'], uniforms: ['world', 'viewProjection', 'cameraPosition', 'color', 'intensity'], needAlphaBlending: true },
      );
      // Blended over what's behind it (added light washes out to white against a hazy sky); nothing written to depth.
      material.alphaMode = Constants.ALPHA_COMBINE;
      material.disableDepthWrite = true;
      mesh.material = material;
      return { baseId: base.id, mesh, material };
    });
  }

  /** The Gameplay setting: show the beacons (with the base labels) or not. */
  visible = true;

  update(views: readonly BaseView[], cameraPosition: Vector3, time: number): void {
    const c = BEACON_CONFIG;
    for (const beacon of this.beacons) {
      const view = views.find((v) => v.base.id === beacon.baseId);
      if (!view || view.state === 'gone' || !this.visible) {
        beacon.mesh.setEnabled(false);
        continue;
      }
      const distance = Math.hypot(view.x - cameraPosition.x, view.z - cameraPosition.z);
      // Close in, the base itself is in view: the column all but fades away.
      const near = Math.min(1, Math.max(0, (distance - c.nearFadeTo) / (c.nearFadeFrom - c.nearFadeTo)));
      let intensity = c.intensity * (c.nearIntensity + (1 - c.nearIntensity) * near);
      const open = view.state === 'open';
      if (open) intensity *= 0.55 + 0.45 * Math.cos(time * Math.PI * 2 * c.openBlinkHz);
      beacon.mesh.setEnabled(intensity > 0.01);
      // Never thinner than a few pixels, however far away.
      const radius = Math.max(c.radius, distance * c.radiusPerDistance);
      beacon.mesh.scaling.set(radius, c.height, radius);
      beacon.mesh.position.set(view.x, view.y + c.height / 2, view.z);
      beacon.material.setVector3('cameraPosition', cameraPosition);
      beacon.material.setColor3('color', open ? COLORS.open : COLORS[view.owner ?? 'neutral']);
      beacon.material.setFloat('intensity', intensity);
    }
  }

  dispose(): void {
    for (const beacon of this.beacons) {
      beacon.material.dispose();
      beacon.mesh.dispose();
    }
  }
}

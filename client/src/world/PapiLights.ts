import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { RunwayDefinition } from '@dogfight/shared';
import { PAPI_CONFIG } from '../config/landing';
import { degreesToRadians } from '../math/orientation';

/**
 * PAPI glide-slope lights: a row of four lights on the left of the runway at
 * the aim point. A real PAPI uses optics so each light looks red from below
 * its angle and white from above. Here we compute the observer's elevation
 * angle each frame and colour each light to match.
 *
 *   ○ ○ ○ ○  all white: too high     ● ● ○ ○  two red, two white: on the slope
 *   ● ● ● ○  slightly low            ● ● ● ●  all red: too low
 */
export class PapiLights {
  private readonly lights: Array<{ mesh: Mesh; angle: number; position: Vector3 }> = [];
  private readonly aimPoint: Vector3;
  /** Unit vector from the aim point back along the approach (towards arriving aircraft). */
  private readonly approachDirection: Vector3;
  private visible = true;
  /** Switched off entirely (e.g. on a sinking carrier). */
  private disabled = false;
  private readonly white: StandardMaterial;
  private readonly red: StandardMaterial;

  /**
   * @param aimPointPastThreshold where the glide slope meets the runway (m past the threshold): the lights stand there.
   * @param layout light spacing: an island runway's, or tighter on a carrier's narrow deck edge.
   */
  constructor(scene: Scene, runway: RunwayDefinition, aimPointPastThreshold: number, layout: { edgeOffset: number; spacing: number } = PAPI_CONFIG) {
    this.white = createLightMaterial(scene, 'papi-white', PAPI_CONFIG.whiteColor);
    this.red = createLightMaterial(scene, 'papi-red', PAPI_CONFIG.redColor);

    const heading = degreesToRadians(runway.headingDegrees);
    const forward = new Vector3(Math.sin(heading), 0, Math.cos(heading));
    const left = new Vector3(-Math.cos(heading), 0, Math.sin(heading));
    const threshold = new Vector3(runway.center.x, runway.center.y, runway.center.z).addInPlace(forward.scale(-runway.length / 2));
    const aimPoint = threshold.add(forward.scale(aimPointPastThreshold));
    this.aimPoint = aimPoint;
    this.approachDirection = forward.scale(-1);

    PAPI_CONFIG.lightAnglesDeg.forEach((angleDeg, index) => {
      const sideOffset = runway.width / 2 + layout.edgeOffset + index * layout.spacing;
      const position = aimPoint.add(left.scale(sideOffset));
      position.y += PAPI_CONFIG.size / 2;
      const mesh = CreateBox(`papi-${runway.id}-${index}`, { size: PAPI_CONFIG.size }, scene);
      mesh.position.copyFrom(position);
      mesh.rotation.y = heading;
      mesh.isPickable = false;
      // Lights should punch through the haze at a few km, like real approach lights.
      mesh.applyFog = false;
      mesh.material = this.white;
      this.lights.push({ mesh, angle: degreesToRadians(angleDeg), position });
    });
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
  }

  /** Colours the lights for an observer (the pilot) and keeps them visible at range, inside the approach sector only. */
  update(observer: Vector3): void {
    const dx = observer.x - this.aimPoint.x;
    const dz = observer.z - this.aimPoint.z;
    const range = Math.hypot(dx, dz);
    const along = dx * this.approachDirection.x + dz * this.approachDirection.z;
    const inSector = !this.disabled && range < PAPI_CONFIG.maxRange && along > 0 && Math.abs(Math.atan2(dx * this.approachDirection.z - dz * this.approachDirection.x, along)) < degreesToRadians(PAPI_CONFIG.sectorHalfAngleDeg);
    if (inSector !== this.visible) {
      this.visible = inSector;
      for (const light of this.lights) light.mesh.setEnabled(inSector);
    }
    if (!inSector) return;
    for (const light of this.lights) {
      const dx = observer.x - light.position.x;
      const dz = observer.z - light.position.z;
      const distance = Math.hypot(dx, dz);
      const elevation = Math.atan2(observer.y - light.position.y, Math.max(distance, 1));
      light.mesh.material = elevation >= light.angle ? this.white : this.red;
      // Grow with distance so a 1.6 m light doesn't shrink below a few pixels on final approach.
      const scale = Math.max(1, (PAPI_CONFIG.minSizePerKilometre * distance) / 1000 / PAPI_CONFIG.size);
      light.mesh.scaling.setAll(scale);
    }
  }
}

function createLightMaterial(scene: Scene, name: string, hex: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  // Unlit and self-coloured: a light source, not a lit surface.
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString(hex);
  return material;
}

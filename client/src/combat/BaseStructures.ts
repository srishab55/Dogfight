import { BASE_COLORS } from '../config/map';
import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { BASES, BASE_STRUCTURE_CONFIG, isTargetAlive, type BaseDefinition, type CombatTarget, type CombatWorld, type Team } from '@dogfight/shared';
import { TEAM_PAINT } from '../config/aircraftVisuals';
import { BURN_CONFIG, DEFENCE_VISUAL_CONFIG } from '../config/combatVisuals';
import { degreesToRadians } from '../math/orientation';
import { createPbrSurface } from '../rendering/materials';
import type { FireAndSmoke } from '../effects/FireAndSmoke';

type StructureKind = 'hangar' | 'fuelDepot' | 'radar';

/** Where each airfield's team flag stands, in its runway's frame (m): beside the runway, near the middle. */
const BASE_FLAG_SPOT = { along: 60, across: -105 };

/**
 * A base's buildings (hangar, fuel depot, radar station), their wrecks and
 * fires, and each airfield's team flag, which changes colour when the base
 * is captured. Only *shows* the combat world's state.
 */
export class BaseStructures {
  private readonly structures: Array<{ target: CombatTarget; alive: TransformNode; wreck: TransformNode; dish: Mesh | null }> = [];
  private readonly flags: Array<{ base: BaseDefinition; cloth: Mesh; owner: Team | null | undefined }> = [];
  /** Team flags, and a white one for a field nobody holds. */
  private readonly flagMaterials: Readonly<Record<Team | 'neutral', Material>>;
  private readonly emitCarry = new Map<number, number>();
  private time = 0;

  constructor(
    scene: Scene,
    private readonly combat: CombatWorld,
    private readonly effects: FireAndSmoke,
  ) {
    const m = {
      concrete: createPbrSurface(scene, 'base-concrete', { color: '#8a877c', roughness: 0.95 }),
      metal: createPbrSurface(scene, 'base-metal', { color: '#6c7268', roughness: 0.6 }),
      tank: createPbrSurface(scene, 'base-tank', { color: '#b4b1a2', roughness: 0.5 }),
      dark: createPbrSurface(scene, 'base-dark', { color: '#2d302c', roughness: 0.7 }),
      wreck: createPbrSurface(scene, 'base-wreck', { color: DEFENCE_VISUAL_CONFIG.wreckColor, roughness: 1 }),
    };
    for (const target of combat.targets) {
      if (target.kind !== 'hangar' && target.kind !== 'fuelDepot' && target.kind !== 'radar') continue;
      const kind: StructureKind = target.kind;
      const root = (name: string) => {
        const node = new TransformNode(`${name}-${target.id}`, scene);
        node.position.set(target.position.x, target.position.y - BASE_STRUCTURE_CONFIG[kind].height, target.position.z);
        node.rotation.y = degreesToRadians(target.headingDegrees);
        return node;
      };
      const alive = root(kind);
      const wreck = root(`${kind}-wreck`);
      let dish: Mesh | null = null;
      if (kind === 'hangar') buildHangar(scene, alive, m);
      else if (kind === 'fuelDepot') buildFuelDepot(scene, alive, m);
      else dish = buildRadar(scene, alive, m);
      buildRubble(scene, wreck, m.wreck, kind);
      wreck.setEnabled(false);
      for (const mesh of [...alive.getChildMeshes(), ...wreck.getChildMeshes()]) {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
      }
      this.structures.push({ target, alive, wreck, dish });
    }

    // Team flags: bright, unlit cloth so they read from far away.
    const flagMaterial = (team: Team) => {
      const material = new StandardMaterial(`base-flag-${team}`, scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString(TEAM_PAINT[team].accent);
      return material;
    };
    const neutral = new StandardMaterial('base-flag-neutral', scene);
    neutral.disableLighting = true;
    neutral.emissiveColor = Color3.FromHexString(BASE_COLORS.neutral);
    this.flagMaterials = { blue: flagMaterial('blue'), red: flagMaterial('red'), neutral };
    for (const base of BASES.filter((b) => b.kind === 'airfield')) {
      const r = base.runway;
      const h = degreesToRadians(r.headingDegrees);
      const x = r.center.x + BASE_FLAG_SPOT.along * Math.sin(h) + BASE_FLAG_SPOT.across * Math.cos(h);
      const z = r.center.z + BASE_FLAG_SPOT.along * Math.cos(h) - BASE_FLAG_SPOT.across * Math.sin(h);
      const pole = CreateCylinder(`${base.id}-flag-pole`, { height: 22, diameter: 0.35, tessellation: 8 }, scene);
      pole.position.set(x, r.center.y + 11, z);
      pole.material = m.metal;
      const cloth = CreateBox(`${base.id}-flag`, { width: 0.1, height: 3.6, depth: 6 }, scene);
      cloth.position.set(x, r.center.y + 20, z + 3);
      cloth.isPickable = pole.isPickable = false;
      this.flags.push({ base, cloth, owner: undefined });
    }
  }

  /** Meshes that should cast shadows. */
  get shadowCasters(): Mesh[] {
    return this.structures.flatMap((s) => s.alive.getChildMeshes().filter((m): m is Mesh => m instanceof Mesh));
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    for (const { target, alive, wreck, dish } of this.structures) {
      const standing = isTargetAlive(target);
      if (alive.isEnabled() !== standing) {
        alive.setEnabled(standing);
        wreck.setEnabled(!standing);
      }
      if (dish && standing) dish.rotation.y = this.time * 1.4; // a radar sweep every 4.5 s
      if (!standing && Number.isFinite(target.respawnTimer)) this.burn(target, deltaSeconds);
      else if (!standing) this.burn(target, deltaSeconds, true);
    }
    for (const flag of this.flags) {
      const owner = this.combat.ownerOf(flag.base);
      if (owner !== flag.owner) {
        flag.owner = owner;
        flag.cloth.material = this.flagMaterials[owner ?? 'neutral'];
      }
    }
  }

  /** Flames for a while, then smoke; a captured base's wrecks just smoulder. */
  private burn(target: CombatTarget, dt: number, smoulder = false): void {
    const since = target.destroyedSeconds;
    const flaming = !smoulder && since < BURN_CONFIG.wreckFlameSeconds * 1.5;
    const size = target.kind === 'hangar' ? 3 : target.kind === 'fuelDepot' ? 2.6 : 1.6;
    const spread = target.radius * 0.6;
    const carry = (this.emitCarry.get(target.id) ?? 0) + (flaming ? 26 : smoulder ? 2 : 6) * dt;
    let count = Math.floor(carry);
    this.emitCarry.set(target.id, carry - count);
    const groundY = target.position.y - BASE_STRUCTURE_CONFIG[target.kind as StructureKind].height;
    while (count-- > 0) {
      const x = target.position.x + (Math.random() - 0.5) * 2 * spread;
      const z = target.position.z + (Math.random() - 0.5) * 2 * spread;
      if (flaming && Math.random() < 0.55) this.effects.flame(x, groundY + 1, z, size * 0.7);
      else this.effects.smokePuff(x, groundY + 2, z, flaming ? 1 : 0.65, size, 12);
    }
  }
}

interface StructureMaterials {
  readonly concrete: Material;
  readonly metal: Material;
  readonly tank: Material;
  readonly dark: Material;
}

function add(mesh: Mesh, parent: TransformNode, material: Material): Mesh {
  mesh.parent = parent;
  mesh.material = material;
  return mesh;
}

/** A 40 x 28 m hangar: curved corrugated roof, end walls, big doors facing +Z (towards the runway). */
function buildHangar(scene: Scene, root: TransformNode, m: StructureMaterials): void {
  // A half cylinder lying along X makes the arched roof.
  const roof = add(CreateCylinder('hangar-roof', { height: 40, diameter: 28, arc: 0.5, tessellation: 24, enclose: true }, scene), root, m.metal);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 3;
  const walls = add(CreateBox('hangar-walls', { width: 40, height: 3, depth: 28 }, scene), root, m.concrete);
  walls.position.y = 1.5;
  const doors = add(CreateBox('hangar-doors', { width: 30, height: 12, depth: 0.4 }, scene), root, m.dark);
  doors.position.set(0, 6, 14.1);
}

/** Three big fuel tanks on a concrete pad, with pipes. */
function buildFuelDepot(scene: Scene, root: TransformNode, m: StructureMaterials): void {
  const pad = add(CreateBox('fuel-pad', { width: 30, height: 0.4, depth: 22 }, scene), root, m.concrete);
  pad.position.y = 0.2;
  [-9, 0, 9].forEach((x, i) => {
    const tank = add(CreateCylinder(`fuel-tank-${i}`, { height: 8, diameter: 8, tessellation: 20 }, scene), root, m.tank);
    tank.position.set(x, 4.4, i === 1 ? 3 : -2);
  });
  const pipe = add(CreateCylinder('fuel-pipe', { height: 26, diameter: 0.6, tessellation: 8 }, scene), root, m.dark);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 1.2, 7);
}

/** A lattice tower carrying a rotating radar dish. Returns the dish, which sweeps round. */
function buildRadar(scene: Scene, root: TransformNode, m: StructureMaterials): Mesh {
  const base = add(CreateBox('radar-hut', { width: 6, height: 3, depth: 5 }, scene), root, m.concrete);
  base.position.y = 1.5;
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
    const leg = add(CreateBox('radar-leg', { width: 0.3, height: 14, depth: 0.3 }, scene), root, m.dark);
    leg.position.set(x, 10, z);
  }
  for (const y of [6, 10, 14]) {
    const brace = add(CreateBox('radar-brace', { width: 3.5, height: 0.25, depth: 3.5 }, scene), root, m.dark);
    brace.position.y = y;
  }
  const dish = add(CreateBox('radar-dish', { width: 9, height: 3.2, depth: 0.4 }, scene), root, m.metal);
  dish.position.y = 18;
  return dish;
}

/** A blackened, collapsed version of the structure. */
function buildRubble(scene: Scene, root: TransformNode, material: Material, kind: StructureKind): void {
  const size = kind === 'hangar' ? 1 : kind === 'fuelDepot' ? 0.7 : 0.35;
  const pieces: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [34, 3, 22, 0, 1.5, 0],
    [14, 5, 9, -9, 2.5, 4],
    [10, 2, 14, 10, 1, -5],
    [6, 7, 4, 3, 3.5, 7],
  ];
  pieces.forEach(([w, h, d, x, y, z], i) => {
    const piece = add(CreateBox(`rubble-${i}`, { width: w * size, height: h * Math.max(size, 0.6), depth: d * size }, scene), root, material);
    piece.position.set(x * size, y * Math.max(size, 0.6), z * size);
    piece.rotation.y = i * 0.6;
  });
}

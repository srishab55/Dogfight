import type { Scene } from '@babylonjs/core/scene';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Material } from '@babylonjs/core/Materials/material';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { AIRFRAMES, isTargetAlive, type CarrierStatusMap, type CombatTarget, type CombatWorld } from '@dogfight/shared';
import { createAircraftModel } from '../aircraft/aircraftModel';
import { BURN_CONFIG, DEFENCE_VISUAL_CONFIG } from '../config/combatVisuals';
import { degreesToRadians } from '../math/orientation';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TEAM_PAINT } from '../config/aircraftVisuals';
import { createPbrSurface } from '../rendering/materials';
import type { FireAndSmoke } from '../effects/FireAndSmoke';

/** A thin-instanced mesh: one draw call for every copy; hidden copies get a zero-scale matrix. */
interface InstancedLayer {
  readonly mesh: Mesh;
  readonly matrices: Float32Array;
}

const ZERO = Vector3.Zero();
const ONE = Vector3.One();
const IDENTITY = Quaternion.Identity();
const scratchMatrix = new Matrix();
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();

/**
 * What Red's defences look like: anti-aircraft gun emplacements (sandbags,
 * mount, twin barrels that track their target), the aircraft parked on
 * Red's apron, and the wrecks and fires left when they're destroyed. The
 * carrier's own fires are here too. It only *shows* the combat world's
 * state; the shared simulation decides everything.
 */
export class EnemyTargets {
  private readonly gunBases: InstancedLayer;
  private readonly gunBarrels: InstancedLayer;
  /** A tall pole with a red flag at each gun: you can find them from a long way off. */
  private readonly gunFlags: InstancedLayer;
  private readonly wrecks: InstancedLayer;
  private readonly parked: InstancedLayer;
  private readonly guns: readonly CombatTarget[];
  private readonly parkedTargets: readonly CombatTarget[];
  private readonly carriers: readonly CombatTarget[];
  /** Emission bookkeeping: fractional puffs carried between frames, per target id. */
  private readonly emitCarry = new Map<number, number>();

  constructor(
    scene: Scene,
    private readonly combat: CombatWorld,
    private readonly effects: FireAndSmoke,
    private readonly carrierStatuses: CarrierStatusMap,
  ) {
    this.guns = combat.targets.filter((t) => t.kind === 'aaGun');
    this.parkedTargets = combat.targets.filter((t) => t.kind === 'parkedAircraft');
    this.carriers = combat.targets.filter((t) => t.kind === 'carrier');
    const config = DEFENCE_VISUAL_CONFIG;
    const sandbags = createPbrSurface(scene, 'aa-sandbags', { color: config.sandbagColor, roughness: 0.95 });
    const steel = createPbrSurface(scene, 'aa-steel', { color: config.gunColor, roughness: 0.6 });
    const charred = createPbrSurface(scene, 'wreck', { color: config.wreckColor, roughness: 1 });

    this.gunBases = layer(mergeParts('aa-base', buildGunBase(scene), sandbags), this.guns.length);
    this.gunBarrels = layer(mergeParts('aa-barrels', buildGunBarrels(scene), steel), this.guns.length);
    // Unlit and bright, so the flags read against the ground even far away.
    const flagMaterial = new StandardMaterial('aa-flag', scene);
    flagMaterial.disableLighting = true;
    flagMaterial.emissiveColor = Color3.FromHexString(TEAM_PAINT.red.accent);
    this.gunFlags = layer(mergeParts('aa-flag', buildGunFlag(scene), flagMaterial), this.guns.length);
    this.wrecks = layer(mergeParts('wreck', buildWreck(scene), charred), this.guns.length + this.parkedTargets.length);
    this.parked = layer(bakeParkedAircraft(scene), this.parkedTargets.length);
    for (const l of [this.gunBases, this.gunBarrels, this.wrecks, this.parked]) l.mesh.receiveShadows = true;
  }

  /** Meshes that should cast shadows. */
  get shadowCasters(): Mesh[] {
    return [this.gunBases.mesh, this.gunBarrels.mesh, this.gunFlags.mesh, this.parked.mesh];
  }

  update(deltaSeconds: number): void {
    let wreck = 0;
    // Guns: base and barrels while standing; a wreck, burning, once destroyed.
    this.combat.aaGuns.forEach((gun, i) => {
      const target = gun.target;
      const sink = target.carrierId ? (this.carrierStatuses.get(target.carrierId)?.sink ?? 0) : 0;
      const alive = isTargetAlive(target);
      const p = target.position;
      scratchPos.set(p.x, p.y - sink - 1.4, p.z);
      setMatrix(this.gunBases, i, alive ? scratchPos : null, 0, 0);
      scratchPos.y = p.y - sink;
      setMatrix(this.gunBarrels, i, alive ? scratchPos : null, gun.yaw, gun.pitch);
      scratchPos.y = p.y - sink - 1.4;
      setMatrix(this.gunFlags, i, alive ? scratchPos : null, 0, 0);
      scratchPos.y = p.y - sink - 1.3;
      // On a carrier that's going down, the wreck goes with it; under water it isn't drawn.
      const showWreck = !alive && p.y - sink > -4;
      setMatrix(this.wrecks, wreck++, showWreck ? scratchPos : null, degreesToRadians(target.id * 47), 0);
      if (showWreck) this.burn(target, p.x, p.y - sink - 1, p.z, 1, deltaSeconds);
    });
    // Parked aircraft.
    this.parkedTargets.forEach((target, i) => {
      const alive = isTargetAlive(target);
      const p = target.position;
      scratchPos.set(p.x, p.y + PARKED_HEIGHT_OFFSET, p.z);
      setMatrix(this.parked, i, alive ? scratchPos : null, degreesToRadians(target.headingDegrees), 0);
      scratchPos.y = p.y - 1.3;
      setMatrix(this.wrecks, wreck++, alive ? null : scratchPos, degreesToRadians(target.headingDegrees), 0);
      if (!alive) this.burn(target, p.x, p.y, p.z, 1.6, deltaSeconds);
    });
    for (const l of [this.gunBases, this.gunBarrels, this.gunFlags, this.wrecks, this.parked]) l.mesh.thinInstanceBufferUpdated('matrix');
    for (const carrier of this.carriers) this.burnCarrier(carrier, deltaSeconds);
  }

  /** A wreck: flames for a while after it's destroyed, then a column of smoke until it's replaced. */
  private burn(target: CombatTarget, x: number, y: number, z: number, scale: number, dt: number): void {
    const since = target.respawnSeconds - target.respawnTimer;
    const flaming = since < BURN_CONFIG.wreckFlameSeconds;
    this.emit(target.id, flaming ? BURN_CONFIG.wreckFlamesPerSecond : 0, BURN_CONFIG.wreckSmokePerSecond, dt, (flame) => {
      if (flame) this.effects.flame(x + jitter(1.5 * scale), y + 0.5, z + jitter(1.5 * scale), scale);
      else this.effects.smokePuff(x + jitter(scale), y + 1.5, z + jitter(scale), flaming ? 1 : 0.6, scale * (flaming ? 1 : 0.8));
    });
  }

  /** The carrier smokes when damaged, burns when badly damaged, and blazes as it sinks. */
  private burnCarrier(carrier: CombatTarget, dt: number): void {
    const health = carrier.health / carrier.maxHealth;
    const status = carrier.carrierId ? this.carrierStatuses.get(carrier.carrierId) : undefined;
    if (!status || health > BURN_CONFIG.carrierSmokeBelow) return;
    const destroyed = !isTargetAlive(carrier);
    const deckY = carrier.position.y - status.sink;
    if (deckY < -6) return; // under the sea
    const fires = destroyed ? 4 : health < BURN_CONFIG.carrierFireBelow ? 2 : 0;
    const smoke = destroyed ? 30 : health < BURN_CONFIG.carrierFireBelow ? 14 : 6;
    const h = degreesToRadians(carrier.headingDegrees);
    const points = [-90, -30, 30, 90];
    this.emit(carrier.id, fires * 10, smoke, dt, (flame) => {
      const along = points[Math.floor(Math.random() * (flame ? Math.max(1, fires) : 2))] ?? 0;
      const x = carrier.position.x + along * Math.sin(h) + jitter(6);
      const z = carrier.position.z + along * Math.cos(h) + jitter(6);
      if (flame) this.effects.flame(x, deckY + 1, z, 2.2);
      // A carrier's smoke is a tall column, visible from across the map.
      else this.effects.smokePuff(x, deckY + 3, z, destroyed || health < BURN_CONFIG.carrierFireBelow ? 1 : 0.55, 4.5, 16);
    });
  }

  /** Spawns `perSecond` flames and smoke puffs over time, carrying fractions between frames. */
  private emit(id: number, flamesPerSecond: number, smokePerSecond: number, dt: number, spawn: (flame: boolean) => void): void {
    const carry = (this.emitCarry.get(id) ?? 0) + (flamesPerSecond + smokePerSecond) * dt;
    let count = Math.floor(carry);
    this.emitCarry.set(id, carry - count);
    const flameShare = flamesPerSecond / Math.max(1e-6, flamesPerSecond + smokePerSecond);
    while (count-- > 0) spawn(Math.random() < flameShare);
  }
}

/** Parked aircraft stand on their wheels: their centre of mass is this far above the target point (which is 1.5 m up). */
const PARKED_HEIGHT_OFFSET = AIRFRAMES.fighter.groundClearance - 0.1 - 1.5;

function jitter(amount: number): number {
  return (Math.random() - 0.5) * 2 * amount;
}

function layer(mesh: Mesh, count: number): InstancedLayer {
  mesh.isPickable = false;
  const matrices = new Float32Array(Math.max(1, count) * 16);
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
  mesh.thinInstanceCount = count;
  // Instances spread over kilometres: never frustum-cull the whole batch by its source's bounds.
  mesh.alwaysSelectAsActiveMesh = true;
  return { mesh, matrices };
}

/** Writes instance `index`'s matrix: placed and turned (yaw, then pitch up), or zero-scaled (hidden) if `position` is null. */
function setMatrix(l: InstancedLayer, index: number, position: Vector3 | null, yaw: number, pitch: number): void {
  if (position) {
    Quaternion.RotationYawPitchRollToRef(yaw, -pitch, 0, scratchQuat);
    Matrix.ComposeToRef(ONE, scratchQuat, position, scratchMatrix);
  } else {
    Matrix.ComposeToRef(ZERO, IDENTITY, ZERO, scratchMatrix);
  }
  scratchMatrix.copyToArray(l.matrices, index * 16);
}

function mergeParts(name: string, parts: Mesh[], material: Material): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error(`Failed to merge ${name}`);
  merged.name = name;
  merged.material = material;
  return merged;
}

/** Sandbag ring and floor, centred under the gun's pivot (which sits 1.4 m above it). */
function buildGunBase(scene: Scene): Mesh[] {
  const ring = CreateTorus('aa-sandbags-ring', { diameter: 7, thickness: 1.5, tessellation: 20 }, scene);
  ring.position.y = 0.6;
  ring.scaling.y = 0.8;
  const floor = CreateCylinder('aa-floor', { height: 0.2, diameter: 6.8, tessellation: 18 }, scene);
  floor.position.y = 0.1;
  return [ring, floor];
}

/** A 9 m pole beside the emplacement with a red flag at the top. */
function buildGunFlag(scene: Scene): Mesh[] {
  const pole = CreateCylinder('aa-flag-pole', { height: 9, diameter: 0.16, tessellation: 6 }, scene);
  pole.position.set(4, 4.5, 0);
  const flag = CreateBox('aa-flag-cloth', { width: 0.06, height: 1.6, depth: 2.6 }, scene);
  flag.position.set(4, 8.1, 1.3);
  return [pole, flag];
}

/** Mount, shield and twin barrels around the pivot; +Z is the way the barrels point. */
function buildGunBarrels(scene: Scene): Mesh[] {
  const mount = CreateCylinder('aa-mount', { height: 1.1, diameter: 1.4, tessellation: 10 }, scene);
  mount.position.y = -0.6;
  const cradle = CreateBox('aa-cradle', { width: 1.3, height: 0.7, depth: 1.7 }, scene);
  const shield = CreateBox('aa-shield', { width: 2.1, height: 1.1, depth: 0.08 }, scene);
  shield.position.set(0, 0.25, 0.85);
  const barrels = [-0.3, 0.3].map((x, i) => {
    const barrel = CreateCylinder(`aa-barrel-${i}`, { height: 3.8, diameter: 0.2, tessellation: 8 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, 0.05, 2);
    return barrel;
  });
  return [mount, cradle, shield, ...barrels];
}

/** A burnt-out heap: twisted metal and blackened debris. */
function buildWreck(scene: Scene): Mesh[] {
  const pieces: Mesh[] = [];
  const sizes: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [3.2, 0.7, 1.2, 0, 0.35, 0],
    [1.4, 0.5, 2.2, 0.9, 0.25, 0.6],
    [2.4, 0.3, 0.9, -1, 0.15, -0.8],
    [0.8, 1.1, 0.8, -0.3, 0.55, 0.9],
  ];
  sizes.forEach(([w, h, d, x, y, z], i) => {
    const piece = CreateBox(`wreck-${i}`, { width: w, height: h, depth: d }, scene);
    piece.position.set(x, y, z);
    piece.rotation.y = i * 0.7;
    pieces.push(piece);
  });
  return pieces;
}

/**
 * A Red fighter, built from its airframe like the player's and then baked
 * into one static mesh (one sub-mesh per material), so every parked aircraft
 * is drawn in a handful of draw calls via thin instances.
 */
function bakeParkedAircraft(scene: Scene): Mesh {
  const visual = createAircraftModel(scene, AIRFRAMES.fighter, 'red', 'parked-red');
  visual.root.computeWorldMatrix(true);
  const meshes = visual.root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.isVisible && m.getTotalVertices() > 0);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);
  const baked = Mesh.MergeMeshes(meshes, false, true, undefined, false, true);
  if (!baked) throw new Error('Failed to bake the parked aircraft');
  baked.name = 'parked-aircraft';
  visual.dispose();
  return baked;
}

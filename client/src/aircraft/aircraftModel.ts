import type { Scene } from '@babylonjs/core/scene';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Airframe, EngineDesign, FinDesign, GlazingDesign, LatheProfile, TailplaneDesign, Team, WingDesign } from '@dogfight/shared';
import { AIRCRAFT_MATERIAL_CONFIG, ROUNDEL_CONFIG, TEAM_PAINT } from '../config/aircraftVisuals';
import { createPanelMesh, ensureOutwardFacing, type PanelSection } from '../rendering/geometry';
import { createPbrSurface } from '../rendering/materials';
import { AircraftVisual, type PropellerVisual } from './AircraftVisual';

/*
 * Builds an aircraft's 3D model from its airframe design (shared/src/config/airframe.ts):
 * the same numbers the flight model uses for wheels, crash points and guns,
 * so what you see touching the ground is what the physics thinks touches it.
 *
 * Local frame (metres): origin at the centre of mass on the fuselage axis,
 * +Z towards the nose, +Y up, +X along the right wing.
 *
 * Parts are merged into one mesh per material (body, accent, glass, dark
 * metal, roundels), so an aircraft is a handful of draw calls. Moving parts
 * (control surfaces, dive brakes, tailhook, propellers) are separate meshes
 * on pivots.
 */

export type SurfaceKind = 'flap' | 'aileron' | 'elevator' | 'rudder' | 'diveBrake';

/** A moving surface (flap, aileron, elevator, rudder, dive-brake plate) on a hinge. */
export interface HingedSurface {
  readonly kind: SurfaceKind;
  /** +1 right side, -1 left side, 0 on the centreline (rudder). */
  readonly side: 1 | -1 | 0;
  /** Dive-brake plates: +1 the upper plate, -1 the lower. 0 for everything else. */
  readonly face: 1 | -1 | 0;
  readonly mesh: Mesh;
  /** Sits on the hinge line; rotating it about `axis` deflects the surface. */
  readonly pivot: TransformNode;
  /**
   * Unit hinge axis, oriented so a POSITIVE angle raises the trailing edge
   * (wing and tailplane surfaces) or swings it to the LEFT (rudder).
   */
  readonly axis: Vector3;
  /** Pivot position when retracted, in the aircraft frame. */
  readonly restPosition: Vector3;
  /** Aft along the chord: the way a Fowler flap slides out. */
  readonly aftDirection: Vector3;
}

interface Materials {
  readonly body: Material;
  readonly accent: Material;
  readonly glass: Material;
  readonly dark: Material;
}

export function createAircraftModel(scene: Scene, airframe: Airframe, team: Team, name = `${airframe.id}-${team}`): AircraftVisual {
  const paint = TEAM_PAINT[team];
  const materials: Materials = {
    body: createPbrSurface(scene, `${name}-body`, { color: paint.body, roughness: AIRCRAFT_MATERIAL_CONFIG.paintRoughness }),
    accent: createPbrSurface(scene, `${name}-accent`, { color: paint.accent, roughness: AIRCRAFT_MATERIAL_CONFIG.paintRoughness }),
    glass: createPbrSurface(scene, `${name}-glass`, { color: AIRCRAFT_MATERIAL_CONFIG.canopyColor, roughness: AIRCRAFT_MATERIAL_CONFIG.canopyRoughness }),
    dark: createPbrSurface(scene, `${name}-dark`, { color: AIRCRAFT_MATERIAL_CONFIG.darkMetalColor, roughness: AIRCRAFT_MATERIAL_CONFIG.darkMetalRoughness }),
  };
  const wing = new WingGeometry(airframe.wing);
  const root = new TransformNode(name, scene);

  const bodyParts = [
    buildLatheAlongZ('fuselage', scene, airframe.fuselage, 28),
    ...buildFixedWing(scene, wing),
    ...buildFixedTailplane(scene, airframe.tailplane),
    ...airframe.engines.flatMap((engine) => (engine.nacelle ? [buildNacelle(scene, engine)] : [])),
  ];
  if (airframe.radiatorScoop) {
    const { center, width, height, depth } = airframe.radiatorScoop;
    const scoop = CreateBox('radiator-scoop', { width, height, depth }, scene);
    scoop.position.set(center.x, center.y, center.z);
    bodyParts.push(scoop);
  }
  const accentParts = [
    ...airframe.engines.map((engine) => buildSpinner(scene, engine)),
    ...buildFixedFin(scene, airframe.fin),
    ...buildWingTips(scene, wing),
    buildFuselageBand(scene, airframe.fuselage, airframe.bandZ),
  ];
  const glassParts = [buildGlazing('canopy', scene, airframe.canopy), ...airframe.turrets.map((turret, i) => buildGlazing(`turret-${i}`, scene, turret))];
  if (airframe.glazedNose) glassParts.push(buildLatheAlongZ('glazed-nose', scene, airframe.glazedNose, 24));
  const darkParts = [
    ...buildRadialFaces(scene, airframe),
    ...buildGunBarrels(scene, airframe),
    ...buildFlapHingeBrackets(scene, wing),
  ];
  if (airframe.exhaustStacks) darkParts.push(...buildExhaustStacks(scene, airframe.exhaustStacks));
  if (airframe.rearGun) darkParts.push(...buildRearGun(scene, airframe.rearGun));

  const body = mergeParts(`${name}-body`, bodyParts, materials.body);
  const accent = mergeParts(`${name}-accent`, accentParts, materials.accent);
  const glass = mergeParts(`${name}-glass`, glassParts, materials.glass);
  const dark = mergeParts(`${name}-dark`, darkParts, materials.dark);
  const roundels = mergeParts(`${name}-roundels`, buildRoundelDiscs(scene, wing, airframe.roundel), createRoundelMaterial(scene, `${name}-roundel`, paint.accent));

  const surfaces = [
    ...buildFlaps(scene, name, wing, materials.body),
    ...buildAilerons(scene, name, wing, materials.body),
    ...buildDiveBrakes(scene, name, wing, materials.accent),
    ...buildElevators(scene, name, airframe.tailplane, materials.body),
    buildRudder(scene, name, airframe.fin, materials.accent),
  ];

  const propellers: PropellerVisual[] = airframe.engines.map((engine, i) => {
    const blades = buildPropellerBlades(scene, `${name}-propeller-${i}`, engine, materials.dark);
    const disc = buildPropellerDisc(scene, `${name}-propeller-disc-${i}`, engine);
    return { blades, disc };
  });

  const tailhook = airframe.tailhook ? buildTailhook(scene, name, airframe.tailhook, materials.dark) : null;
  const gearLegs = buildLandingGear(scene, name, airframe, materials.dark);

  const shadowCasters = [body, accent, glass, dark, ...propellers.map((p) => p.blades), ...surfaces.map((surface) => surface.mesh), ...(tailhook ? [tailhook.mesh] : []), ...gearLegs.map((leg) => leg.mesh)];
  for (const mesh of [body, accent, glass, dark, roundels, ...propellers.flatMap((p) => [p.blades, p.disc])]) mesh.parent = root;
  for (const surface of surfaces) surface.pivot.parent = root;
  if (tailhook) tailhook.pivot.parent = root;
  for (const leg of gearLegs) leg.pivot.parent = root;
  for (const mesh of [...shadowCasters, roundels, ...propellers.map((p) => p.disc)]) mesh.isPickable = false;

  return new AircraftVisual(root, propellers, surfaces, shadowCasters, [roundels], tailhook?.pivot ?? null, gearLegs);
}

function mergeParts(name: string, parts: Mesh[], material: Material): Mesh {
  // MergeMeshes bakes each part's position/rotation/scale into the vertices.
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error(`Failed to merge aircraft parts for "${name}"`);
  merged.name = name;
  merged.material = material;
  return merged;
}

/** Spins a [radius, z] profile around the Z axis. */
function buildLatheAlongZ(name: string, scene: Scene, profile: LatheProfile, tessellation: number): Mesh {
  // CreateLathe spins a profile drawn in the XY plane around the Y axis...
  const shape = profile.map(([radius, z]) => new Vector3(radius, z, 0));
  const mesh = CreateLathe(name, { shape, tessellation }, scene);
  ensureOutwardFacing(mesh);
  // ...so rotate it +90 degrees about X to turn the Y axis into the Z (nose) axis.
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** Radius of a lathe profile at z, by linear interpolation. */
function profileRadiusAt(profile: LatheProfile, z: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, z0] = profile[i - 1] ?? [0, 0];
    const [r1, z1] = profile[i] ?? [0, 0];
    if (z >= z0 && z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0 || 1);
  }
  return 0;
}

function buildGlazing(name: string, scene: Scene, glazing: GlazingDesign): Mesh {
  const mesh = CreateSphere(name, { diameterX: glazing.width, diameterY: glazing.height, diameterZ: glazing.length, segments: 16 }, scene);
  mesh.position.set(glazing.center.x, glazing.center.y, glazing.center.z);
  return mesh;
}

/** A team-coloured band around the rear fuselage, slightly proud of the skin. */
function buildFuselageBand(scene: Scene, fuselage: LatheProfile, [front, back]: readonly [number, number]): Mesh {
  const lift = 0.008;
  return buildLatheAlongZ('fuselage-band', scene, [[profileRadiusAt(fuselage, back) + lift, back], [profileRadiusAt(fuselage, front) + lift, front]], 28);
}

// ── Engines and propellers ─────────────────────────────────────────────────

const SPINNER_PROFILE: LatheProfile = [
  [0.0, 0.0],
  [1.0, 0.0],
  [0.97, 0.23],
  [0.77, 0.58],
  [0.37, 0.87],
  [0.0, 1.0],
];

function buildSpinner(scene: Scene, engine: EngineDesign): Mesh {
  const { radius, length, baseZ } = engine.spinner;
  const spinner = buildLatheAlongZ('spinner', scene, SPINNER_PROFILE.map(([r, z]) => [r * radius, z * length] as const), 20);
  spinner.position.set(engine.hub.x, engine.hub.y, baseZ);
  return spinner;
}

/** A wing engine's nacelle: a streamlined body from the spinner back over the wing, its front closed by the engine face. */
function buildNacelle(scene: Scene, engine: EngineDesign): Mesh {
  const { radius: r, length: l } = engine.nacelle ?? { radius: 0, length: 0 };
  const front = engine.spinner.baseZ;
  const back = front - l;
  const profile: LatheProfile = [
    [0, back],
    [0.3 * r, back + 0.35],
    [0.75 * r, back + l * 0.3],
    [r, back + l * 0.62],
    [r, front - 0.3],
    [0.93 * r, front - 0.06],
    [0.86 * r, front],
    [0, front],
  ];
  const nacelle = buildLatheAlongZ('nacelle', scene, profile, 20);
  nacelle.position.set(engine.hub.x, engine.hub.y, 0);
  return nacelle;
}

/** Radial engines: a dark disc of cylinders just inside the cowling front. */
function buildRadialFaces(scene: Scene, airframe: Airframe): Mesh[] {
  const fuselageTip = airframe.fuselage[airframe.fuselage.length - 1]?.[1] ?? 0;
  return airframe.engines
    .filter((engine) => engine.radialFaceRadius > 0)
    .map((engine, i) => {
      const face = CreateDisc(`radial-face-${i}`, { radius: engine.radialFaceRadius, tessellation: 28 }, scene);
      // CreateDisc faces -Z; turn it to face forward (+Z).
      face.rotation.y = Math.PI;
      const z = engine.nacelle ? engine.spinner.baseZ : fuselageTip;
      face.position.set(engine.hub.x, engine.hub.y, z + 0.006);
      return face;
    });
}

/** One propeller's blades, merged around its hub, then placed at the hub. Its own mesh so it can spin. */
function buildPropellerBlades(scene: Scene, name: string, engine: EngineDesign, material: Material): Mesh {
  const blades: Mesh[] = [];
  const pivots: TransformNode[] = [];
  for (let i = 0; i < engine.bladeCount; i++) {
    // Parenting keeps the two rotations unambiguous: the blade twists about its
    // own long axis, then the pivot spaces the blades around the hub.
    const pivot = new TransformNode(`${name}-blade-pivot-${i}`, scene);
    pivot.rotation.z = (i * 2 * Math.PI) / engine.bladeCount;
    const blade = CreateBox(`${name}-blade-${i}`, { width: engine.bladeChord, height: engine.bladeLength, depth: 0.05 }, scene);
    blade.parent = pivot;
    blade.position.y = engine.bladeRootRadius + engine.bladeLength / 2;
    blade.rotation.y = (engine.bladePitchDeg * Math.PI) / 180;
    blades.push(blade);
    pivots.push(pivot);
  }
  const merged = mergeParts(name, blades, material);
  for (const pivot of pivots) pivot.dispose();
  merged.position.set(engine.hub.x, engine.hub.y, engine.hub.z);
  return merged;
}

/**
 * The blur disc shown when a propeller spins too fast to draw as blades.
 * Its texture is a radial gradient: clear at the hub (behind the spinner),
 * a faint grey sweep, and a slightly lighter band where the blade tips move fastest.
 */
function buildPropellerDisc(scene: Scene, name: string, engine: EngineDesign): Mesh {
  const radius = engine.bladeRootRadius + engine.bladeLength;
  const disc = CreateDisc(name, { radius, tessellation: 48 }, scene);
  disc.position.set(engine.hub.x, engine.hub.y, engine.hub.z);

  const size = 256;
  const texture = new DynamicTexture(`${name}-texture`, { width: size, height: size }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(40, 42, 46, 0)');
  gradient.addColorStop(0.18, 'rgba(40, 42, 46, 0.55)');
  gradient.addColorStop(0.8, 'rgba(48, 50, 54, 0.45)');
  gradient.addColorStop(0.9, 'rgba(120, 122, 126, 0.5)');
  gradient.addColorStop(1, 'rgba(120, 122, 126, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.update(false);

  const material = new PBRMaterial(`${name}-material`, scene);
  material.albedoTexture = texture;
  material.useAlphaFromAlbedoTexture = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.backFaceCulling = false; // seen from in front (cockpit) and behind (chase)
  material.twoSidedLighting = true;
  material.roughness = 0.8;
  material.metallic = 0;
  disc.material = material;
  disc.isVisible = false;
  return disc;
}

function buildExhaustStacks(scene: Scene, stacks: NonNullable<Airframe['exhaustStacks']>): Mesh[] {
  const parts: Mesh[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < stacks.count; i++) {
      const stack = CreateBox(`exhaust-${side}-${i}`, { width: 0.12, height: 0.08, depth: 0.18 }, scene);
      stack.position.set(side * stacks.x, stacks.y, stacks.firstZ + i * stacks.spacing);
      parts.push(stack);
    }
  }
  return parts;
}

/** Short barrel stubs at each gun muzzle, pointing forward. */
function buildGunBarrels(scene: Scene, airframe: Airframe): Mesh[] {
  const length = 0.4;
  return airframe.gunMounts.map((mount, i) => {
    const barrel = CreateCylinder(`gun-barrel-${i}`, { height: length, diameter: 0.05, tessellation: 6 }, scene);
    barrel.rotation.x = Math.PI / 2; // cylinder axis Y -> Z
    barrel.position.set(mount.x, mount.y, mount.z - length / 2 + 0.05);
    return barrel;
  });
}

/** The rear gunner's twin guns, pointing aft and slightly up. */
function buildRearGun(scene: Scene, gun: NonNullable<Airframe['rearGun']>): Mesh[] {
  return [-0.07, 0.07].map((x, i) => {
    const barrel = CreateCylinder(`rear-gun-${i}`, { height: gun.length, diameter: 0.05, tessellation: 6 }, scene);
    // A cylinder's axis is Y. Rotating it -80 degrees about X lays it along -Z (aft), raised 10 degrees.
    barrel.rotation.x = -(Math.PI / 2 - (10 * Math.PI) / 180);
    barrel.position.set(gun.pivot.x + x, gun.pivot.y + Math.sin((10 * Math.PI) / 180) * (gun.length / 2), gun.pivot.z - gun.length / 2);
    return barrel;
  });
}

// ── Wing ───────────────────────────────────────────────────────────────────

/** Cross-sections of a straight-tapered wing with dihedral. */
class WingGeometry {
  constructor(readonly design: WingDesign) {}

  /** Interpolated wing cross-section at a distance `x` from the centreline (positive = right). */
  section(x: number, side: 1 | -1): PanelSection {
    const w = this.design;
    const t = x / w.halfSpan;
    const lerp = (root: number, tip: number) => root + (tip - root) * t;
    const y = w.y + x * Math.tan((w.dihedralDeg * Math.PI) / 180);
    return {
      leadingEdge: new Vector3(side * x, y, lerp(w.rootLeadingZ, w.tipLeadingZ)),
      trailingEdge: new Vector3(side * x, y, lerp(w.rootTrailingZ, w.tipTrailingZ)),
      thickness: lerp(w.rootThickness, w.tipThickness),
    };
  }

  /** Wing thickness at chord fraction f, relative to the leading edge: the wedge tapers linearly. */
  thicknessAtChord(f: number): number {
    return 1 - f * (1 - this.design.trailingEdgeRatio);
  }

  /**
   * Spanwise segments from root to tip, in order: plain wing, or a bay
   * where a moving surface sits aft of a hinge line.
   */
  segments(): Array<{ from: number; to: number; hingeChord: number | null }> {
    const w = this.design;
    const cuts: Array<{ from: number; to: number; hingeChord: number }> = [
      { from: w.flapStart, to: w.flapEnd, hingeChord: w.flapHingeChord },
      ...(w.diveBrakes ? [{ from: w.diveBrakes.start, to: w.diveBrakes.end, hingeChord: w.diveBrakes.hingeChord }] : []),
      { from: w.aileronStart, to: w.aileronEnd, hingeChord: w.aileronHingeChord },
    ];
    const segments: Array<{ from: number; to: number; hingeChord: number | null }> = [];
    let x = 0;
    for (const cut of cuts) {
      if (cut.from > x) segments.push({ from: x, to: cut.from, hingeChord: null });
      segments.push(cut);
      x = cut.to;
    }
    return segments;
  }
}

/** Point on the chord line at fraction `f` from leading to trailing edge. */
function chordPoint(section: PanelSection, f: number): Vector3 {
  return Vector3.Lerp(section.leadingEdge, section.trailingEdge, f);
}

/** The part of a section ahead of a hinge line at chord fraction `hingeChord`. */
function forwardOfHinge(section: PanelSection, hingeChord: number): PanelSection {
  return { ...section, trailingEdge: chordPoint(section, hingeChord) };
}

/** A moving surface's own section: from the hinge to the trailing edge, as thick as the panel is at the hinge. */
function aftOfHinge(section: PanelSection, hingeChord: number, thicknessAtChord: (f: number) => number): PanelSection {
  return { leadingEdge: chordPoint(section, hingeChord), trailingEdge: section.trailingEdge, thickness: section.thickness * thicknessAtChord(hingeChord) };
}

/**
 * The fixed (body-coloured) wing: full chord where nothing moves, and only
 * the part ahead of the hinge across the flap, dive-brake and aileron spans,
 * so the retracted surfaces complete the wing exactly. The tips are built
 * separately in the team colour.
 */
function buildFixedWing(scene: Scene, wing: WingGeometry): Mesh[] {
  const panels: Mesh[] = [];
  const ratio = wing.design.trailingEdgeRatio;
  for (const side of [1, -1] as const) {
    for (const segment of wing.segments()) {
      const from = wing.section(segment.from, side);
      const to = wing.section(segment.to, side);
      if (segment.hingeChord === null) panels.push(createPanelMesh(`wing-${side}-${segment.from}`, scene, from, to, Vector3.Up(), ratio));
      else
        panels.push(
          createPanelMesh(`wing-bay-${side}-${segment.from}`, scene, forwardOfHinge(from, segment.hingeChord), forwardOfHinge(to, segment.hingeChord), Vector3.Up(), wing.thicknessAtChord(segment.hingeChord)),
        );
    }
  }
  return panels;
}

function buildWingTips(scene: Scene, wing: WingGeometry): Mesh[] {
  const w = wing.design;
  return ([1, -1] as const).map((side) => createPanelMesh(`wing-tip-${side}`, scene, wing.section(w.aileronEnd, side), wing.section(w.halfSpan, side), Vector3.Up(), w.trailingEdgeRatio));
}

interface HingeOptions {
  /** Moves the hinge line, e.g. below the wing for a slotted flap (m, aircraft frame). */
  readonly hingeOffset?: Vector3;
  /** Adds a rounded leading edge, which shows when the surface deflects. */
  readonly roundedNose?: boolean;
  readonly face?: 1 | -1;
  /** Trailing-edge thickness as a fraction of the surface's leading edge. */
  readonly trailingEdgeRatio?: number;
}

/**
 * Builds a surface between two sections, already cut at the hinge, on a
 * pivot along its leading edge, so it rotates about the hinge line exactly
 * as on a real aircraft.
 */
function buildHingedSurface(
  kind: SurfaceKind,
  side: HingedSurface['side'],
  name: string,
  scene: Scene,
  innerSurface: PanelSection,
  outerSurface: PanelSection,
  thicknessAxis: Vector3,
  material: Material,
  options: HingeOptions = {},
): HingedSurface {
  const parts = [createPanelMesh(name, scene, innerSurface, outerSurface, thicknessAxis, options.trailingEdgeRatio ?? 0.4)];
  const hingeInner = innerSurface.leadingEdge;
  const span = outerSurface.leadingEdge.subtract(hingeInner);
  if (options.roundedNose) {
    // A cylinder along the hinge line rounds off the surface's leading edge.
    const diameter = (innerSurface.thickness + outerSurface.thickness) / 2;
    const nose = CreateCylinder(`${name}-nose`, { height: span.length(), diameter, tessellation: 10 }, scene);
    nose.position.copyFrom(hingeInner.add(span.scale(0.5)));
    nose.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), span.normalizeToNew(), new Quaternion());
    parts.push(nose);
  }
  const mesh = mergeParts(name, parts, material);

  const pivot = new TransformNode(`${name}-hinge`, scene);
  pivot.position.copyFrom(hingeInner);
  if (options.hingeOffset) pivot.position.addInPlace(options.hingeOffset);
  pivot.rotationQuaternion = Quaternion.Identity();
  // Re-parent while keeping the surface where it is; its local origin becomes the hinge.
  mesh.setParent(pivot);

  const axis = span.normalizeToNew();
  if (kind === 'rudder' ? axis.y < 0 : axis.x < 0) axis.scaleInPlace(-1);
  const aftDirection = innerSurface.trailingEdge.subtract(innerSurface.leadingEdge).normalize();
  return { kind, side, face: options.face ?? 0, mesh, pivot, axis, restPosition: pivot.position.clone(), aftDirection };
}

/** The wing surface aft of `hingeChord` between two span stations, as a hinged surface. */
function wingSurface(kind: SurfaceKind, wing: WingGeometry, side: 1 | -1, name: string, scene: Scene, from: number, to: number, hingeChord: number, material: Material, options: HingeOptions = {}): HingedSurface {
  const t = (f: number) => wing.thicknessAtChord(f);
  return buildHingedSurface(kind, side, name, scene, aftOfHinge(wing.section(from, side), hingeChord, t), aftOfHinge(wing.section(to, side), hingeChord, t), Vector3.Up(), material, {
    trailingEdgeRatio: wing.design.trailingEdgeRatio / t(hingeChord),
    ...options,
  });
}

/**
 * Slotted flaps: hinged below the wing, so lowering them swings them down
 * and slightly back, opening a slot between wing and flap, as on real
 * fighters. (Fowler flaps also slide aft; the visual adds that motion.)
 */
function buildFlaps(scene: Scene, name: string, wing: WingGeometry, material: Material): HingedSurface[] {
  const w = wing.design;
  return ([1, -1] as const).map((side) => {
    const inner = wing.section(w.flapStart, side);
    const drop = (inner.thickness * wing.thicknessAtChord(w.flapHingeChord)) / 2 + w.flapHingeDrop;
    return wingSurface('flap', wing, side, `${name}-flap-${side}`, scene, w.flapStart, w.flapEnd, w.flapHingeChord, material, { hingeOffset: new Vector3(0, -drop, 0), roundedNose: true });
  });
}

function buildAilerons(scene: Scene, name: string, wing: WingGeometry, material: Material): HingedSurface[] {
  const w = wing.design;
  return ([1, -1] as const).map((side) => wingSurface('aileron', wing, side, `${name}-aileron-${side}`, scene, w.aileronStart, w.aileronEnd, w.aileronHingeChord, material, { roundedNose: true }));
}

/**
 * Dive brakes: the surface aft of the hinge is split into an upper and a
 * lower plate, each half as thick, hinged on its own skin. Opening, the
 * upper plate swings up and the lower one down, like the dive bomber's
 * split flaps. Team-coloured, so they show when open.
 */
function buildDiveBrakes(scene: Scene, name: string, wing: WingGeometry, material: Material): HingedSurface[] {
  const brakes = wing.design.diveBrakes;
  if (!brakes) return [];
  const t = (f: number) => wing.thicknessAtChord(f);
  const plates: HingedSurface[] = [];
  for (const side of [1, -1] as const) {
    for (const face of [1, -1] as const) {
      const plateSection = (x: number): PanelSection => {
        const s = aftOfHinge(wing.section(x, side), brakes.hingeChord, t);
        const offset = new Vector3(0, (face * s.thickness) / 4, 0);
        return { leadingEdge: s.leadingEdge.add(offset), trailingEdge: s.trailingEdge.add(offset.scale(wing.design.trailingEdgeRatio / t(brakes.hingeChord))), thickness: s.thickness / 2 };
      };
      plates.push(
        buildHingedSurface('diveBrake', side, `${name}-dive-brake-${side}-${face}`, scene, plateSection(brakes.start), plateSection(brakes.end), Vector3.Up(), material, {
          face,
          trailingEdgeRatio: 0.5,
        }),
      );
    }
  }
  return plates;
}

/** Small dark brackets under the wing that carry the flap hinges. */
function buildFlapHingeBrackets(scene: Scene, wing: WingGeometry): Mesh[] {
  const w = wing.design;
  const brackets: Mesh[] = [];
  for (const side of [1, -1] as const) {
    for (const f of [0.15, 0.5, 0.85]) {
      const section = wing.section(w.flapStart + (w.flapEnd - w.flapStart) * f, side);
      const hinge = chordPoint(section, w.flapHingeChord);
      const halfThickness = (section.thickness * wing.thicknessAtChord(w.flapHingeChord)) / 2;
      const height = w.flapHingeDrop + 0.05;
      const bracket = CreateBox(`flap-bracket-${side}-${f}`, { width: 0.05, height, depth: Math.min(0.42, (section.leadingEdge.z - section.trailingEdge.z) * 0.25) }, scene);
      bracket.position.set(hinge.x, hinge.y - halfThickness - height / 2 + 0.02, hinge.z - 0.08);
      brackets.push(bracket);
    }
  }
  return brackets;
}

/**
 * Four roundel discs: upper and lower surface of each wing. Each sits on the
 * wing surface (the wedge's top or bottom face), tilted to match it, and
 * lifted a few millimetres so it doesn't flicker into the wing.
 */
function buildRoundelDiscs(scene: Scene, wing: WingGeometry, roundel: Airframe['roundel']): Mesh[] {
  const discs: Mesh[] = [];
  const f = roundel.chord;
  for (const side of [1, -1] as const) {
    for (const surface of [1, -1] as const) {
      // Point on the upper (surface = 1) or lower (-1) wing skin at span x and chord fraction c.
      const skin = (x: number, c: number) => {
        const section = wing.section(x, side);
        return chordPoint(section, c).add(new Vector3(0, (surface * section.thickness * wing.thicknessAtChord(c)) / 2, 0));
      };
      const x = roundel.span;
      const point = skin(x, f);
      const spanTangent = skin(x + 0.2, f).subtract(skin(x - 0.2, f));
      const chordTangent = skin(x, f + 0.1).subtract(skin(x, f - 0.1));
      const normal = Vector3.Cross(spanTangent, chordTangent).normalize();
      if (Math.sign(normal.y) !== surface) normal.scaleInPlace(-1);

      const disc = CreateDisc(`roundel-${side}-${surface}`, { radius: roundel.diameter / 2, tessellation: 32 }, scene);
      const discNormal = Vector3.FromArray(disc.getVerticesData(VertexBuffer.NormalKind) ?? [0, 0, -1]);
      disc.rotationQuaternion = Quaternion.FromUnitVectorsToRef(discNormal.normalize(), normal, new Quaternion());
      disc.position.copyFrom(point.add(normal.scale(0.006)));
      discs.push(disc);
    }
  }
  return discs;
}

/** Concentric rings drawn on a canvas; the disc's UVs map the texture's inscribed circle onto it. */
function createRoundelMaterial(scene: Scene, name: string, accentColor: string): Material {
  const size = 128;
  const texture = new DynamicTexture(`${name}-texture`, { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const ring = (radiusFraction: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (radiusFraction * size) / 2, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(1, ROUNDEL_CONFIG.rimColor);
  ring(0.9, ROUNDEL_CONFIG.ringColor);
  ring(0.58, accentColor);
  texture.update(false);

  const material = new PBRMaterial(name, scene);
  material.albedoTexture = texture;
  material.roughness = AIRCRAFT_MATERIAL_CONFIG.paintRoughness;
  material.metallic = 0;
  // Pull towards the camera in the depth test so the decal never z-fights with the wing.
  material.zOffset = -2;
  return material;
}

// ── Tail ───────────────────────────────────────────────────────────────────

/** Interpolated tailplane cross-section at a distance `x` from the centreline. */
function tailplaneSection(tail: TailplaneDesign, x: number, side: 1 | -1): PanelSection {
  const t = x / tail.halfSpan;
  const lerp = (root: number, tip: number) => root + (tip - root) * t;
  return {
    leadingEdge: new Vector3(side * x, tail.y, lerp(tail.rootLeadingZ, tail.tipLeadingZ)),
    trailingEdge: new Vector3(side * x, tail.y, lerp(tail.rootTrailingZ, tail.tipTrailingZ)),
    thickness: lerp(tail.rootThickness, tail.tipThickness),
  };
}

/** Tail surfaces taper like a wedge, with trailing edges at 30% of the leading edge's thickness. */
const TAIL_TRAILING_RATIO = 0.3;
const tailThicknessAtChord = (f: number) => 1 - f * (1 - TAIL_TRAILING_RATIO);

/** Fixed tailplane: full chord beside the fuselage, then only the part ahead of the elevator hinge. */
function buildFixedTailplane(scene: Scene, tail: TailplaneDesign): Mesh[] {
  return ([1, -1] as const).flatMap((side) => [
    createPanelMesh(`tailplane-root-${side}`, scene, tailplaneSection(tail, 0, side), tailplaneSection(tail, tail.elevatorStart, side), Vector3.Up()),
    createPanelMesh(
      `tailplane-${side}`,
      scene,
      forwardOfHinge(tailplaneSection(tail, tail.elevatorStart, side), tail.hingeChord),
      forwardOfHinge(tailplaneSection(tail, tail.halfSpan, side), tail.hingeChord),
      Vector3.Up(),
      tailThicknessAtChord(tail.hingeChord),
    ),
  ]);
}

function buildElevators(scene: Scene, name: string, tail: TailplaneDesign, material: Material): HingedSurface[] {
  return ([1, -1] as const).map((side) =>
    buildHingedSurface(
      'elevator',
      side,
      `${name}-elevator-${side}`,
      scene,
      aftOfHinge(tailplaneSection(tail, tail.elevatorStart, side), tail.hingeChord, tailThicknessAtChord),
      aftOfHinge(tailplaneSection(tail, tail.halfSpan, side), tail.hingeChord, tailThicknessAtChord),
      Vector3.Up(),
      material,
      { roundedNose: true, trailingEdgeRatio: TAIL_TRAILING_RATIO / tailThicknessAtChord(tail.hingeChord) },
    ),
  );
}

/** Interpolated fin cross-section at height `y`. Its thickness runs sideways (X). */
function finSection(fin: FinDesign, y: number): PanelSection {
  const t = (y - fin.rootY) / (fin.tipY - fin.rootY);
  const lerp = (root: number, tip: number) => root + (tip - root) * t;
  return {
    leadingEdge: new Vector3(0, y, lerp(fin.rootLeadingZ, fin.tipLeadingZ)),
    trailingEdge: new Vector3(0, y, lerp(fin.rootTrailingZ, fin.tipTrailingZ)),
    thickness: lerp(fin.rootThickness, fin.tipThickness),
  };
}

/** Fixed fin: full chord down by the fuselage, then only the part ahead of the rudder hinge. */
function buildFixedFin(scene: Scene, fin: FinDesign): Mesh[] {
  return [
    createPanelMesh('fin-root', scene, finSection(fin, fin.rootY), finSection(fin, fin.rudderBottomY), Vector3.Right()),
    createPanelMesh('fin', scene, forwardOfHinge(finSection(fin, fin.rudderBottomY), fin.hingeChord), forwardOfHinge(finSection(fin, fin.tipY), fin.hingeChord), Vector3.Right(), tailThicknessAtChord(fin.hingeChord)),
  ];
}

function buildRudder(scene: Scene, name: string, fin: FinDesign, material: Material): HingedSurface {
  return buildHingedSurface(
    'rudder',
    0,
    `${name}-rudder`,
    scene,
    aftOfHinge(finSection(fin, fin.rudderBottomY), fin.hingeChord, tailThicknessAtChord),
    aftOfHinge(finSection(fin, fin.tipY), fin.hingeChord, tailThicknessAtChord),
    Vector3.Right(),
    material,
    { roundedNose: true, trailingEdgeRatio: TAIL_TRAILING_RATIO / tailThicknessAtChord(fin.hingeChord) },
  );
}

/** The arrestor hook: a shank with a hook at its end, pointing aft from a pivot under the tail. Rotating the pivot about X lowers it. */
function buildTailhook(scene: Scene, name: string, hook: NonNullable<Airframe['tailhook']>, material: Material): { pivot: TransformNode; mesh: Mesh } {
  const shank = CreateBox(`${name}-hook-shank`, { width: 0.06, height: 0.06, depth: hook.length }, scene);
  shank.position.z = -hook.length / 2;
  const tip = CreateBox(`${name}-hook-tip`, { width: 0.1, height: 0.16, depth: 0.08 }, scene);
  tip.position.set(0, -0.06, -hook.length);
  const mesh = mergeParts(`${name}-tailhook`, [shank, tip], material);
  const pivot = new TransformNode(`${name}-tailhook-pivot`, scene);
  pivot.position.set(hook.pivot.x, hook.pivot.y, hook.pivot.z);
  mesh.parent = pivot;
  return { pivot, mesh };
}

// ── Landing gear ───────────────────────────────────────────────────────────

/**
 * One retractable gear leg (strut + wheel) hanging from a pivot at the top of
 * its strut. Rotating the pivot about `axis` by `foldAngle` folds it away:
 * the nose leg swings aft into the fuselage, main legs inward under the wing
 * (or aft into the engine nacelles on multi-engine aircraft).
 */
export interface GearLeg {
  readonly pivot: TransformNode;
  readonly mesh: Mesh;
  readonly axis: 'x' | 'z';
  readonly foldAngle: number;
}

function buildLandingGear(scene: Scene, name: string, airframe: Airframe, material: Material): GearLeg[] {
  const g = airframe.landingGear;
  const noseWheelCenterY = -airframe.groundClearance + g.noseWheelRadius;
  const nacelleMounted = airframe.engines.some((engine) => engine.nacelle);

  const buildLeg = (legName: string, x: number, z: number, topY: number, wheelY: number, radius: number, axis: 'x' | 'z', foldAngle: number): GearLeg => {
    // Built relative to the pivot at the strut's top.
    const strut = CreateCylinder(`${legName}-strut`, { height: topY - wheelY, diameter: g.strutDiameter, tessellation: 8 }, scene);
    strut.position.set(0, (wheelY - topY) / 2, 0);
    const wheel = CreateCylinder(`${legName}-wheel`, { height: g.wheelWidth, diameter: radius * 2, tessellation: 18 }, scene);
    // A cylinder's axis is Y; roll it 90 degrees so the axle runs along X.
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, wheelY - topY, 0);
    const mesh = mergeParts(`${name}-${legName}`, [strut, wheel], material);
    const pivot = new TransformNode(`${name}-${legName}-pivot`, scene);
    pivot.position.set(x, topY, z);
    mesh.parent = pivot;
    return { pivot, mesh, axis, foldAngle };
  };

  // Babylon's rotations: +x swings a leg hanging below the pivot aft; +z swings it out to the right.
  const legs = [1, -1].map((side) =>
    nacelleMounted
      ? buildLeg(`main-gear-${side}`, side * g.mainTrackHalfWidth, g.mainZ, g.mainStrutTopY, g.mainWheelCenterY, g.mainWheelRadius, 'x', Math.PI / 2)
      : buildLeg(`main-gear-${side}`, side * g.mainTrackHalfWidth, g.mainZ, g.mainStrutTopY, g.mainWheelCenterY, g.mainWheelRadius, 'z', -side * (Math.PI / 2)),
  );
  legs.push(buildLeg('nose-gear', 0, g.noseZ, g.noseStrutTopY, noseWheelCenterY, g.noseWheelRadius, 'x', Math.PI / 2));
  return legs;
}

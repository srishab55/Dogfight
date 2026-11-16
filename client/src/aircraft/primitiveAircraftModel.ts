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
import { PRIMITIVE_AIRFRAME, PRIMITIVE_GROUND_CLEARANCE, type Team } from '@dogfight/shared';
import { AIRCRAFT_MATERIAL_CONFIG, ROUNDEL_CONFIG, TEAM_PAINT } from '../config/aircraftVisuals';
import { createPanelMesh, ensureOutwardFacing, type PanelSection } from '../rendering/geometry';
import { createPbrSurface } from '../rendering/materials';
import { AircraftVisual } from './AircraftVisual';

/*
 * A single-engine, low-wing propeller fighter built from primitives, roughly
 * the size of a WWII fighter: 9.4 m long, 10.6 m wingspan.
 *
 * Local frame (metres): origin at the centre of mass on the fuselage axis,
 * +Z towards the nose, +Y up, +X along the right wing.
 *
 * The numbers below are the model's geometry, the procedural equivalent of a
 * mesh file. Phase 3 replaces this model with a Blender-made glTF, keeping
 * the same origin and axes.
 *
 * Tricycle landing gear (a nose wheel) is a deliberate gameplay choice: it
 * makes landing to capture a base forgiving. A tail-dragger tends to nose over
 * or ground-loop.
 */

/** Fuselage radius profile as [radius, z] pairs from tail to nose, spun around the Z axis. */
const FUSELAGE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0, -4.7],
  [0.1, -4.65],
  [0.22, -4.3],
  [0.34, -3.4],
  [0.46, -2.3],
  [0.56, -1.1],
  [0.62, 0.0],
  [0.64, 1.0],
  [0.64, 2.0],
  [0.62, 2.8],
  [0.58, 3.4],
  [0.52, 3.75],
  [0.0, 3.78],
];

const SPINNER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0],
  [0.3, 0.0],
  [0.29, 0.14],
  [0.23, 0.36],
  [0.11, 0.54],
  [0.0, 0.62],
];

const WING = {
  y: -0.38,
  halfSpan: PRIMITIVE_AIRFRAME.wingSpan / 2,
  /** Where the coloured wingtip begins (m from centreline). */
  tipColourStart: 4.5,
  rootLeadingZ: 1.25,
  rootTrailingZ: -0.95,
  tipLeadingZ: 0.75,
  tipTrailingZ: -0.25,
  rootThickness: 0.3,
  tipThickness: 0.1,
  dihedralDegrees: 6,
  /** Trailing-edge thickness as a fraction of leading-edge thickness (the wedge "airfoil"). */
  trailingEdgeRatio: 0.3,
  /** The inner trailing-edge flaps span this range (m from the centreline)... */
  flapStart: 0.7,
  flapEnd: 3.1,
  /** ...and hinge at this fraction of the chord, measured from the leading edge... */
  flapHingeChord: 0.72,
  /** ...on a hinge line this far below the wing's lower surface, so lowering them opens a slot (m). */
  flapHingeDrop: 0.05,
  /** Ailerons span from here out to the coloured tip, hinged at this chord fraction. */
  aileronStart: 3.3,
  aileronHingeChord: 0.74,
} as const;

/** Wing thickness at chord fraction f, relative to the leading edge: the wedge tapers linearly. */
const thicknessAtChord = (f: number) => 1 - f * (1 - WING.trailingEdgeRatio);

const HORIZONTAL_STABILISER = {
  y: 0.08,
  halfSpan: 2.0,
  rootLeadingZ: -3.55,
  rootTrailingZ: -4.7,
  tipLeadingZ: -4.05,
  tipTrailingZ: -4.6,
  rootThickness: 0.12,
  tipThickness: 0.05,
  /** Elevators run from just outside the fuselage to the tip, hinged at this chord fraction. */
  elevatorStart: 0.22,
  hingeChord: 0.62,
} as const;

const VERTICAL_FIN = {
  rootY: 0.2,
  tipY: 1.85,
  rootLeadingZ: -3.3,
  rootTrailingZ: -4.72,
  tipLeadingZ: -4.15,
  tipTrailingZ: -4.68,
  rootThickness: 0.14,
  tipThickness: 0.05,
  /** The rudder starts above the tail cone and is hinged at this chord fraction. */
  rudderBottomY: 0.42,
  hingeChord: 0.58,
} as const;

const PROPELLER = {
  /** Z position of the propeller hub. */
  hubZ: 3.95,
  bladeCount: 3,
  bladeLength: 1.25,
  bladeChord: 0.24,
  bladeThickness: 0.05,
  /** Distance from the hub centre to the blade root (m). */
  bladeRootRadius: 0.2,
  /** Blade pitch twist (degrees), so the blades read as angled rather than flat. */
  bladePitchDegrees: 22,
} as const;

/**
 * Wheel positions and sizes come from the shared airframe config, which the
 * flight model's ground contact also uses, so the wheels you see are exactly
 * where the physics thinks they touch. Only purely visual sizes are local.
 */
const LANDING_GEAR = {
  ...PRIMITIVE_AIRFRAME.landingGear,
  mainStrutTopY: -0.3,
  noseStrutTopY: -0.55,
  wheelWidth: 0.2,
  strutDiameter: 0.11,
} as const;

const GROUND_CLEARANCE = PRIMITIVE_GROUND_CLEARANCE;

export function createPrimitiveAircraft(scene: Scene, team: Team, name = `aircraft-${team}`): AircraftVisual {
  const paint = TEAM_PAINT[team];
  const materials = {
    body: createPbrSurface(scene, `${name}-body`, { color: paint.body, roughness: AIRCRAFT_MATERIAL_CONFIG.paintRoughness }),
    accent: createPbrSurface(scene, `${name}-accent`, { color: paint.accent, roughness: AIRCRAFT_MATERIAL_CONFIG.paintRoughness }),
    canopy: createPbrSurface(scene, `${name}-canopy`, {
      color: AIRCRAFT_MATERIAL_CONFIG.canopyColor,
      roughness: AIRCRAFT_MATERIAL_CONFIG.canopyRoughness,
    }),
    dark: createPbrSurface(scene, `${name}-dark`, {
      color: AIRCRAFT_MATERIAL_CONFIG.darkMetalColor,
      roughness: AIRCRAFT_MATERIAL_CONFIG.darkMetalRoughness,
    }),
  };

  const root = new TransformNode(name, scene);

  // Each part group is merged into one mesh per material: about 25 primitives
  // become a handful of draw calls per aircraft. That matters with 10 aircraft plus shadows.
  const body = mergeParts(`${name}-body`, [buildFuselage(scene), ...buildFixedWing(scene), ...buildFixedStabiliser(scene), buildRadiatorScoop(scene)], materials.body);
  const accent = mergeParts(`${name}-accent`, [buildSpinner(scene), ...buildFixedFin(scene), ...buildWingTips(scene), buildFuselageBand(scene)], materials.accent);
  const canopy = mergeParts(`${name}-canopy`, [buildCanopy(scene)], materials.canopy);
  const darkParts = mergeParts(`${name}-gear`, [...buildLandingGear(scene), ...buildExhaustStacks(scene), ...buildFlapHingeBrackets(scene)], materials.dark);
  const roundels = mergeParts(`${name}-roundels`, buildRoundelDiscs(scene), createRoundelMaterial(scene, `${name}-roundel`, paint.accent));

  // Moving surfaces are separate meshes on hinge pivots so they can deflect:
  // flaps and ailerons on both wings, elevators on the tailplane, rudder on the fin.
  const surfaces = [
    ...buildFlaps(scene, name, materials.body),
    ...buildAilerons(scene, name, materials.body),
    ...buildElevators(scene, name, materials.body),
    buildRudder(scene, name, materials.accent),
  ];

  // The propeller is its own mesh so it can spin. It is merged around the hub
  // (at the origin) and then moved into place.
  const { blades, pivots } = buildPropellerBlades(scene);
  const propeller = mergeParts(`${name}-propeller`, blades, materials.dark);
  for (const pivot of pivots) pivot.dispose();
  propeller.position.z = PROPELLER.hubZ;
  const propellerDisc = buildPropellerDisc(scene, name);

  const shadowCasters = [body, accent, canopy, darkParts, propeller, ...surfaces.map((surface) => surface.mesh)];
  for (const mesh of [body, accent, canopy, darkParts, propeller, roundels, propellerDisc]) mesh.parent = root;
  for (const surface of surfaces) surface.pivot.parent = root;
  for (const mesh of [...shadowCasters, roundels, propellerDisc]) mesh.isPickable = false;

  return new AircraftVisual(root, { blades: propeller, disc: propellerDisc }, surfaces, shadowCasters, [roundels]);
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
function buildLatheAlongZ(name: string, scene: Scene, profile: ReadonlyArray<readonly [number, number]>, tessellation: number): Mesh {
  // CreateLathe spins a profile drawn in the XY plane around the Y axis...
  const shape = profile.map(([radius, z]) => new Vector3(radius, z, 0));
  const mesh = CreateLathe(name, { shape, tessellation }, scene);
  ensureOutwardFacing(mesh);
  // ...so rotate it +90 degrees about X to turn the Y axis into the Z (nose) axis.
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function buildFuselage(scene: Scene): Mesh {
  return buildLatheAlongZ('fuselage', scene, FUSELAGE_PROFILE, 28);
}

function buildSpinner(scene: Scene): Mesh {
  const spinner = buildLatheAlongZ('spinner', scene, SPINNER_PROFILE, 20);
  // The profile starts at z = 0, so this puts the spinner's base on the fuselage nose.
  spinner.position.z = 3.74;
  return spinner;
}

function buildCanopy(scene: Scene): Mesh {
  const canopy = CreateSphere('canopy', { diameterX: 0.62, diameterY: 0.62, diameterZ: 1.9, segments: 16 }, scene);
  canopy.position.set(0, 0.52, 0.55);
  return canopy;
}

/** Interpolated wing cross-section at a distance `x` from the centreline (positive = right). */
function wingSection(x: number, side: 1 | -1): PanelSection {
  const t = x / WING.halfSpan;
  const lerp = (root: number, tip: number) => root + (tip - root) * t;
  const y = WING.y + x * Math.tan((WING.dihedralDegrees * Math.PI) / 180);
  return {
    leadingEdge: new Vector3(side * x, y, lerp(WING.rootLeadingZ, WING.tipLeadingZ)),
    trailingEdge: new Vector3(side * x, y, lerp(WING.rootTrailingZ, WING.tipTrailingZ)),
    thickness: lerp(WING.rootThickness, WING.tipThickness),
  };
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
function aftOfHinge(section: PanelSection, hingeChord: number): PanelSection {
  return { leadingEdge: chordPoint(section, hingeChord), trailingEdge: section.trailingEdge, thickness: section.thickness * thicknessAtChord(hingeChord) };
}

/**
 * The fixed (body-coloured) wing: full chord where nothing moves, and only
 * the part ahead of the hinge across the flap and aileron spans, so the
 * retracted surfaces complete the wing exactly. The tips are built
 * separately in the team colour.
 */
function buildFixedWing(scene: Scene): Mesh[] {
  const panels: Mesh[] = [];
  const panel = (name: string, from: PanelSection, to: PanelSection, ratio: number) => panels.push(createPanelMesh(name, scene, from, to, Vector3.Up(), ratio));
  for (const side of [1, -1] as const) {
    const s = (x: number) => wingSection(x, side);
    panel(`wing-root-${side}`, s(0), s(WING.flapStart), WING.trailingEdgeRatio);
    panel(`wing-flapbay-${side}`, forwardOfHinge(s(WING.flapStart), WING.flapHingeChord), forwardOfHinge(s(WING.flapEnd), WING.flapHingeChord), thicknessAtChord(WING.flapHingeChord));
    panel(`wing-mid-${side}`, s(WING.flapEnd), s(WING.aileronStart), WING.trailingEdgeRatio);
    panel(`wing-aileronbay-${side}`, forwardOfHinge(s(WING.aileronStart), WING.aileronHingeChord), forwardOfHinge(s(WING.tipColourStart), WING.aileronHingeChord), thicknessAtChord(WING.aileronHingeChord));
  }
  return panels;
}

function buildWingTips(scene: Scene): Mesh[] {
  return ([1, -1] as const).map((side) =>
    createPanelMesh(`wing-tip-${side}`, scene, wingSection(WING.tipColourStart, side), wingSection(WING.halfSpan, side), Vector3.Up(), WING.trailingEdgeRatio),
  );
}

export type SurfaceKind = 'flap' | 'aileron' | 'elevator' | 'rudder';

/** A moving surface (flap, aileron, elevator, rudder) on a hinge. */
export interface HingedSurface {
  readonly kind: SurfaceKind;
  /** +1 right side, -1 left side, 0 on the centreline (rudder). */
  readonly side: 1 | -1 | 0;
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

interface HingeOptions {
  /** Moves the hinge line, e.g. below the wing for a slotted flap (m, aircraft frame). */
  readonly hingeOffset?: Vector3;
  /** Adds a rounded leading edge, which shows when the surface deflects. */
  readonly roundedNose?: boolean;
}

/**
 * Cuts the part of a panel behind `hingeChord` into a separate surface on a
 * pivot, so it can rotate about the hinge line exactly as on a real aircraft.
 */
function buildHingedSurface(
  kind: SurfaceKind,
  side: HingedSurface['side'],
  name: string,
  scene: Scene,
  inner: PanelSection,
  outer: PanelSection,
  thicknessAxis: Vector3,
  hingeChord: number,
  material: Material,
  options: HingeOptions = {},
): HingedSurface {
  const innerSurface = aftOfHinge(inner, hingeChord);
  const outerSurface = aftOfHinge(outer, hingeChord);
  const parts = [createPanelMesh(name, scene, innerSurface, outerSurface, thicknessAxis, WING.trailingEdgeRatio / thicknessAtChord(hingeChord))];
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
  return { kind, side, mesh, pivot, axis, restPosition: pivot.position.clone(), aftDirection };
}

/**
 * Slotted flaps: hinged below the wing, so lowering them swings them down
 * and slightly back, opening a slot between wing and flap, as on real
 * fighters. (The bomber's Fowler motion is added by the visual: they also
 * slide aft.)
 */
function buildFlaps(scene: Scene, name: string, material: Material): HingedSurface[] {
  return ([1, -1] as const).map((side) => {
    const inner = wingSection(WING.flapStart, side);
    const drop = (inner.thickness * thicknessAtChord(WING.flapHingeChord)) / 2 + WING.flapHingeDrop;
    return buildHingedSurface('flap', side, `${name}-flap-${side}`, scene, inner, wingSection(WING.flapEnd, side), Vector3.Up(), WING.flapHingeChord, material, {
      hingeOffset: new Vector3(0, -drop, 0),
      roundedNose: true,
    });
  });
}

function buildAilerons(scene: Scene, name: string, material: Material): HingedSurface[] {
  return ([1, -1] as const).map((side) =>
    buildHingedSurface('aileron', side, `${name}-aileron-${side}`, scene, wingSection(WING.aileronStart, side), wingSection(WING.tipColourStart, side), Vector3.Up(), WING.aileronHingeChord, material, {
      roundedNose: true,
    }),
  );
}

/** Small dark brackets under the wing that carry the flap hinges. */
function buildFlapHingeBrackets(scene: Scene): Mesh[] {
  const brackets: Mesh[] = [];
  for (const side of [1, -1] as const) {
    for (const t of [0.15, 0.5, 0.85]) {
      const section = wingSection(WING.flapStart + (WING.flapEnd - WING.flapStart) * t, side);
      const hinge = chordPoint(section, WING.flapHingeChord);
      const halfThickness = (section.thickness * thicknessAtChord(WING.flapHingeChord)) / 2;
      const height = WING.flapHingeDrop + 0.05;
      const bracket = CreateBox(`flap-bracket-${side}-${t}`, { width: 0.05, height, depth: 0.42 }, scene);
      bracket.position.set(hinge.x, hinge.y - halfThickness - height / 2 + 0.02, hinge.z - 0.08);
      brackets.push(bracket);
    }
  }
  return brackets;
}

/** A team-coloured band around the rear fuselage, slightly proud of the skin. */
function buildFuselageBand(scene: Scene): Mesh {
  const [front, back] = [-2.55, -2.95];
  const lift = 0.008;
  return buildLatheAlongZ('fuselage-band', scene, [[fuselageRadiusAt(back) + lift, back], [fuselageRadiusAt(front) + lift, front]], 28);
}

/** Fuselage radius at z, interpolated along the lathe profile. */
function fuselageRadiusAt(z: number): number {
  for (let i = 1; i < FUSELAGE_PROFILE.length; i++) {
    const [r0, z0] = FUSELAGE_PROFILE[i - 1] ?? [0, 0];
    const [r1, z1] = FUSELAGE_PROFILE[i] ?? [0, 0];
    if (z >= z0 && z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return 0;
}

/**
 * Four roundel discs: upper and lower surface of each wing. Each sits on the
 * wing surface (the wedge's top or bottom face), tilted to match it, and
 * lifted a few millimetres so it doesn't flicker into the wing.
 */
function buildRoundelDiscs(scene: Scene): Mesh[] {
  const discs: Mesh[] = [];
  const f = ROUNDEL_CONFIG.chordPosition;
  for (const side of [1, -1] as const) {
    for (const surface of [1, -1] as const) {
      // Point on the upper (surface = 1) or lower (-1) wing skin at span x and chord fraction c.
      const skin = (x: number, c: number) => {
        const section = wingSection(x, side);
        return chordPoint(section, c).add(new Vector3(0, (surface * section.thickness * thicknessAtChord(c)) / 2, 0));
      };
      const x = ROUNDEL_CONFIG.spanPosition;
      const point = skin(x, f);
      const spanTangent = skin(x + 0.2, f).subtract(skin(x - 0.2, f));
      const chordTangent = skin(x, f + 0.1).subtract(skin(x, f - 0.1));
      const normal = Vector3.Cross(spanTangent, chordTangent).normalize();
      if (Math.sign(normal.y) !== surface) normal.scaleInPlace(-1);

      const disc = CreateDisc(`roundel-${side}-${surface}`, { radius: ROUNDEL_CONFIG.diameter / 2, tessellation: 32 }, scene);
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

/**
 * The blur disc shown when the propeller spins too fast to draw as blades.
 * Its texture is a radial gradient: clear at the hub (behind the spinner),
 * a faint grey sweep, and a slightly lighter band where the blade tips move fastest.
 */
function buildPropellerDisc(scene: Scene, name: string): Mesh {
  const radius = PROPELLER.bladeRootRadius + PROPELLER.bladeLength;
  const disc = CreateDisc(`${name}-propeller-disc`, { radius, tessellation: 48 }, scene);
  disc.position.z = PROPELLER.hubZ;

  const size = 256;
  const texture = new DynamicTexture(`${name}-propeller-disc-texture`, { width: size, height: size }, scene, true);
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

  const material = new PBRMaterial(`${name}-propeller-disc-material`, scene);
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

/** Interpolated tailplane cross-section at a distance `x` from the centreline. */
function stabiliserSection(x: number, side: 1 | -1): PanelSection {
  const s = HORIZONTAL_STABILISER;
  const t = x / s.halfSpan;
  const lerp = (root: number, tip: number) => root + (tip - root) * t;
  return {
    leadingEdge: new Vector3(side * x, s.y, lerp(s.rootLeadingZ, s.tipLeadingZ)),
    trailingEdge: new Vector3(side * x, s.y, lerp(s.rootTrailingZ, s.tipTrailingZ)),
    thickness: lerp(s.rootThickness, s.tipThickness),
  };
}

/** Fixed tailplane: full chord beside the fuselage, then only the part ahead of the elevator hinge. */
function buildFixedStabiliser(scene: Scene): Mesh[] {
  const s = HORIZONTAL_STABILISER;
  return ([1, -1] as const).flatMap((side) => [
    createPanelMesh(`stabiliser-root-${side}`, scene, stabiliserSection(0, side), stabiliserSection(s.elevatorStart, side), Vector3.Up()),
    createPanelMesh(
      `stabiliser-${side}`,
      scene,
      forwardOfHinge(stabiliserSection(s.elevatorStart, side), s.hingeChord),
      forwardOfHinge(stabiliserSection(s.halfSpan, side), s.hingeChord),
      Vector3.Up(),
      thicknessAtChord(s.hingeChord),
    ),
  ]);
}

function buildElevators(scene: Scene, name: string, material: Material): HingedSurface[] {
  const s = HORIZONTAL_STABILISER;
  return ([1, -1] as const).map((side) =>
    buildHingedSurface('elevator', side, `${name}-elevator-${side}`, scene, stabiliserSection(s.elevatorStart, side), stabiliserSection(s.halfSpan, side), Vector3.Up(), s.hingeChord, material, {
      roundedNose: true,
    }),
  );
}

/** Interpolated fin cross-section at height `y`. Its thickness runs sideways (X). */
function finSection(y: number): PanelSection {
  const f = VERTICAL_FIN;
  const t = (y - f.rootY) / (f.tipY - f.rootY);
  const lerp = (root: number, tip: number) => root + (tip - root) * t;
  return {
    leadingEdge: new Vector3(0, y, lerp(f.rootLeadingZ, f.tipLeadingZ)),
    trailingEdge: new Vector3(0, y, lerp(f.rootTrailingZ, f.tipTrailingZ)),
    thickness: lerp(f.rootThickness, f.tipThickness),
  };
}

/** Fixed fin: full chord down by the fuselage, then only the part ahead of the rudder hinge. */
function buildFixedFin(scene: Scene): Mesh[] {
  const f = VERTICAL_FIN;
  return [
    createPanelMesh('fin-root', scene, finSection(f.rootY), finSection(f.rudderBottomY), Vector3.Right()),
    createPanelMesh('fin', scene, forwardOfHinge(finSection(f.rudderBottomY), f.hingeChord), forwardOfHinge(finSection(f.tipY), f.hingeChord), Vector3.Right(), thicknessAtChord(f.hingeChord)),
  ];
}

function buildRudder(scene: Scene, name: string, material: Material): HingedSurface {
  const f = VERTICAL_FIN;
  return buildHingedSurface('rudder', 0, `${name}-rudder`, scene, finSection(f.rudderBottomY), finSection(f.tipY), Vector3.Right(), f.hingeChord, material, { roundedNose: true });
}

function buildRadiatorScoop(scene: Scene): Mesh {
  const scoop = CreateBox('radiator-scoop', { width: 0.55, height: 0.32, depth: 1.3 }, scene);
  scoop.position.set(0, -0.66, -0.2);
  return scoop;
}

function buildExhaustStacks(scene: Scene): Mesh[] {
  const stacks: Mesh[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const stack = CreateBox(`exhaust-${side}-${i}`, { width: 0.12, height: 0.08, depth: 0.18 }, scene);
      stack.position.set(side * 0.6, 0.22, 2.45 + i * 0.32);
      stacks.push(stack);
    }
  }
  return stacks;
}

/** Builds the blades around the origin (the hub). Returns the pivots so the caller can dispose them after merging. */
function buildPropellerBlades(scene: Scene): { blades: Mesh[]; pivots: TransformNode[] } {
  const p = PROPELLER;
  const blades: Mesh[] = [];
  const pivots: TransformNode[] = [];
  for (let i = 0; i < p.bladeCount; i++) {
    // Parenting keeps the two rotations unambiguous: the blade twists about its
    // own long axis, then the pivot spaces the blades around the hub.
    const pivot = new TransformNode(`blade-pivot-${i}`, scene);
    pivot.rotation.z = (i * 2 * Math.PI) / p.bladeCount;
    const blade = CreateBox(`blade-${i}`, { width: p.bladeChord, height: p.bladeLength, depth: p.bladeThickness }, scene);
    blade.parent = pivot;
    blade.position.y = p.bladeRootRadius + p.bladeLength / 2;
    blade.rotation.y = (p.bladePitchDegrees * Math.PI) / 180;
    blades.push(blade);
    pivots.push(pivot);
  }
  return { blades, pivots };
}

function buildLandingGear(scene: Scene): Mesh[] {
  const g = LANDING_GEAR;
  const parts: Mesh[] = [];
  const noseWheelCenterY = -GROUND_CLEARANCE + g.noseWheelRadius;

  const addStrut = (name: string, x: number, z: number, topY: number, bottomY: number) => {
    const strut = CreateCylinder(name, { height: topY - bottomY, diameter: g.strutDiameter, tessellation: 8 }, scene);
    strut.position.set(x, (topY + bottomY) / 2, z);
    parts.push(strut);
  };
  const addWheel = (name: string, x: number, y: number, z: number, radius: number) => {
    const wheel = CreateCylinder(name, { height: g.wheelWidth, diameter: radius * 2, tessellation: 18 }, scene);
    // A cylinder's axis is Y; roll it 90 degrees so the axle runs along X.
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    parts.push(wheel);
  };

  for (const side of [1, -1]) {
    const x = side * g.mainTrackHalfWidth;
    addStrut(`main-strut-${side}`, x, g.mainZ, g.mainStrutTopY, g.mainWheelCenterY);
    addWheel(`main-wheel-${side}`, x, g.mainWheelCenterY, g.mainZ, g.mainWheelRadius);
  }
  addStrut('nose-strut', 0, g.noseZ, g.noseStrutTopY, noseWheelCenterY);
  addWheel('nose-wheel', 0, noseWheelCenterY, g.noseZ, g.noseWheelRadius);
  return parts;
}

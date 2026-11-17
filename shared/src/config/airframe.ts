import type { Vec3 } from '../types/vector';

/*
 * Airframe geometry: the shape of each aircraft type, as data.
 *
 * One description serves everything that needs to know where the aircraft
 * physically is: the flight model (wheel contact, crash points, ground
 * effect, gun muzzles), the client's 3D model, and from Phase 5 the server's
 * hit detection. What you see touching the ground is therefore exactly what
 * the physics thinks touches the ground.
 *
 * Body frame (metres, at airframe scale 1): origin at the centre of mass on
 * the fuselage axis, +Z towards the nose, +Y up, +X along the right wing.
 * An aircraft class may scale its airframe (`airframeScale`).
 *
 * Every type uses tricycle landing gear (a nose wheel). That's a deliberate
 * gameplay choice: it makes landing forgiving. A tail-dragger tends to nose
 * over or ground-loop.
 */

export type AirframeId = 'fighter' | 'interceptor' | 'navalFighter' | 'diveBomber' | 'fourEngineBomber' | 'triplane' | 'biplane';

/** A [radius, z] profile from tail to nose, spun around the Z axis. */
export type LatheProfile = ReadonlyArray<readonly [number, number]>;

/** A straight-tapered wing, mirrored left and right. Span stations are distances from the centreline (m). */
export interface WingDesign {
  /** Height of the wing root's chord line (m). */
  readonly y: number;
  readonly halfSpan: number;
  readonly rootLeadingZ: number;
  readonly rootTrailingZ: number;
  readonly tipLeadingZ: number;
  readonly tipTrailingZ: number;
  readonly rootThickness: number;
  readonly tipThickness: number;
  readonly dihedralDeg: number;
  /** Trailing-edge thickness as a fraction of leading-edge thickness (a wedge "airfoil"). */
  readonly trailingEdgeRatio: number;
  /** Trailing-edge flaps span these stations and hinge at this chord fraction... */
  readonly flapStart: number;
  readonly flapEnd: number;
  readonly flapHingeChord: number;
  /** ...on a hinge line this far below the wing, so lowering them opens a slot (m). */
  readonly flapHingeDrop: number;
  readonly aileronStart: number;
  /** The coloured wingtip starts here. */
  readonly aileronEnd: number;
  readonly aileronHingeChord: number;
  /** Dive brakes: split plates that open above and below the wing between these stations. */
  readonly diveBrakes?: { readonly start: number; readonly end: number; readonly hingeChord: number };
}

export interface TailplaneDesign {
  readonly y: number;
  readonly halfSpan: number;
  readonly rootLeadingZ: number;
  readonly rootTrailingZ: number;
  readonly tipLeadingZ: number;
  readonly tipTrailingZ: number;
  readonly rootThickness: number;
  readonly tipThickness: number;
  /** Elevators run from this station to the tip, hinged at this chord fraction. */
  readonly elevatorStart: number;
  readonly hingeChord: number;
}

export interface FinDesign {
  readonly rootY: number;
  readonly tipY: number;
  readonly rootLeadingZ: number;
  readonly rootTrailingZ: number;
  readonly tipLeadingZ: number;
  readonly tipTrailingZ: number;
  readonly rootThickness: number;
  readonly tipThickness: number;
  /** The rudder starts at this height and is hinged at this chord fraction. */
  readonly rudderBottomY: number;
  readonly hingeChord: number;
}

export interface EngineDesign {
  /** Propeller hub (m). */
  readonly hub: Vec3;
  readonly bladeCount: number;
  readonly bladeLength: number;
  readonly bladeChord: number;
  /** Hub centre to the blade roots (m). Propeller radius = this + blade length. */
  readonly bladeRootRadius: number;
  /** Blade twist, so the blades read as angled rather than flat (deg). */
  readonly bladePitchDeg: number;
  /** Spinner (the cone over the hub): base position along Z, base radius, length (m). */
  readonly spinner: { readonly baseZ: number; readonly radius: number; readonly length: number };
  /** Wing engines sit in a nacelle running back from the spinner. Null for a nose engine: the fuselage is its nacelle. */
  readonly nacelle: { readonly radius: number; readonly length: number } | null;
  /** Radial engines show a dark ring of cylinders inside the cowling (m). 0 for an inline engine. */
  readonly radialFaceRadius: number;
}

export interface LandingGearDesign {
  readonly mainTrackHalfWidth: number;
  /** Main wheels sit just behind the centre of mass, as tricycle gear requires. */
  readonly mainZ: number;
  readonly mainWheelCenterY: number;
  readonly mainWheelRadius: number;
  readonly noseZ: number;
  readonly noseWheelRadius: number;
  /** Visual only: where the struts meet the airframe, wheel width, strut diameter. */
  readonly mainStrutTopY: number;
  readonly noseStrutTopY: number;
  readonly wheelWidth: number;
  readonly strutDiameter: number;
}

/**
 * A biplane's or triplane's other wings: plain (no moving surfaces), mirrored
 * left and right, team-coloured from `tipStart` out. The main `wing` carries
 * the ailerons and flaps, and is the one the physics uses for span.
 */
export interface PlainWingDesign {
  readonly y: number;
  readonly halfSpan: number;
  readonly rootLeadingZ: number;
  readonly rootTrailingZ: number;
  readonly tipLeadingZ: number;
  readonly tipTrailingZ: number;
  readonly rootThickness: number;
  readonly tipThickness: number;
  readonly dihedralDeg: number;
  readonly trailingEdgeRatio: number;
  readonly tipStart: number;
}

/** A strut or bracing post between two points (m), mirrored to the left side when it's off the centreline. */
export interface StrutDesign {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly diameter: number;
}

/** A bomb (or drop tank) hanging under the aircraft: visual only (bombs arrive later in Phase 4). */
export interface StoreDesign {
  readonly center: Vec3;
  readonly length: number;
  readonly radius: number;
}

/** An ellipsoid of glass: cockpit canopy or gun turret. */
export interface GlazingDesign {
  readonly center: Vec3;
  readonly width: number;
  readonly height: number;
  readonly length: number;
}

export interface AirframeDesign {
  readonly id: AirframeId;
  readonly fuselage: LatheProfile;
  /** A glazed nose (the bomb aimer's position), drawn in glass over the fuselage's tip. */
  readonly glazedNose?: LatheProfile;
  readonly canopy: GlazingDesign;
  /** Gun turrets: glazed domes. Visual only until AI gunners arrive (Phase 7). */
  readonly turrets: readonly GlazingDesign[];
  readonly wing: WingDesign;
  readonly tailplane: TailplaneDesign;
  readonly fin: FinDesign;
  readonly engines: readonly EngineDesign[];
  readonly landingGear: LandingGearDesign;
  /** Pilot's eye position, for the cockpit camera. */
  readonly cockpitEye: Vec3;
  /** Gun muzzles, one per gun. Each gun is angled at the convergence point ahead. */
  readonly gunMounts: readonly Vec3[];
  /** Lowest point of the belly (m), for crash detection. */
  readonly bellyPoint: Vec3;
  /** Team-coloured band around the rear fuselage: [front z, back z]. */
  readonly bandZ: readonly [number, number];
  /** Roundels on each wing: distance from the centreline, diameter, and position along the chord (0-1). */
  readonly roundel: { readonly span: number; readonly diameter: number; readonly chord: number };
  readonly radiatorScoop?: { readonly center: Vec3; readonly width: number; readonly height: number; readonly depth: number };
  readonly exhaustStacks?: { readonly x: number; readonly y: number; readonly firstZ: number; readonly count: number; readonly spacing: number };
  /** Carrier arrestor hook, hinged under the tail. Lowered (65 degrees down), its tip hangs below the main wheels in the landing attitude. */
  readonly tailhook?: { readonly pivot: Vec3; readonly length: number };
  /** Rear gunner's twin gun, pointing aft from the back of the canopy. */
  readonly rearGun?: { readonly pivot: Vec3; readonly length: number };
  /** Biplanes and triplanes: the other wings, and the struts between them. */
  readonly extraWings?: readonly PlainWingDesign[];
  readonly struts?: readonly StrutDesign[];
  /** Fixed landing gear (old types): it never retracts, and its drag is part of the airframe's. */
  readonly fixedGear?: boolean;
  /** Bombs or tanks under the wings or fuselage (visual). */
  readonly stores?: readonly StoreDesign[];
}

export interface WheelDefinition {
  /** Bottom of the tyre in the body frame, at scale 1. */
  readonly contactPoint: Readonly<Vec3>;
  /** Nose wheel steers with the rudder; main wheels brake. */
  readonly kind: 'nose' | 'main';
}

/**
 * Points on the airframe that must never touch the ground. If one does, the
 * aircraft has crashed: belly landing, wingtip strike, propeller strike,
 * nose-over.
 */
export interface CrashPoint {
  readonly point: Readonly<Vec3>;
  /** Shown to the player, e.g. "Crashed: propeller strike". */
  readonly description: string;
}

/** An airframe design plus the physics data derived from it. */
export interface Airframe extends AirframeDesign {
  /** Tip to tip (m, scale 1). */
  readonly wingSpan: number;
  /** Centre of mass to the bottom of the main wheels (m, scale 1). */
  readonly groundClearance: number;
  readonly wheels: readonly WheelDefinition[];
  readonly crashPoints: readonly CrashPoint[];
  /**
   * Fraction of the weight each wheel carries at rest, from the moment
   * balance about the centre of mass (z = 0):
   *   noseShare * noseZ + mainShare * mainZ = 0,   noseShare + mainShare = 1
   *   => noseShare = mainZ / (mainZ - noseZ)
   * Each leg's spring is sized to its share, so all legs compress equally
   * and the aircraft sits level.
   */
  readonly staticLoadShare: readonly number[];
}

/** Derives wheels, crash points and load shares from a design. */
export function defineAirframe(design: AirframeDesign): Airframe {
  const gear = design.landingGear;
  const groundClearance = -(gear.mainWheelCenterY - gear.mainWheelRadius);
  const wheels: WheelDefinition[] = [
    { kind: 'main', contactPoint: { x: gear.mainTrackHalfWidth, y: -groundClearance, z: gear.mainZ } },
    { kind: 'main', contactPoint: { x: -gear.mainTrackHalfWidth, y: -groundClearance, z: gear.mainZ } },
    // The nose wheel is smaller, so its centre sits lower; its bottom is level with the mains.
    { kind: 'nose', contactPoint: { x: 0, y: -groundClearance, z: gear.noseZ } },
  ];
  if (gear.mainZ >= 0 || gear.noseZ <= 0) throw new Error(`${design.id}: tricycle gear needs the mains behind and the nose wheel ahead of the centre of mass`);
  const noseShare = gear.mainZ / (gear.mainZ - gear.noseZ);
  const staticLoadShare = wheels.map((wheel) => (wheel.kind === 'nose' ? noseShare : (1 - noseShare) / 2));

  return { ...design, wingSpan: design.wing.halfSpan * 2, groundClearance, wheels, crashPoints: deriveCrashPoints(design), staticLoadShare };
}

function deriveCrashPoints(design: AirframeDesign): CrashPoint[] {
  const points: CrashPoint[] = [];
  const add = (x: number, y: number, z: number, description: string) => points.push({ point: { x, y, z }, description });
  const { wing, tailplane, fin, canopy, fuselage } = design;

  // Nose: the furthest-forward of the fuselage tip, a glazed nose or a nose spinner.
  const fuselageTip = fuselage[fuselage.length - 1]?.[1] ?? 0;
  const glazedTip = design.glazedNose?.[design.glazedNose.length - 1]?.[1] ?? -Infinity;
  const spinnerTip = Math.max(-Infinity, ...design.engines.filter((e) => e.hub.x === 0).map((e) => e.spinner.baseZ + e.spinner.length));
  add(0, 0, Math.max(fuselageTip, glazedTip, spinnerTip), 'nose impact');

  // Each propeller: blade tips at the bottom of the disc and 45 degrees either side.
  for (const engine of design.engines) {
    const r = engine.bladeRootRadius + engine.bladeLength;
    const { x, y, z } = engine.hub;
    add(x, y - r, z, 'propeller strike');
    add(x + r * Math.SQRT1_2, y - r * Math.SQRT1_2, z, 'propeller strike');
    add(x - r * Math.SQRT1_2, y - r * Math.SQRT1_2, z, 'propeller strike');
  }

  add(design.bellyPoint.x, design.bellyPoint.y, design.bellyPoint.z, 'belly landing');
  add(0, 0, fuselage[0]?.[1] ?? 0, 'tail strike');
  add(0, fin.tipY, (fin.tipLeadingZ + fin.tipTrailingZ) / 2, 'fin strike');
  add(canopy.center.x, canopy.center.y + canopy.height / 2, canopy.center.z, 'canopy impact');
  for (const turret of design.turrets) {
    // The side of the dome away from the fuselage axis: top for a dorsal turret, bottom for a ventral one.
    const outward = turret.center.y >= 0 ? 1 : -1;
    add(turret.center.x, turret.center.y + (outward * turret.height) / 2, turret.center.z, outward > 0 ? 'turret impact' : 'belly landing');
  }

  const tipY = wing.y + wing.halfSpan * Math.tan((wing.dihedralDeg * Math.PI) / 180);
  const tipZ = (wing.tipLeadingZ + wing.tipTrailingZ) / 2;
  add(wing.halfSpan, tipY, tipZ, 'right wingtip strike');
  add(-wing.halfSpan, tipY, tipZ, 'left wingtip strike');
  // A biplane's lower wing reaches the ground first in a bank.
  for (const extra of design.extraWings ?? []) {
    const y = extra.y + extra.halfSpan * Math.tan((extra.dihedralDeg * Math.PI) / 180);
    const z = (extra.tipLeadingZ + extra.tipTrailingZ) / 2;
    add(extra.halfSpan, y, z, 'right wingtip strike');
    add(-extra.halfSpan, y, z, 'left wingtip strike');
  }
  const tailTipZ = (tailplane.tipLeadingZ + tailplane.tipTrailingZ) / 2;
  add(tailplane.halfSpan, tailplane.y, tailTipZ, 'tailplane strike');
  add(-tailplane.halfSpan, tailplane.y, tailTipZ, 'tailplane strike');
  return points;
}

// ── The airframes ──────────────────────────────────────────────────────────

/**
 * Single-engine, low-wing propeller fighter, roughly the size of a WWII
 * fighter: 9.1 m long, 10.6 m span, inline engine. Flown (at different
 * scales) by the Interceptor and the Fighter-Bomber.
 */
export const FIGHTER_AIRFRAME = defineAirframe({
  id: 'fighter',
  fuselage: [
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
  ],
  canopy: { center: { x: 0, y: 0.52, z: 0.55 }, width: 0.62, height: 0.62, length: 1.9 },
  turrets: [],
  wing: {
    y: -0.38,
    halfSpan: 5.3,
    rootLeadingZ: 1.25,
    rootTrailingZ: -0.95,
    tipLeadingZ: 0.75,
    tipTrailingZ: -0.25,
    rootThickness: 0.3,
    tipThickness: 0.1,
    dihedralDeg: 6,
    trailingEdgeRatio: 0.3,
    flapStart: 0.7,
    flapEnd: 3.1,
    flapHingeChord: 0.72,
    flapHingeDrop: 0.05,
    aileronStart: 3.3,
    aileronEnd: 4.5,
    aileronHingeChord: 0.74,
  },
  tailplane: {
    y: 0.08,
    halfSpan: 2.0,
    rootLeadingZ: -3.55,
    rootTrailingZ: -4.7,
    tipLeadingZ: -4.05,
    tipTrailingZ: -4.6,
    rootThickness: 0.12,
    tipThickness: 0.05,
    elevatorStart: 0.22,
    hingeChord: 0.62,
  },
  fin: {
    rootY: 0.2,
    tipY: 1.85,
    rootLeadingZ: -3.3,
    rootTrailingZ: -4.72,
    tipLeadingZ: -4.15,
    tipTrailingZ: -4.68,
    rootThickness: 0.14,
    tipThickness: 0.05,
    rudderBottomY: 0.42,
    hingeChord: 0.58,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 3.95 },
      bladeCount: 3,
      bladeLength: 1.25,
      bladeChord: 0.24,
      bladeRootRadius: 0.2,
      bladePitchDeg: 22,
      spinner: { baseZ: 3.74, radius: 0.3, length: 0.62 },
      nacelle: null,
      radialFaceRadius: 0,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.55,
    mainZ: -0.35,
    mainWheelCenterY: -1.45,
    mainWheelRadius: 0.33,
    noseZ: 2.9,
    noseWheelRadius: 0.26,
    mainStrutTopY: -0.3,
    noseStrutTopY: -0.55,
    wheelWidth: 0.2,
    strutDiameter: 0.11,
  },
  cockpitEye: { x: 0, y: 0.95, z: 0.35 },
  // Four guns in the wing leading edges, outboard of the propeller arc.
  gunMounts: [
    { x: -2.4, y: -0.13, z: 1.03 },
    { x: 2.4, y: -0.13, z: 1.03 },
    { x: -1.9, y: -0.18, z: 1.08 },
    { x: 1.9, y: -0.18, z: 1.08 },
  ],
  bellyPoint: { x: 0, y: -0.82, z: -0.2 },
  bandZ: [-2.55, -2.95],
  roundel: { span: 3.55, diameter: 0.92, chord: 0.38 },
  radiatorScoop: { center: { x: 0, y: -0.66, z: -0.2 }, width: 0.55, height: 0.32, depth: 1.3 },
  exhaustStacks: { x: 0.6, y: 0.22, firstZ: 2.45, count: 3, spacing: 0.32 },
  // The Fighter-Bomber's load: a bomb under each wing and one on the centreline.
  stores: [
    { center: { x: 2.05, y: -0.78, z: 0.25 }, length: 1.7, radius: 0.19 },
    { center: { x: -2.05, y: -0.78, z: 0.25 }, length: 1.7, radius: 0.19 },
    { center: { x: 0, y: -0.92, z: 0.1 }, length: 2.0, radius: 0.23 },
  ],
  // An arrestor hook, as on the naval versions of land fighters (a gameplay
  // assist: any fighter can land on a carrier). Its lowered tip reaches just
  // above the main wheels, like the Naval Fighter's.
  tailhook: { pivot: { x: 0, y: -0.2, z: -4.3 }, length: 1.7 },
});

/**
 * Carrier fighter: barrel-shaped fuselage behind a big radial engine, broad
 * square-tipped wing for slow carrier approaches, strong landing gear and an
 * arrestor hook. 9.2 m long, 12 m span.
 */
export const NAVAL_FIGHTER_AIRFRAME = defineAirframe({
  id: 'navalFighter',
  fuselage: [
    [0.0, -5.4],
    [0.1, -5.35],
    [0.24, -5.0],
    [0.4, -4.0],
    [0.55, -2.8],
    [0.66, -1.4],
    [0.72, 0.0],
    [0.76, 1.2],
    [0.78, 2.2],
    [0.78, 3.1],
    [0.74, 3.55],
    [0.64, 3.72],
    [0.0, 3.74],
  ],
  canopy: { center: { x: 0, y: 0.66, z: 0.3 }, width: 0.62, height: 0.58, length: 1.8 },
  turrets: [],
  wing: {
    y: -0.42,
    halfSpan: 6.0,
    rootLeadingZ: 1.45,
    rootTrailingZ: -1.15,
    tipLeadingZ: 0.8,
    tipTrailingZ: -0.3,
    rootThickness: 0.36,
    tipThickness: 0.12,
    dihedralDeg: 5.5,
    trailingEdgeRatio: 0.3,
    flapStart: 0.78,
    flapEnd: 3.5,
    flapHingeChord: 0.72,
    flapHingeDrop: 0.05,
    aileronStart: 3.7,
    aileronEnd: 5.25,
    aileronHingeChord: 0.74,
  },
  tailplane: {
    y: 0.18,
    halfSpan: 2.45,
    rootLeadingZ: -3.95,
    rootTrailingZ: -5.35,
    tipLeadingZ: -4.55,
    tipTrailingZ: -5.2,
    rootThickness: 0.13,
    tipThickness: 0.05,
    elevatorStart: 0.25,
    hingeChord: 0.62,
  },
  fin: {
    rootY: 0.25,
    tipY: 2.2,
    rootLeadingZ: -3.6,
    rootTrailingZ: -5.42,
    tipLeadingZ: -4.75,
    tipTrailingZ: -5.35,
    rootThickness: 0.15,
    tipThickness: 0.05,
    rudderBottomY: 0.48,
    hingeChord: 0.58,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 3.86 },
      bladeCount: 3,
      bladeLength: 1.38,
      bladeChord: 0.28,
      bladeRootRadius: 0.2,
      bladePitchDeg: 24,
      spinner: { baseZ: 3.7, radius: 0.24, length: 0.42 },
      nacelle: null,
      radialFaceRadius: 0.56,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.7,
    mainZ: -0.35,
    mainWheelCenterY: -1.6,
    mainWheelRadius: 0.36,
    noseZ: 3.0,
    noseWheelRadius: 0.28,
    mainStrutTopY: -0.4,
    noseStrutTopY: -0.62,
    wheelWidth: 0.22,
    strutDiameter: 0.13,
  },
  cockpitEye: { x: 0, y: 1.0, z: 0.15 },
  gunMounts: [
    { x: -2.4, y: -0.17, z: 1.24 },
    { x: 2.4, y: -0.17, z: 1.24 },
    { x: -2.9, y: -0.13, z: 1.19 },
    { x: 2.9, y: -0.13, z: 1.19 },
  ],
  bellyPoint: { x: 0, y: -0.74, z: 0.5 },
  bandZ: [-2.9, -3.3],
  roundel: { span: 4.1, diameter: 1.0, chord: 0.38 },
  exhaustStacks: { x: 0.64, y: -0.25, firstZ: 2.6, count: 2, spacing: 0.3 },
  tailhook: { pivot: { x: 0, y: -0.32, z: -4.85 }, length: 1.7 },
});

/**
 * Two-seat carrier dive bomber: long greenhouse canopy with a rear gunner,
 * broad wing with dive brakes, radial engine and an arrestor hook.
 * 9.9 m long, 12.7 m span.
 */
export const DIVE_BOMBER_AIRFRAME = defineAirframe({
  id: 'diveBomber',
  fuselage: [
    [0.0, -6.3],
    [0.1, -6.22],
    [0.22, -5.7],
    [0.36, -4.6],
    [0.5, -3.1],
    [0.6, -1.5],
    [0.66, 0.0],
    [0.68, 1.4],
    [0.68, 2.6],
    [0.66, 3.25],
    [0.58, 3.55],
    [0.0, 3.58],
  ],
  // Pilot in front, gunner behind, under one long canopy.
  canopy: { center: { x: 0, y: 0.6, z: -0.7 }, width: 0.62, height: 0.6, length: 3.4 },
  turrets: [],
  wing: {
    y: -0.4,
    halfSpan: 6.33,
    rootLeadingZ: 1.55,
    rootTrailingZ: -1.45,
    tipLeadingZ: 0.7,
    tipTrailingZ: -0.35,
    rootThickness: 0.4,
    tipThickness: 0.12,
    dihedralDeg: 6.5,
    trailingEdgeRatio: 0.3,
    flapStart: 0.75,
    flapEnd: 2.7,
    flapHingeChord: 0.72,
    flapHingeDrop: 0.05,
    aileronStart: 4.4,
    aileronEnd: 5.6,
    aileronHingeChord: 0.74,
    diveBrakes: { start: 2.85, end: 4.25, hingeChord: 0.74 },
  },
  tailplane: {
    y: 0.2,
    halfSpan: 2.55,
    rootLeadingZ: -4.85,
    rootTrailingZ: -6.2,
    tipLeadingZ: -5.45,
    tipTrailingZ: -6.05,
    rootThickness: 0.13,
    tipThickness: 0.05,
    elevatorStart: 0.24,
    hingeChord: 0.62,
  },
  fin: {
    rootY: 0.25,
    tipY: 2.05,
    rootLeadingZ: -4.4,
    rootTrailingZ: -6.32,
    tipLeadingZ: -5.65,
    tipTrailingZ: -6.22,
    rootThickness: 0.15,
    tipThickness: 0.05,
    rudderBottomY: 0.5,
    hingeChord: 0.58,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 3.72 },
      bladeCount: 3,
      bladeLength: 1.32,
      bladeChord: 0.27,
      bladeRootRadius: 0.2,
      bladePitchDeg: 24,
      spinner: { baseZ: 3.55, radius: 0.22, length: 0.4 },
      nacelle: null,
      radialFaceRadius: 0.5,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.8,
    mainZ: -0.4,
    mainWheelCenterY: -1.55,
    mainWheelRadius: 0.36,
    noseZ: 2.75,
    noseWheelRadius: 0.28,
    mainStrutTopY: -0.4,
    noseStrutTopY: -0.62,
    wheelWidth: 0.22,
    strutDiameter: 0.13,
  },
  cockpitEye: { x: 0, y: 1.02, z: 0.45 },
  // Two guns in the engine cowling, firing through the propeller.
  gunMounts: [
    { x: -0.3, y: 0.52, z: 3.3 },
    { x: 0.3, y: 0.52, z: 3.3 },
  ],
  bellyPoint: { x: 0, y: -0.68, z: 0 },
  bandZ: [-3.6, -4.0],
  roundel: { span: 4.95, diameter: 1.0, chord: 0.36 },
  exhaustStacks: { x: 0.6, y: -0.1, firstZ: 2.55, count: 2, spacing: 0.32 },
  tailhook: { pivot: { x: 0, y: -0.3, z: -5.6 }, length: 1.7 },
  rearGun: { pivot: { x: 0, y: 0.84, z: -2.25 }, length: 1.1 },
});

/**
 * Four-engine heavy bomber: long fuselage with a glazed nose, a high
 * aspect-ratio wing carrying four radial engines in nacelles, a tall fin,
 * and dorsal, ventral and tail turrets. 19.7 m long, 24 m span.
 */
export const FOUR_ENGINE_BOMBER_AIRFRAME = defineAirframe({
  id: 'fourEngineBomber',
  fuselage: [
    [0.0, -10.5],
    [0.22, -10.35],
    [0.45, -9.7],
    [0.72, -8.0],
    [0.98, -5.9],
    [1.15, -3.8],
    [1.25, -1.6],
    [1.28, 0.5],
    [1.28, 3.2],
    [1.22, 5.4],
    [1.08, 7.0],
    [0.84, 8.2],
    [0.5, 8.95],
    [0.0, 9.15],
  ],
  glazedNose: [
    [0.86, 8.1],
    [0.52, 8.96],
    [0.0, 9.18],
  ],
  canopy: { center: { x: 0, y: 1.12, z: 5.4 }, width: 1.5, height: 0.7, length: 2.2 },
  turrets: [
    { center: { x: 0, y: 1.25, z: 3.2 }, width: 1.1, height: 1.1, length: 1.1 },
    { center: { x: 0, y: -1.2, z: -1.6 }, width: 1.1, height: 1.1, length: 1.1 },
    { center: { x: 0, y: 0.25, z: -10.25 }, width: 0.76, height: 0.76, length: 0.9 },
  ],
  wing: {
    y: -0.35,
    halfSpan: 12.0,
    rootLeadingZ: 3.3,
    rootTrailingZ: -1.5,
    tipLeadingZ: 1.25,
    tipTrailingZ: -0.35,
    rootThickness: 0.85,
    tipThickness: 0.24,
    dihedralDeg: 4.5,
    trailingEdgeRatio: 0.3,
    flapStart: 1.4,
    flapEnd: 6.2,
    flapHingeChord: 0.72,
    flapHingeDrop: 0.07,
    aileronStart: 8.2,
    aileronEnd: 11.2,
    aileronHingeChord: 0.74,
  },
  tailplane: {
    y: 0.35,
    halfSpan: 5.2,
    rootLeadingZ: -7.4,
    rootTrailingZ: -10.3,
    tipLeadingZ: -9.0,
    tipTrailingZ: -10.05,
    rootThickness: 0.3,
    tipThickness: 0.09,
    elevatorStart: 0.95,
    hingeChord: 0.62,
  },
  fin: {
    rootY: 0.9,
    tipY: 6.0,
    rootLeadingZ: -5.3,
    rootTrailingZ: -10.45,
    tipLeadingZ: -9.1,
    tipTrailingZ: -10.3,
    rootThickness: 0.32,
    tipThickness: 0.1,
    rudderBottomY: 1.4,
    hingeChord: 0.6,
  },
  // Inner engines at 3.5 m, outer at 6.9 m from the centreline, on the wing's leading edge.
  engines: [-6.9, -3.5, 3.5, 6.9].map((x) => {
    const wingY = -0.35 + Math.abs(x) * Math.tan((4.5 * Math.PI) / 180);
    const hubZ = Math.abs(x) < 5 ? 4.6 : 4.0;
    return {
      hub: { x, y: wingY + 0.1, z: hubZ },
      bladeCount: 3,
      bladeLength: 1.5,
      bladeChord: 0.3,
      bladeRootRadius: 0.28,
      bladePitchDeg: 24,
      spinner: { baseZ: hubZ - 0.2, radius: 0.3, length: 0.55 },
      nacelle: { radius: 0.62, length: 5.0 },
      radialFaceRadius: 0.52,
    };
  }),
  // Main wheels retract into the inner nacelles, well behind the centre of
  // mass (15% of the weight on the nose wheel), so the nose comes down
  // firmly once the mains touch.
  landingGear: {
    mainTrackHalfWidth: 3.5,
    mainZ: -1.2,
    mainWheelCenterY: -1.95,
    mainWheelRadius: 0.62,
    noseZ: 6.6,
    noseWheelRadius: 0.42,
    mainStrutTopY: -0.3,
    noseStrutTopY: -0.9,
    wheelWidth: 0.36,
    strutDiameter: 0.2,
  },
  cockpitEye: { x: -0.35, y: 1.45, z: 5.6 },
  // Twin guns in a chin turret under the glazed nose.
  gunMounts: [
    { x: -0.28, y: -0.95, z: 8.4 },
    { x: 0.28, y: -0.95, z: 8.4 },
  ],
  bellyPoint: { x: 0, y: -1.28, z: 0.5 },
  bandZ: [-6.6, -7.2],
  roundel: { span: 9.6, diameter: 1.7, chord: 0.36 },
});

/**
 * Slim, fast interceptor: a long pointed nose over an inline engine, a
 * small, sharply tapered wing, a bubble canopy and a tall narrow fin.
 * 9.6 m long, 10.4 m span.
 */
export const INTERCEPTOR_AIRFRAME = defineAirframe({
  id: 'interceptor',
  fuselage: [
    [0.0, -5.2],
    [0.09, -5.15],
    [0.2, -4.7],
    [0.31, -3.7],
    [0.42, -2.4],
    [0.5, -1.1],
    [0.55, 0.0],
    [0.56, 1.2],
    [0.53, 2.4],
    [0.46, 3.4],
    [0.36, 4.05],
    [0.0, 4.1],
  ],
  canopy: { center: { x: 0, y: 0.5, z: -0.35 }, width: 0.58, height: 0.6, length: 1.6 },
  turrets: [],
  wing: {
    y: -0.36,
    halfSpan: 5.2,
    rootLeadingZ: 1.45,
    rootTrailingZ: -1.1,
    tipLeadingZ: 0.45,
    tipTrailingZ: -0.32,
    rootThickness: 0.28,
    tipThickness: 0.07,
    dihedralDeg: 6,
    trailingEdgeRatio: 0.28,
    flapStart: 0.65,
    flapEnd: 2.8,
    flapHingeChord: 0.74,
    flapHingeDrop: 0.05,
    aileronStart: 3.0,
    aileronEnd: 4.55,
    aileronHingeChord: 0.74,
  },
  tailplane: {
    y: 0.1,
    halfSpan: 1.75,
    rootLeadingZ: -4.05,
    rootTrailingZ: -5.15,
    tipLeadingZ: -4.55,
    tipTrailingZ: -5.0,
    rootThickness: 0.11,
    tipThickness: 0.04,
    elevatorStart: 0.2,
    hingeChord: 0.62,
  },
  fin: {
    rootY: 0.22,
    tipY: 2.05,
    rootLeadingZ: -3.75,
    rootTrailingZ: -5.18,
    tipLeadingZ: -4.75,
    tipTrailingZ: -5.1,
    rootThickness: 0.13,
    tipThickness: 0.04,
    rudderBottomY: 0.4,
    hingeChord: 0.6,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 4.3 },
      bladeCount: 4,
      bladeLength: 1.2,
      bladeChord: 0.2,
      bladeRootRadius: 0.18,
      bladePitchDeg: 24,
      spinner: { baseZ: 4.02, radius: 0.27, length: 0.85 },
      nacelle: null,
      radialFaceRadius: 0,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.1,
    mainZ: -0.35,
    mainWheelCenterY: -1.45,
    mainWheelRadius: 0.33,
    noseZ: 3.05,
    noseWheelRadius: 0.25,
    mainStrutTopY: -0.3,
    noseStrutTopY: -0.5,
    wheelWidth: 0.18,
    strutDiameter: 0.1,
  },
  cockpitEye: { x: 0, y: 0.9, z: -0.45 },
  gunMounts: [
    { x: -2.1, y: -0.2, z: 1.0 },
    { x: 2.1, y: -0.2, z: 1.0 },
    { x: -2.7, y: -0.17, z: 0.85 },
    { x: 2.7, y: -0.17, z: 0.85 },
  ],
  bellyPoint: { x: 0, y: -0.72, z: -0.2 },
  bandZ: [-3.0, -3.35],
  roundel: { span: 3.4, diameter: 0.8, chord: 0.4 },
  // Radiators under each wing root.
  radiatorScoop: { center: { x: 0, y: -0.62, z: -0.5 }, width: 0.5, height: 0.26, depth: 1.1 },
  exhaustStacks: { x: 0.5, y: 0.2, firstZ: 2.9, count: 4, spacing: 0.28 },
  tailhook: { pivot: { x: 0, y: -0.18, z: -4.7 }, length: 1.7 },
});

/**
 * Old-school fighting triplane: three short stacked wings joined by struts,
 * a rotary engine in a round cowling, a two-blade wooden propeller, twin
 * guns on the cowling, an open cockpit and fixed gear. 5.8 m long, 7.2 m
 * span. Slow, but it turns on a sixpence. The top wing carries the ailerons
 * and the national markings.
 */
export const TRIPLANE_AIRFRAME = defineAirframe({
  id: 'triplane',
  fuselage: [
    [0.0, -3.6],
    [0.08, -3.55],
    [0.2, -2.9],
    [0.33, -1.8],
    [0.44, -0.6],
    [0.5, 0.4],
    [0.53, 1.2],
    [0.56, 1.75],
    [0.5, 1.98],
    [0.0, 2.0],
  ],
  canopy: { center: { x: 0, y: 0.52, z: -0.2 }, width: 0.42, height: 0.24, length: 0.36 },
  turrets: [],
  wing: {
    y: 1.15,
    halfSpan: 3.6,
    rootLeadingZ: 0.95,
    rootTrailingZ: -0.15,
    tipLeadingZ: 0.85,
    tipTrailingZ: -0.05,
    rootThickness: 0.13,
    tipThickness: 0.09,
    dihedralDeg: 0,
    trailingEdgeRatio: 0.35,
    // No flaps to see (the lever still adds a little lift: a gameplay assist).
    flapStart: 0.4,
    flapEnd: 0.4,
    flapHingeChord: 0.75,
    flapHingeDrop: 0,
    aileronStart: 2.3,
    aileronEnd: 3.4,
    aileronHingeChord: 0.72,
  },
  extraWings: [
    { y: 0.28, halfSpan: 3.15, rootLeadingZ: 0.75, rootTrailingZ: -0.35, tipLeadingZ: 0.65, tipTrailingZ: -0.25, rootThickness: 0.12, tipThickness: 0.08, dihedralDeg: 0, trailingEdgeRatio: 0.35, tipStart: 2.95 },
    { y: -0.55, halfSpan: 2.85, rootLeadingZ: 0.6, rootTrailingZ: -0.5, tipLeadingZ: 0.5, tipTrailingZ: -0.4, rootThickness: 0.12, tipThickness: 0.08, dihedralDeg: 1, trailingEdgeRatio: 0.35, tipStart: 2.65 },
  ],
  struts: [
    // Interplane struts, through all three wings.
    { from: { x: 2.35, y: -0.53, z: 0.05 }, to: { x: 2.35, y: 1.15, z: 0.4 }, diameter: 0.07 },
    // Cabane struts from the fuselage to the top wing.
    { from: { x: 0.3, y: 0.45, z: 0.75 }, to: { x: 0.45, y: 1.15, z: 0.75 }, diameter: 0.05 },
    { from: { x: 0.3, y: 0.45, z: 0.05 }, to: { x: 0.45, y: 1.15, z: 0.05 }, diameter: 0.05 },
  ],
  tailplane: {
    y: 0.05,
    halfSpan: 1.25,
    rootLeadingZ: -2.85,
    rootTrailingZ: -3.55,
    tipLeadingZ: -3.1,
    tipTrailingZ: -3.5,
    rootThickness: 0.08,
    tipThickness: 0.04,
    elevatorStart: 0.15,
    hingeChord: 0.5,
  },
  fin: {
    rootY: 0.1,
    tipY: 1.0,
    rootLeadingZ: -3.0,
    rootTrailingZ: -3.6,
    tipLeadingZ: -3.45,
    tipTrailingZ: -3.62,
    rootThickness: 0.08,
    tipThickness: 0.04,
    rudderBottomY: 0.16,
    hingeChord: 0.45,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 2.08 },
      bladeCount: 2,
      bladeLength: 1.0,
      bladeChord: 0.17,
      bladeRootRadius: 0.12,
      bladePitchDeg: 20,
      spinner: { baseZ: 1.99, radius: 0.12, length: 0.16 },
      nacelle: null,
      radialFaceRadius: 0.45,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.1,
    mainZ: -0.3,
    mainWheelCenterY: -1.05,
    mainWheelRadius: 0.33,
    noseZ: 1.8,
    noseWheelRadius: 0.22,
    mainStrutTopY: -0.45,
    noseStrutTopY: -0.42,
    wheelWidth: 0.12,
    strutDiameter: 0.07,
  },
  fixedGear: true,
  cockpitEye: { x: 0, y: 0.78, z: -0.5 },
  // Twin guns on top of the cowling, firing through the propeller.
  gunMounts: [
    { x: -0.13, y: 0.5, z: 1.55 },
    { x: 0.13, y: 0.5, z: 1.55 },
  ],
  bellyPoint: { x: 0, y: -0.5, z: 0.0 },
  bandZ: [-2.0, -2.25],
  roundel: { span: 2.7, diameter: 0.75, chord: 0.42 },
  tailhook: { pivot: { x: 0, y: -0.12, z: -3.0 }, length: 1.3 },
});

/**
 * 1930s biplane fighter: two staggered wings with N-struts, a radial engine
 * in a cowling, an enclosed cockpit, four guns and fixed gear. 8.3 m long,
 * 9.8 m span. Light and nimble; not fast.
 */
export const BIPLANE_AIRFRAME = defineAirframe({
  id: 'biplane',
  fuselage: [
    [0.0, -4.6],
    [0.08, -4.55],
    [0.22, -4.0],
    [0.37, -2.8],
    [0.5, -1.4],
    [0.58, 0.0],
    [0.62, 1.4],
    [0.67, 2.4],
    [0.63, 2.88],
    [0.0, 2.92],
  ],
  canopy: { center: { x: 0, y: 0.6, z: -0.55 }, width: 0.55, height: 0.36, length: 0.85 },
  turrets: [],
  wing: {
    y: 1.25,
    halfSpan: 4.9,
    rootLeadingZ: 1.15,
    rootTrailingZ: -0.45,
    tipLeadingZ: 1.0,
    tipTrailingZ: -0.3,
    rootThickness: 0.16,
    tipThickness: 0.1,
    dihedralDeg: 2,
    trailingEdgeRatio: 0.3,
    flapStart: 0.75,
    flapEnd: 2.3,
    flapHingeChord: 0.75,
    flapHingeDrop: 0.03,
    aileronStart: 3.0,
    aileronEnd: 4.65,
    aileronHingeChord: 0.74,
  },
  extraWings: [{ y: -0.5, halfSpan: 4.5, rootLeadingZ: 0.7, rootTrailingZ: -0.85, tipLeadingZ: 0.55, tipTrailingZ: -0.7, rootThickness: 0.15, tipThickness: 0.09, dihedralDeg: 4, trailingEdgeRatio: 0.3, tipStart: 4.25 }],
  struts: [
    // N-struts between the wings, front and rear.
    { from: { x: 3.0, y: -0.29, z: 0.42 }, to: { x: 3.0, y: 1.36, z: 0.82 }, diameter: 0.07 },
    { from: { x: 3.0, y: -0.29, z: -0.48 }, to: { x: 3.0, y: 1.36, z: -0.08 }, diameter: 0.07 },
    // Cabane struts.
    { from: { x: 0.38, y: 0.55, z: 0.95 }, to: { x: 0.45, y: 1.25, z: 0.95 }, diameter: 0.05 },
    { from: { x: 0.38, y: 0.55, z: 0.0 }, to: { x: 0.45, y: 1.25, z: 0.05 }, diameter: 0.05 },
  ],
  tailplane: {
    y: 0.15,
    halfSpan: 1.7,
    rootLeadingZ: -3.6,
    rootTrailingZ: -4.5,
    tipLeadingZ: -3.95,
    tipTrailingZ: -4.4,
    rootThickness: 0.1,
    tipThickness: 0.04,
    elevatorStart: 0.18,
    hingeChord: 0.55,
  },
  fin: {
    rootY: 0.15,
    tipY: 1.45,
    rootLeadingZ: -3.75,
    rootTrailingZ: -4.6,
    tipLeadingZ: -4.25,
    tipTrailingZ: -4.6,
    rootThickness: 0.1,
    tipThickness: 0.04,
    rudderBottomY: 0.2,
    hingeChord: 0.5,
  },
  engines: [
    {
      hub: { x: 0, y: 0, z: 3.02 },
      bladeCount: 3,
      bladeLength: 1.22,
      bladeChord: 0.2,
      bladeRootRadius: 0.18,
      bladePitchDeg: 24,
      spinner: { baseZ: 2.9, radius: 0.18, length: 0.3 },
      nacelle: null,
      radialFaceRadius: 0.58,
    },
  ],
  landingGear: {
    mainTrackHalfWidth: 1.3,
    mainZ: -0.3,
    mainWheelCenterY: -1.4,
    mainWheelRadius: 0.32,
    noseZ: 2.3,
    noseWheelRadius: 0.24,
    mainStrutTopY: -0.45,
    noseStrutTopY: -0.55,
    wheelWidth: 0.16,
    strutDiameter: 0.09,
  },
  fixedGear: true,
  cockpitEye: { x: 0, y: 0.95, z: -0.75 },
  gunMounts: [
    { x: -0.2, y: 0.55, z: 2.2 },
    { x: 0.2, y: 0.55, z: 2.2 },
    { x: -2.0, y: -0.48, z: 0.72 },
    { x: 2.0, y: -0.48, z: 0.72 },
  ],
  bellyPoint: { x: 0, y: -0.62, z: 0.3 },
  bandZ: [-2.6, -2.95],
  roundel: { span: 3.5, diameter: 0.92, chord: 0.42 },
  exhaustStacks: { x: 0.62, y: -0.2, firstZ: 2.3, count: 2, spacing: 0.3 },
  tailhook: { pivot: { x: 0, y: -0.2, z: -3.9 }, length: 1.6 },
});

export const AIRFRAMES: Readonly<Record<AirframeId, Airframe>> = {
  fighter: FIGHTER_AIRFRAME,
  interceptor: INTERCEPTOR_AIRFRAME,
  triplane: TRIPLANE_AIRFRAME,
  biplane: BIPLANE_AIRFRAME,
  navalFighter: NAVAL_FIGHTER_AIRFRAME,
  diveBomber: DIVE_BOMBER_AIRFRAME,
  fourEngineBomber: FOUR_ENGINE_BOMBER_AIRFRAME,
};

/** The wingspan every other size is compared with: the fighter's (m). */
export const REFERENCE_WING_SPAN = FIGHTER_AIRFRAME.wingSpan;

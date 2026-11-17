/**
 * Aircraft class definitions: pure data, read by the flight model on both
 * client and server.
 *
 * Only *physical and handling inputs* are configured here. Headline figures
 * such as stall speed, top speed, climb rate and maximum turn rate are
 * *derived* from these by `flight/performance.ts`, so they can never
 * contradict each other. The derived table is in docs/FLIGHT_MODEL.md.
 * Change wing area or mass to change stall speed; change power to change top
 * speed and climb.
 */

import { AIRFRAMES, REFERENCE_WING_SPAN, type Airframe } from './airframe';

export type AircraftClassId = 'interceptor' | 'fighterBomber' | 'heavyBomber' | 'navalFighter' | 'diveBomber' | 'triplane' | 'biplane';

export interface AircraftClassSpec {
  readonly id: AircraftClassId;
  readonly displayName: string;

  /** Total mass including fuel and pilot (kg). */
  readonly mass: number;
  /** Shape: wheels, crash points, guns and the visual model all come from it. */
  readonly airframe: Airframe;
  /** Multiplies the airframe geometry (wheels, crash points, visual model). */
  readonly airframeScale: number;
  /** Where it spawns: the island airfield, or the deck of the team's carrier (needs an arrestor hook to land back on it). */
  readonly homeBase: 'airfield' | 'carrier';
  /** Wing reference area S (m^2). */
  readonly wingArea: number;
  /**
   * Moments of inertia (kg*m^2) about the pitch, yaw and roll axes. Used to turn
   * ground-contact forces into rotation. Aerodynamic handling is configured
   * directly as response rates in `handling`.
   */
  readonly momentOfInertia: { readonly pitch: number; readonly yaw: number; readonly roll: number };

  readonly engine: {
    /** Thrust at zero airspeed with full throttle (N). */
    readonly staticThrust: number;
    /** Engine shaft power at full throttle (W). With a propeller, thrust is roughly efficiency * power / airspeed. */
    readonly maxPower: number;
    readonly propellerEfficiency: number;
    /** Time constant for the engine to follow the throttle lever (s). */
    readonly spoolTime: number;
  };

  readonly aero: {
    /** Lift coefficient at zero angle of attack (wing camber and incidence). */
    readonly zeroAngleLiftCoefficient: number;
    /** dCL/d(alpha), per radian. A finite wing is roughly 2*pi*AR/(AR+2). */
    readonly liftCurveSlope: number;
    /** Angle of attack where airflow separates from the wing: the stall (deg). */
    readonly criticalAngleOfAttackDeg: number;
    /** Flow only re-attaches once AoA drops this far below critical (deg), so recovery needs a real push. */
    readonly stallHysteresisDeg: number;
    /** Lift of the fully stalled wing, as a multiple of flat-plate lift sin(2*alpha). */
    readonly separatedLiftScale: number;
    /** Drag coefficient with zero lift (skin friction, fixed gear, canopy). */
    readonly zeroLiftDragCoefficient: number;
    /** Oswald span efficiency for induced drag (0.7-0.85 for straight wings). */
    readonly oswaldEfficiency: number;
    /** Extra pressure drag of fully separated flow, multiplied by sin^2(alpha). */
    readonly separatedDragCoefficient: number;
    /** Fuselage side force per radian of sideslip; it is what turns velocity towards the nose after a yaw. */
    readonly sideForceCoefficient: number;
    /** Extra drag per radian^2 of sideslip. */
    readonly sideslipDragCoefficient: number;
  };

  /**
   * Trailing-edge flaps. Lowering them adds camber to the inner wing: more
   * lift at the same angle of attack (lower stall speed, slower and steeper
   * approaches), at the cost of drag.
   */
  readonly flaps: {
    /** Lift coefficient added at full deflection. */
    readonly liftIncrement: number;
    /** Zero-lift drag coefficient added at full deflection. */
    readonly dragIncrement: number;
    /** Flapped wings stall at a slightly lower angle of attack (deg, at full deflection). */
    readonly criticalAngleReductionDeg: number;
    /**
     * Hands-off angle-of-attack change at full flap (deg). Real pilots re-trim
     * when they lower flaps; this does it for them, so the aircraft settles
     * near a sensible approach speed without holding the stick back.
     */
    readonly trimShiftDeg: number;
    /** Above this airspeed the airflow blows the flaps back up, as on a real aircraft (m/s). */
    readonly maxExtensionSpeed: number;
    /** Seconds for the flaps to travel from fully up to fully down. */
    readonly travelTime: number;
  };

  /**
   * Air brakes (B): plates that open into the airflow, adding drag but no
   * lift, so you can slow down in the air with the engine still running.
   * Every class has them (a gameplay addition: most WWII fighters didn't);
   * the Dive Bomber's real dive brakes are by far the strongest, holding a
   * steep dive to a steady, aimable speed.
   */
  readonly airbrake?: {
    /** Zero-lift drag coefficient added when fully open. */
    readonly dragIncrement: number;
    /** Seconds to open fully. */
    readonly travelTime: number;
  };

  /**
   * Handling, expressed at `referenceSpeed` at sea level. It scales with
   * dynamic pressure elsewhere. Roll and pitch response are on the brisk
   * side of the real aircraft: quick direction changes matter more here
   * than an exact match to the history books.
   */
  readonly handling: {
    /** Speed at which the handling figures below apply (m/s). */
    readonly referenceSpeed: number;
    readonly pitch: {
      /** Natural frequency of the nose's "spring" towards the trimmed angle of attack (rad/s). Higher = snappier. */
      readonly frequency: number;
      readonly dampingRatio: number;
      /** Angle of attack that full back stick settles at. Above critical AoA, so full back stick can stall. */
      readonly fullStickAngleOfAttackDeg: number;
      /** Hands-off angle of attack. Sets the hands-off cruise speed. */
      readonly trimAngleOfAttackDeg: number;
    };
    readonly roll: {
      /** Steady roll rate with full aileron (deg/s). */
      readonly maxRateDeg: number;
      /** Time to reach about 63% of that rate (s). */
      readonly responseTime: number;
    };
    readonly yaw: {
      readonly frequency: number;
      readonly dampingRatio: number;
      /** Sideslip angle that full rudder settles at (deg). */
      readonly fullRudderSideslipDeg: number;
    };
    /** Roll acceleration per radian of sideslip (rad/s^2): the dihedral effect that makes rudder also roll the aircraft. */
    readonly dihedralEffect: number;
    /** Extra nose-down pitch acceleration when fully stalled (rad/s^2). */
    readonly stallPitchDown: number;
    /** The pilot can't pull more than this many g. Back pressure fades out above it (structural and blackout limit). */
    readonly gLimit: number;
    readonly negativeGLimit: number;
  };

  readonly landingGear: {
    /** How far the tyres and struts compress under the aircraft's weight at rest (m, at scale 1). */
    readonly staticDeflection: number;
    /**
     * How sharply the oleo struts stiffen beyond their resting compression
     * (their air spring compresses). Stops hard braking or landing from
     * bottoming out the nose leg into a propeller strike.
     */
    readonly strutProgression: number;
    /** Compression beyond this collapses the gear: a crash (m, at scale 1). */
    readonly maxCompression: number;
    /** Touching down faster than this vertically is a crash (m/s). */
    readonly maxSinkRate: number;
    /** Touchdowns faster than this damage the hull, rising to 70% damage just below `maxSinkRate` (m/s). */
    readonly damageSinkRate: number;
    /** Maximum nose-wheel steering angle at taxi speed (deg). */
    readonly maxSteeringDeg: number;
    /** Steering authority fades to 20% by this ground speed (m/s), as on real aircraft. */
    readonly steeringFadeSpeed: number;
  };

  /** Combat data. Used from Phase 4. */
  readonly combat: {
    readonly maxHullHealth: number;
    readonly gunCount: number;
    readonly bombCapacity: number;
  };
}

/**
 * Rough moments of inertia from mass and size: I = m * k^2, where k is the
 * radius of gyration. A fighter-sized airframe (10.6 m span) has k of about
 * 2.6 m (pitch), 3.2 m (yaw) and 2.4 m (roll); k grows in proportion to span.
 */
function estimateInertia(mass: number, airframe: Airframe, scale: number): AircraftClassSpec['momentOfInertia'] {
  const size = (airframe.wingSpan * scale) / REFERENCE_WING_SPAN;
  return {
    pitch: mass * (2.6 * size) ** 2,
    yaw: mass * (3.2 * size) ** 2,
    roll: mass * (2.4 * size) ** 2,
  };
}

const COMMON_AERO = {
  zeroAngleLiftCoefficient: 0.15,
  liftCurveSlope: 4.6,
  // Generous for propeller-era wings (real ones stall nearer 15 degrees): more
  // lift before the stall means quicker turns, which matter more here.
  criticalAngleOfAttackDeg: 18,
  stallHysteresisDeg: 3,
  separatedLiftScale: 1.1,
  oswaldEfficiency: 0.8,
  separatedDragCoefficient: 1.2,
  sideForceCoefficient: 0.9,
  sideslipDragCoefficient: 0.6,
} as const;

const COMMON_GEAR = {
  staticDeflection: 0.1,
  strutProgression: 3,
  maxCompression: 0.3,
  maxSinkRate: 7.5,
  damageSinkRate: 3,
  maxSteeringDeg: 35,
  steeringFadeSpeed: 30,
} as const;

/**
 * Speed brakes for the classes that historically had none: enough drag to
 * slow down at full throttle at cruise speed (about 0.3 g at 450 km/h).
 */
const SPEED_BRAKES = { dragIncrement: 0.08, travelTime: 0.8 } as const;

/** Split flaps on the inner wing, typical of propeller-era fighters. */
const COMMON_FLAPS = {
  liftIncrement: 0.6,
  dragIncrement: 0.035,
  criticalAngleReductionDeg: 2,
  trimShiftDeg: 3,
  maxExtensionSpeed: 75, // 270 km/h
  travelTime: 3,
} as const;

/** Light, fast, agile; low armour; guns only. */
const INTERCEPTOR: AircraftClassSpec = {
  id: 'interceptor',
  displayName: 'Interceptor',
  mass: 2_900,
  airframe: AIRFRAMES.interceptor,
  airframeScale: 1,
  homeBase: 'airfield',
  wingArea: 17.5,
  momentOfInertia: estimateInertia(2_900, AIRFRAMES.interceptor, 1),
  engine: { staticThrust: 17_000, maxPower: 1_300_000, propellerEfficiency: 0.82, spoolTime: 0.7 },
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.021 },
  airbrake: SPEED_BRAKES,
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.55, travelTime: 2.5 },
  handling: {
    referenceSpeed: 100,
    pitch: { frequency: 4.8, dampingRatio: 0.55, fullStickAngleOfAttackDeg: 21, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 216, responseTime: 0.144 },
    yaw: { frequency: 2.8, dampingRatio: 0.5, fullRudderSideslipDeg: 9 },
    dihedralEffect: 5,
    stallPitchDown: 3,
    gLimit: 9,
    negativeGLimit: 4,
  },
  landingGear: COMMON_GEAR,
  combat: { maxHullHealth: 100, gunCount: 4, bombCapacity: 0 },
};

/** Balanced speed, manoeuvrability and armour; guns and three bombs. */
const FIGHTER_BOMBER: AircraftClassSpec = {
  id: 'fighterBomber',
  displayName: 'Fighter-Bomber',
  mass: 4_300,
  airframe: AIRFRAMES.fighter,
  airframeScale: 1,
  homeBase: 'airfield',
  wingArea: 22.5,
  momentOfInertia: estimateInertia(4_300, AIRFRAMES.fighter, 1),
  engine: { staticThrust: 20_000, maxPower: 1_650_000, propellerEfficiency: 0.82, spoolTime: 0.9 },
  // Bomb racks and a bigger radiator add drag.
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.024 },
  airbrake: SPEED_BRAKES,
  flaps: COMMON_FLAPS,
  handling: {
    referenceSpeed: 105,
    pitch: { frequency: 3.84, dampingRatio: 0.6, fullStickAngleOfAttackDeg: 21, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 162, responseTime: 0.2 },
    yaw: { frequency: 2.3, dampingRatio: 0.55, fullRudderSideslipDeg: 8 },
    dihedralEffect: 5,
    stallPitchDown: 2.5,
    gLimit: 8,
    negativeGLimit: 3.5,
  },
  landingGear: COMMON_GEAR,
  combat: { maxHullHealth: 180, gunCount: 4, bombCapacity: 3 },
};

/**
 * Four engines, a 24 m wing: slow to accelerate, sluggish, heavily armoured;
 * a twin-gun chin turret and eight bombs.
 */
const HEAVY_BOMBER: AircraftClassSpec = {
  id: 'heavyBomber',
  displayName: 'Heavy Bomber',
  mass: 14_000,
  airframe: AIRFRAMES.fourEngineBomber,
  airframeScale: 1,
  homeBase: 'airfield',
  wingArea: 70,
  momentOfInertia: estimateInertia(14_000, AIRFRAMES.fourEngineBomber, 1),
  // Four radial engines of about 880 kW each.
  engine: { staticThrust: 46_000, maxPower: 3_500_000, propellerEfficiency: 0.8, spoolTime: 1.6 },
  // Turrets, nacelles and a deep fuselage add drag.
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.03 },
  airbrake: { ...SPEED_BRAKES, travelTime: 1.2 },
  // Big Fowler-style flaps: more lift, slower to move, blown up at a lower speed.
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.75, maxExtensionSpeed: 70, travelTime: 4 },
  handling: {
    referenceSpeed: 95,
    pitch: { frequency: 1.8, dampingRatio: 0.7, fullStickAngleOfAttackDeg: 20, trimAngleOfAttackDeg: 3 },
    roll: { maxRateDeg: 55, responseTime: 0.5 },
    yaw: { frequency: 1.4, dampingRatio: 0.6, fullRudderSideslipDeg: 6 },
    dihedralEffect: 4,
    stallPitchDown: 1.5,
    gLimit: 3.5,
    negativeGLimit: 1.5,
  },
  // Sturdier undercarriage, but a big aircraft must arrive gently.
  landingGear: { ...COMMON_GEAR, maxSinkRate: 6.5, damageSinkRate: 2.5, maxSteeringDeg: 30 },
  combat: { maxHullHealth: 600, gunCount: 2, bombCapacity: 8 },
};

/**
 * Carrier fighter: lifts off within a carrier deck, lands slowly on strong
 * gear and catches the arrestor wires with its hook. Agile, four guns, no bombs.
 */
const NAVAL_FIGHTER: AircraftClassSpec = {
  id: 'navalFighter',
  displayName: 'Naval Fighter',
  mass: 4_600,
  airframe: AIRFRAMES.navalFighter,
  airframeScale: 1,
  homeBase: 'carrier',
  // A big wing for its weight: low stall speed for short take-offs and slow approaches.
  wingArea: 29,
  momentOfInertia: estimateInertia(4_600, AIRFRAMES.navalFighter, 1),
  engine: { staticThrust: 24_000, maxPower: 1_500_000, propellerEfficiency: 0.82, spoolTime: 0.8 },
  // The big radial engine's frontal area adds drag.
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.025 },
  airbrake: SPEED_BRAKES,
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.7, dragIncrement: 0.04, travelTime: 2.5 },
  handling: {
    referenceSpeed: 100,
    pitch: { frequency: 4.08, dampingRatio: 0.68, fullStickAngleOfAttackDeg: 22, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 182, responseTime: 0.176 },
    yaw: { frequency: 2.5, dampingRatio: 0.52, fullRudderSideslipDeg: 9 },
    dihedralEffect: 5,
    stallPitchDown: 2.5,
    gLimit: 8,
    negativeGLimit: 3.5,
  },
  // Carrier gear: built for firm arrivals on a deck.
  landingGear: { ...COMMON_GEAR, maxSinkRate: 9.5, damageSinkRate: 4.5 },
  combat: { maxHullHealth: 160, gunCount: 4, bombCapacity: 0 },
};

/**
 * Carrier dive bomber: dive brakes hold a near-vertical dive to a steady
 * speed for aiming its one heavy bomb. Sturdy, two forward guns.
 */
const DIVE_BOMBER: AircraftClassSpec = {
  id: 'diveBomber',
  displayName: 'Dive Bomber',
  mass: 4_900,
  airframe: AIRFRAMES.diveBomber,
  airframeScale: 1,
  homeBase: 'carrier',
  wingArea: 30.2,
  momentOfInertia: estimateInertia(4_900, AIRFRAMES.diveBomber, 1),
  engine: { staticThrust: 19_000, maxPower: 1_050_000, propellerEfficiency: 0.8, spoolTime: 1 },
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.027 },
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.62, travelTime: 3 },
  // Fully open, the brakes hold a vertical dive to about 450 km/h at low altitude.
  airbrake: { dragIncrement: 0.16, travelTime: 1.5 },
  handling: {
    referenceSpeed: 95,
    // Full back stick commands a high angle of attack: a dive bomber must pull hard out of its dive at modest speeds.
    pitch: { frequency: 3.6, dampingRatio: 0.6, fullStickAngleOfAttackDeg: 24, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 122, responseTime: 0.24 },
    yaw: { frequency: 2.1, dampingRatio: 0.56, fullRudderSideslipDeg: 8 },
    dihedralEffect: 5,
    stallPitchDown: 2.2,
    gLimit: 6.5,
    negativeGLimit: 3,
  },
  landingGear: { ...COMMON_GEAR, maxSinkRate: 9, damageSinkRate: 4 },
  combat: { maxHullHealth: 230, gunCount: 2, bombCapacity: 1 },
};

/**
 * Old-school fighting triplane: 590 kg, a 110 kW rotary engine, three short
 * wings. Its wing loading is a fifth of a WWII fighter's, so it stalls at
 * about 70 km/h and turns inside anything, but it tops out near 190 km/h:
 * fight it slow. Two light guns. Draggy (struts, wires, fixed gear).
 */
const TRIPLANE: AircraftClassSpec = {
  id: 'triplane',
  displayName: 'Triplane',
  mass: 590,
  airframe: AIRFRAMES.triplane,
  airframeScale: 1,
  homeBase: 'airfield',
  // All three wings together.
  wingArea: 18.7,
  momentOfInertia: estimateInertia(590, AIRFRAMES.triplane, 1),
  engine: { staticThrust: 2_200, maxPower: 120_000, propellerEfficiency: 0.72, spoolTime: 0.5 },
  // Short, stacked wings: a gentler lift slope. Struts, wires and fixed gear: lots of drag. Three wings
  // sharing the lift make less induced drag than one wing of the same span and total area (Munk's span factor).
  aero: { ...COMMON_AERO, liftCurveSlope: 3.8, zeroLiftDragCoefficient: 0.042, oswaldEfficiency: 1 },
  // A light aircraft with a lot of propeller thrust at low speed: bigger brakes to slow it.
  airbrake: { ...SPEED_BRAKES, dragIncrement: 0.088 },
  // Real triplanes had no flaps; the lever adds lift all the same (a gameplay assist, nothing to see).
  // No re-trim with flap: it approaches faster relative to its stall (it bleeds speed fast in the flare).
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.5, dragIncrement: 0.015, criticalAngleReductionDeg: 1, trimShiftDeg: 0, maxExtensionSpeed: 42, travelTime: 1.5 },
  handling: {
    referenceSpeed: 50,
    pitch: { frequency: 4.2, dampingRatio: 0.55, fullStickAngleOfAttackDeg: 21, trimAngleOfAttackDeg: 4 },
    roll: { maxRateDeg: 150, responseTime: 0.2 },
    yaw: { frequency: 3, dampingRatio: 0.45, fullRudderSideslipDeg: 10 },
    dihedralEffect: 3,
    stallPitchDown: 2,
    // Their wings were famously fragile.
    gLimit: 5.5,
    negativeGLimit: 3,
  },
  // Light and short-coupled: nose-wheel steering fades early with speed, so a fast taxi turn can't tip it over.
  landingGear: { ...COMMON_GEAR, steeringFadeSpeed: 8 },
  combat: { maxHullHealth: 60, gunCount: 2, bombCapacity: 0 },
};

/**
 * 1930s biplane fighter: 2.1 t, a 700 kW radial, two wings of 30 m^2.
 * Nimble and gentle, with fixed gear; about 380 km/h flat out. Four guns.
 */
const BIPLANE: AircraftClassSpec = {
  id: 'biplane',
  displayName: 'Biplane',
  mass: 2_100,
  airframe: AIRFRAMES.biplane,
  airframeScale: 1,
  homeBase: 'airfield',
  wingArea: 30,
  momentOfInertia: estimateInertia(2_100, AIRFRAMES.biplane, 1),
  engine: { staticThrust: 10_000, maxPower: 700_000, propellerEfficiency: 0.78, spoolTime: 0.8 },
  aero: { ...COMMON_AERO, liftCurveSlope: 4.0, zeroLiftDragCoefficient: 0.026, oswaldEfficiency: 0.95 },
  airbrake: SPEED_BRAKES,
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.5, dragIncrement: 0.015, criticalAngleReductionDeg: 1, trimShiftDeg: 1, maxExtensionSpeed: 60, travelTime: 2 },
  handling: {
    referenceSpeed: 75,
    pitch: { frequency: 4.4, dampingRatio: 0.6, fullStickAngleOfAttackDeg: 21, trimAngleOfAttackDeg: 3 },
    roll: { maxRateDeg: 190, responseTime: 0.16 },
    yaw: { frequency: 2.6, dampingRatio: 0.5, fullRudderSideslipDeg: 9 },
    dihedralEffect: 4,
    stallPitchDown: 2.2,
    gLimit: 7.5,
    negativeGLimit: 3.5,
  },
  landingGear: { ...COMMON_GEAR, steeringFadeSpeed: 8 },
  combat: { maxHullHealth: 110, gunCount: 4, bombCapacity: 0 },
};

export const AIRCRAFT_CLASSES: Readonly<Record<AircraftClassId, AircraftClassSpec>> = {
  interceptor: INTERCEPTOR,
  fighterBomber: FIGHTER_BOMBER,
  heavyBomber: HEAVY_BOMBER,
  navalFighter: NAVAL_FIGHTER,
  diveBomber: DIVE_BOMBER,
  triplane: TRIPLANE,
  biplane: BIPLANE,
};

/** In selection order (keys 1-7). */
export const AIRCRAFT_CLASS_IDS: readonly AircraftClassId[] = ['interceptor', 'fighterBomber', 'heavyBomber', 'navalFighter', 'diveBomber', 'triplane', 'biplane'];

/** True if the class has an arrestor hook, so it can land on a carrier. */
export function hasTailhook(spec: AircraftClassSpec): boolean {
  return spec.airframe.tailhook !== undefined;
}

/** Centre of mass to the bottom of the wheels, for this class's airframe and scale (m). */
export function groundClearance(spec: AircraftClassSpec): number {
  return spec.airframe.groundClearance * spec.airframeScale;
}

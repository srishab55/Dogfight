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

export type AircraftClassId = 'interceptor' | 'fighterBomber' | 'heavyBomber';

export interface AircraftClassSpec {
  readonly id: AircraftClassId;
  readonly displayName: string;

  /** Total mass including fuel and pilot (kg). */
  readonly mass: number;
  /** Multiplies the primitive airframe geometry (wheels, crash points, visual model). */
  readonly airframeScale: number;
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

  /** Handling, expressed at `referenceSpeed` at sea level. It scales with dynamic pressure elsewhere. */
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
 * radius of gyration. A fighter-sized airframe at scale 1 has k of about 2.6 m
 * (pitch), 3.2 m (yaw) and 2.4 m (roll).
 */
function estimateInertia(mass: number, scale: number): AircraftClassSpec['momentOfInertia'] {
  return {
    pitch: mass * (2.6 * scale) ** 2,
    yaw: mass * (3.2 * scale) ** 2,
    roll: mass * (2.4 * scale) ** 2,
  };
}

const COMMON_AERO = {
  zeroAngleLiftCoefficient: 0.15,
  liftCurveSlope: 4.6,
  criticalAngleOfAttackDeg: 15,
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
  airframeScale: 0.92,
  wingArea: 17.5,
  momentOfInertia: estimateInertia(2_900, 0.92),
  engine: { staticThrust: 17_000, maxPower: 1_300_000, propellerEfficiency: 0.82, spoolTime: 0.7 },
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.021 },
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.55, travelTime: 2.5 },
  handling: {
    referenceSpeed: 100,
    pitch: { frequency: 4.0, dampingRatio: 0.55, fullStickAngleOfAttackDeg: 18, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 160, responseTime: 0.18 },
    yaw: { frequency: 2.8, dampingRatio: 0.5, fullRudderSideslipDeg: 9 },
    dihedralEffect: 5,
    stallPitchDown: 3,
    gLimit: 8,
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
  airframeScale: 1,
  wingArea: 22.5,
  momentOfInertia: estimateInertia(4_300, 1),
  engine: { staticThrust: 20_000, maxPower: 1_650_000, propellerEfficiency: 0.82, spoolTime: 0.9 },
  // Bomb racks and a bigger radiator add drag.
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.024 },
  flaps: COMMON_FLAPS,
  handling: {
    referenceSpeed: 105,
    pitch: { frequency: 3.2, dampingRatio: 0.6, fullStickAngleOfAttackDeg: 18, trimAngleOfAttackDeg: 2.5 },
    roll: { maxRateDeg: 120, responseTime: 0.25 },
    yaw: { frequency: 2.3, dampingRatio: 0.55, fullRudderSideslipDeg: 8 },
    dihedralEffect: 5,
    stallPitchDown: 2.5,
    gLimit: 7,
    negativeGLimit: 3.5,
  },
  landingGear: COMMON_GEAR,
  combat: { maxHullHealth: 180, gunCount: 4, bombCapacity: 3 },
};

/** Slow to accelerate, sluggish, heavily armoured; dual guns and eight bombs. */
const HEAVY_BOMBER: AircraftClassSpec = {
  id: 'heavyBomber',
  displayName: 'Heavy Bomber',
  mass: 10_500,
  airframeScale: 1.45,
  wingArea: 50,
  momentOfInertia: estimateInertia(10_500, 1.45),
  engine: { staticThrust: 34_000, maxPower: 2_600_000, propellerEfficiency: 0.8, spoolTime: 1.4 },
  aero: { ...COMMON_AERO, zeroLiftDragCoefficient: 0.027 },
  // Big Fowler-style flaps: more lift, slower to move, blown up at a lower speed.
  flaps: { ...COMMON_FLAPS, liftIncrement: 0.7, maxExtensionSpeed: 70, travelTime: 4 },
  handling: {
    referenceSpeed: 95,
    pitch: { frequency: 1.8, dampingRatio: 0.7, fullStickAngleOfAttackDeg: 17, trimAngleOfAttackDeg: 3 },
    roll: { maxRateDeg: 55, responseTime: 0.5 },
    yaw: { frequency: 1.4, dampingRatio: 0.6, fullRudderSideslipDeg: 6 },
    dihedralEffect: 4,
    stallPitchDown: 1.5,
    gLimit: 3.5,
    negativeGLimit: 1.5,
  },
  // Sturdier undercarriage.
  landingGear: { ...COMMON_GEAR, maxSinkRate: 6.5, damageSinkRate: 2.5, maxSteeringDeg: 30 },
  combat: { maxHullHealth: 450, gunCount: 2, bombCapacity: 8 },
};

export const AIRCRAFT_CLASSES: Readonly<Record<AircraftClassId, AircraftClassSpec>> = {
  interceptor: INTERCEPTOR,
  fighterBomber: FIGHTER_BOMBER,
  heavyBomber: HEAVY_BOMBER,
};

export const AIRCRAFT_CLASS_IDS: readonly AircraftClassId[] = ['interceptor', 'fighterBomber', 'heavyBomber'];

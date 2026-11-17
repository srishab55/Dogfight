import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  HOME_RUNWAY,
  groundClearance,
  computePerformance,
  createAirborneState,
  createApproachState,
  createParkedState,
  getRunwaySpawnPoint,
  type AircraftClassSpec,
  type AircraftState,
} from '../src/index';
import { groundEffectInducedDragFactor, groundEffectLiftFactor, liftCoefficient, applyFlaps, maxLiftCoefficient } from '../src/flight/aerodynamics';
import { fly, heightAboveGround, holdPitchAttitude, holdVerticalSpeed, rollToBank, type PilotView } from './testPilot';

/*
 * Phase 2: take-off and landing. Flaps, ground effect, touchdown grading
 * and hard-landing damage, for every aircraft class.
 */

const THRESHOLD_Z = HOME_RUNWAY.center.z - HOME_RUNWAY.length / 2;
const RUNWAY_END_Z = HOME_RUNWAY.center.z + HOME_RUNWAY.length / 2;
const AIM_POINT = 300;
const RAD_TO_DEG = 180 / Math.PI;

function approach(spec: AircraftClassSpec, speed: number, flaps: number, distance = 2500): AircraftState {
  return createApproachState(spec, HOME_RUNWAY, { distanceFromThreshold: distance, glideSlopeDeg: 3, aimPointPastThreshold: AIM_POINT, speed, throttle: 0.25, flaps });
}

/** After touchdown: stick forward until the aircraft sits level on all three wheels, limited to a moderate push. */
function lowerNoseWheel(v: PilotView): number {
  return Math.max(-0.6, Math.min(0.3, -v.attitude.pitchDeg / 4 - v.pitchRateDeg / 12));
}

/**
 * Glide-slope tracking to the flare (4 m up; lower for slow, light aircraft,
 * which lose speed quickly once the power is off), then a gentle hold-off,
 * then brakes.
 */
function land(spec: AircraftClassSpec, state: AircraftState, speed: number, flaps: number) {
  const clearance = groundClearance(spec);
  const glide = 3 / RAD_TO_DEG;
  const flareHeight = Math.min(4, speed * 0.12);
  // A flare always eases the sink: to 1.5 m/s, or 60% of the approach's sink for a slow aircraft (whose 3-degree approach sinks less than that).
  const flareSink = Math.min(1.5, speed * Math.sin(glide) * 0.6);
  let touchdownZ = Number.NaN;
  let flaring = false;
  fly(
    state,
    spec,
    180,
    (v) => {
      const s = v.state;
      if (Number.isNaN(touchdownZ) && !s.onGround) {
        flaring ||= s.position.y - clearance < flareHeight;
        if (flaring) return { throttle: 0, flaps, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, -flareSink) };
        const pathHeight = (THRESHOLD_Z + AIM_POINT - s.position.z) * Math.tan(glide) + clearance;
        const targetVs = -speed * Math.sin(glide) + (pathHeight - s.position.y) * 0.15;
        const throttle = Math.max(0, Math.min(1, 0.25 + (speed - s.telemetry.airspeed) * 0.08));
        return { throttle, flaps, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, targetVs) };
      }
      if (Number.isNaN(touchdownZ)) touchdownZ = s.position.z;
      // After touchdown: put the nose wheel down firmly and hold it there (so ground effect can't float it back up), and brake.
      return { throttle: 0, brake: 1, flaps, roll: rollToBank(v, 0), pitch: lowerNoseWheel(v) };
    },
    (v) => !Number.isNaN(touchdownZ) && v.state.telemetry.airspeed < 0.5,
  );
  return { touchdownZ, stopZ: state.position.z };
}

describe('aerodynamics of flaps and ground effect', () => {
  const spec = AIRCRAFT_CLASSES.fighterBomber;

  it('flaps add lift at the same angle of attack and raise maximum lift', () => {
    const clean = applyFlaps({ ...spec.aero }, spec, 0);
    const flapped = applyFlaps({ ...spec.aero }, spec, 1);
    expect(liftCoefficient(5 / RAD_TO_DEG, 0, flapped)).toBeCloseTo(liftCoefficient(5 / RAD_TO_DEG, 0, clean) + spec.flaps.liftIncrement, 6);
    expect(maxLiftCoefficient(flapped)).toBeGreaterThan(maxLiftCoefficient(clean) * 1.2);
  });

  it('ground effect fades out above one wingspan and grows close to the ground', () => {
    const span = 10.6;
    expect(groundEffectInducedDragFactor(span * 2, span)).toBeGreaterThan(0.99);
    const near = groundEffectInducedDragFactor(1, span);
    expect(near).toBeLessThan(0.75);
    expect(groundEffectLiftFactor(near)).toBeGreaterThan(1.05);
  });
});

describe.each(AIRCRAFT_CLASS_IDS)('%s', (id) => {
  const spec = AIRCRAFT_CLASSES[id];
  const perf = computePerformance(spec);

  describe('flaps', () => {
    it('cut the stall speed by more than 10%, so approaches can be slower', () => {
      expect(perf.landingStallSpeed).toBeLessThan(perf.stallSpeed * 0.9);
      expect(perf.approachSpeed).toBeLessThan(perf.stallSpeed * 1.3);
    });

    it('take their travel time to deploy', () => {
      const state = createAirborneState(spec, { x: 0, y: 1000, z: 0 }, 0, perf.approachSpeed * 1.1, 0.5);
      fly(state, spec, spec.flaps.travelTime / 2, () => ({ flaps: 1, throttle: 0.5 }));
      expect(state.flapPosition).toBeGreaterThan(0.4);
      expect(state.flapPosition).toBeLessThan(0.6);
      fly(state, spec, spec.flaps.travelTime, () => ({ flaps: 1, throttle: 0.5 }));
      expect(state.flapPosition).toBe(1);
    });

    it('blow back up above their maximum extension speed', () => {
      const state = createAirborneState(spec, { x: 0, y: 1000, z: 0 }, 0, spec.flaps.maxExtensionSpeed * 1.4, 1);
      state.flapPosition = 1;
      // Full power keeps it well above flap speed for the whole run.
      fly(state, spec, spec.flaps.travelTime * 0.75, () => ({ flaps: 1, throttle: 1, pitch: 0 }));
      expect(state.telemetry.airspeed).toBeGreaterThan(spec.flaps.maxExtensionSpeed);
      expect(state.flapPosition).toBeLessThan(0.5);
    });

    it('let it fly hands-off at about approach speed, with the throttle setting the descent angle', () => {
      const path = (throttle: number) => {
        const state = approach(spec, perf.approachSpeed, 1, 5000);
        state.position.y += 400; // plenty of height to settle
        let stalled = false;
        fly(state, spec, 40, () => ({ throttle, flaps: 1 }), (v) => {
          stalled ||= v.state.telemetry.stalled;
          return false;
        });
        expect(stalled).toBe(false);
        expect(state.telemetry.airspeed).toBeGreaterThan(perf.approachSpeed * 0.85);
        expect(state.telemetry.airspeed).toBeLessThan(perf.approachSpeed * 1.15);
        return Math.atan2(state.velocity.y, Math.hypot(state.velocity.x, state.velocity.z)) * RAD_TO_DEG;
      };
      const idlePath = path(0.05);
      const powerPath = path(0.4);
      expect(idlePath).toBeLessThan(-3); // near idle: a descent at least as steep as the glide slope
      expect(powerPath).toBeGreaterThan(idlePath + 4); // more power, shallower path
    });
  });

  describe('landing', () => {
    it('with full flaps: slower approach, soft touchdown on the runway, no damage, stops before the end', () => {
      const state = approach(spec, perf.approachSpeed, 1);
      const result = land(spec, state, perf.approachSpeed, 1);
      expect(state.crashReason).toBeNull();
      expect(state.touchdownCount).toBe(1);
      expect(state.lastTouchdownSinkRate).toBeLessThan(2);
      expect(state.lastTouchdownDamage).toBe(0);
      expect(result.touchdownZ).toBeGreaterThan(THRESHOLD_Z);
      expect(result.stopZ).toBeLessThan(RUNWAY_END_Z);
    });

    it('lands itself from the landing-practice start: hands-off, it tracks the glide slope and touches down undamaged', () => {
      const state = createApproachState(spec, HOME_RUNWAY, {
        distanceFromThreshold: 2500,
        glideSlopeDeg: 3,
        aimPointPastThreshold: AIM_POINT,
        speed: perf.handsOffApproachSpeed,
        throttle: perf.approachThrottle,
        flaps: 1,
      });
      const clearance = groundClearance(spec);
      let worstGlideSlopeError = 0;
      fly(state, spec, 120, () => ({ throttle: perf.approachThrottle, flaps: 1 }), (v) => {
        const distanceToAim = THRESHOLD_Z + AIM_POINT - v.state.position.z;
        if (distanceToAim > 400) {
          const slopeHeight = distanceToAim * Math.tan(3 / RAD_TO_DEG) + clearance;
          worstGlideSlopeError = Math.max(worstGlideSlopeError, Math.abs(v.state.position.y - slopeHeight));
        }
        return v.state.touchdownCount > 0;
      });
      console.log(`${id}: approach throttle ${(perf.approachThrottle * 100).toFixed(0)}%, hands-off speed ${(perf.handsOffApproachSpeed * 3.6).toFixed(0)} km/h, worst glide-slope error ${worstGlideSlopeError.toFixed(1)} m, touchdown ${(state.position.z - THRESHOLD_Z).toFixed(0)} m past threshold at ${state.lastTouchdownSinkRate.toFixed(2)} m/s`);
      expect(state.crashReason).toBeNull();
      expect(worstGlideSlopeError).toBeLessThan(20);
      expect(state.position.z).toBeGreaterThan(THRESHOLD_Z);
      expect(state.position.z).toBeLessThan(THRESHOLD_Z + AIM_POINT + 300);
      expect(state.lastTouchdownDamage).toBe(0);
    });

    it('without flaps: still possible, but faster and firmer', () => {
      const flapped = approach(spec, perf.approachSpeed, 1);
      land(spec, flapped, perf.approachSpeed, 1);
      const clean = approach(spec, perf.stallSpeed * 1.3, 0);
      land(spec, clean, perf.stallSpeed * 1.3, 0);
      expect(clean.crashReason).toBeNull();
      expect(clean.lastTouchdownSinkRate).toBeGreaterThan(flapped.lastTouchdownSinkRate);
    });
  });

  describe('touchdown grading and hard-landing damage', () => {
    /** Level, wheels 0.3 m above the runway, moving at approach speed, sinking at `sinkRate`. */
    const arriving = (sinkRate: number) => {
      const state = approach(spec, perf.approachSpeed, 1, 0);
      state.position.y = groundClearance(spec) + 0.3;
      state.position.z = THRESHOLD_Z + 200;
      state.velocity.x = 0;
      state.velocity.y = -sinkRate;
      state.velocity.z = perf.approachSpeed;
      return state;
    };

    it('a normal touchdown is recorded and does no damage', () => {
      const state = arriving(1.5);
      fly(state, spec, 3, () => ({ throttle: 0, flaps: 1 }));
      expect(state.crashed).toBe(false);
      expect(state.touchdownCount).toBe(1);
      expect(state.lastTouchdownSinkRate).toBeCloseTo(1.5, 0);
      expect(state.hullHealth).toBe(spec.combat.maxHullHealth);
    });

    it('a firm touchdown between the damage and crash thresholds survives with hull damage', () => {
      const { damageSinkRate, maxSinkRate } = spec.landingGear;
      const state = arriving((damageSinkRate + maxSinkRate) / 2);
      fly(state, spec, 3, (v) => ({ throttle: 0, flaps: 1, pitch: v.state.onGround ? lowerNoseWheel(v) : 0 }));
      expect(state.crashed).toBe(false);
      expect(state.lastTouchdownDamage).toBeGreaterThan(spec.combat.maxHullHealth * 0.1);
      expect(state.hullHealth).toBeLessThan(spec.combat.maxHullHealth * 0.9);
    });

    it('arriving faster than the crash threshold destroys the aircraft', () => {
      const state = arriving(spec.landingGear.maxSinkRate + 1.5);
      fly(state, spec, 3, () => ({ throttle: 0, flaps: 1 }));
      expect(state.crashed).toBe(true);
    });

    it('wheel skips during the take-off roll are not counted as touchdowns', () => {
      const state = createParkedState(spec, getRunwaySpawnPoint(HOME_RUNWAY, 60));
      fly(state, spec, 120, (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: v.state.telemetry.airspeed > perf.stallSpeed * 1.1 ? holdPitchAttitude(v, 10) : 0 }), (v) => heightAboveGround(v.state) > 60);
      expect(state.touchdownCount).toBe(0);
    });
  });
});

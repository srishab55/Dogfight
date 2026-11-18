import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  cloneAircraftState,
  computePerformance,
  createAirborneState,
  createParkedState,
  getRunwaySpawnPoint,
  groundClearance,
  stallAngles,
  type AircraftClassId,
  type AircraftClassSpec,
  type AircraftState,
} from '../src/index';
import { quatFromAxisAngle, multiplyQuat, quatIdentity, rotateVec3 } from '../src/math/quat';
import { angleDifference, fly, heightAboveGround, holdPitchAttitude, holdVerticalSpeed, horizontalDistance, rollToBank, type PilotView, TEST_RUNWAY } from './testPilot';

/*
 * ─── Automated flight test ────────────────────────────────────────────────
 * Flies the real flight model through every phase of a sortie, for every
 * aircraft class, and checks the behaviour the brief requires: ground
 * handling, take-off, climb, roll, turns, loops, inverted flight, stall and
 * recovery, landing, and crashes. docs/FLIGHT_TEST.md is the matching manual
 * procedure for a human pilot in the browser.
 */

const RAD_TO_DEG = 180 / Math.PI;
const SPAWN = getRunwaySpawnPoint(TEST_RUNWAY, 60);
const THRESHOLD_Z = TEST_RUNWAY.center.z - TEST_RUNWAY.length / 2;
const RUNWAY_END_Z = TEST_RUNWAY.center.z + TEST_RUNWAY.length / 2;
const LOOP_CAPABLE: readonly AircraftClassId[] = ['interceptor', 'fighterBomber', 'navalFighter', 'diveBomber', 'triplane', 'biplane'];

const setup = (id: AircraftClassId) => ({ spec: AIRCRAFT_CLASSES[id], perf: computePerformance(AIRCRAFT_CLASSES[id]) });

/** Standard take-off: full power, wings level, rotate at 1.1x stall speed to 10 degrees nose-up, climb to 50 m. */
function takeOff(spec: AircraftClassSpec, state: AircraftState, stallSpeed: number) {
  const start = { ...state.position };
  let liftoffDistance = Number.NaN;
  let liftoffSpeed = Number.NaN;
  const time = fly(
    state,
    spec,
    120,
    (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: v.state.telemetry.airspeed > stallSpeed * 1.1 ? holdPitchAttitude(v, 10) : 0 }),
    (v) => {
      if (!v.state.onGround && Number.isNaN(liftoffDistance)) {
        liftoffDistance = horizontalDistance(start, v.state.position);
        liftoffSpeed = v.state.telemetry.airspeed;
      }
      return heightAboveGround(v.state) > 50;
    },
  );
  return { liftoffDistance, liftoffSpeed, time };
}

/** A level aircraft at `altitude`, rotated by `pitchDeg` (nose up positive) and `bankDeg` (right positive). */
function airborne(spec: AircraftClassSpec, altitude: number, speed: number, pitchDeg = 0, bankDeg = 0, throttle = 0.7): AircraftState {
  const state = createAirborneState(spec, { x: 0, y: altitude, z: 0 }, 0, speed, throttle);
  const pitch = quatFromAxisAngle(quatIdentity(), { x: 1, y: 0, z: 0 }, -pitchDeg / RAD_TO_DEG);
  const bank = quatFromAxisAngle(quatIdentity(), { x: 0, y: 0, z: 1 }, -bankDeg / RAD_TO_DEG);
  multiplyQuat(state.orientation, pitch, bank);
  rotateVec3(state.velocity, state.orientation, { x: 0, y: 0, z: speed });
  return state;
}

describe.each(AIRCRAFT_CLASS_IDS)('%s', (id) => {
  const { spec, perf } = setup(id);

  describe('ground handling', () => {
    it('sits still on its wheels with the brakes on', () => {
      const state = createParkedState(spec, SPAWN);
      const start = { ...state.position };
      fly(state, spec, 10, () => ({ throttle: 0, brake: 1 }));
      expect(state.crashed).toBe(false);
      expect(state.onGround).toBe(true);
      expect(horizontalDistance(start, state.position)).toBeLessThan(0.15);
    });

    it('rests level on its tricycle gear (each leg sized to its share of the weight)', () => {
      const state = createParkedState(spec, SPAWN);
      let pitch = Number.NaN;
      fly(state, spec, 5, (v) => {
        pitch = v.attitude.pitchDeg;
        return { throttle: 0, brake: 1 };
      });
      expect(Math.abs(pitch)).toBeLessThan(0.5);
    });

    it('steers right with right rudder while taxiing (nose-wheel steering)', () => {
      const state = createParkedState(spec, SPAWN);
      fly(state, spec, 6, () => ({ throttle: 0.35 }));
      const turned = { heading: 0 };
      fly(state, spec, 6, (v) => {
        turned.heading = v.attitude.headingDeg;
        return { throttle: 0.2, yaw: 1 };
      });
      expect(state.crashed, String(state.crashReason)).toBe(false);
      expect(angleDifference(turned.heading, 0)).toBeGreaterThan(30);
      expect(state.telemetry.airspeed).toBeLessThan(30);
    });

    it('brakes to a stop from 25 m/s within 120 m', () => {
      const state = createParkedState(spec, SPAWN);
      fly(state, spec, 40, () => ({ throttle: 1, roll: 0 }), (v) => v.state.telemetry.airspeed > 25);
      const start = { ...state.position };
      fly(state, spec, 30, () => ({ throttle: 0, brake: 1 }), (v) => v.state.telemetry.airspeed < 0.3 && v.time > 1);
      expect(state.crashed).toBe(false);
      expect(horizontalDistance(start, state.position)).toBeLessThan(120);
    });
  });

  describe('take-off and climb', () => {
    it('accelerates, rotates and lifts off above stall speed with runway to spare', () => {
      const state = createParkedState(spec, SPAWN);
      const result = takeOff(spec, state, perf.stallSpeed);
      expect(state.crashed).toBe(false);
      expect(result.liftoffSpeed).toBeGreaterThan(perf.stallSpeed);
      expect(result.liftoffSpeed).toBeLessThan(perf.stallSpeed * 1.6);
      expect(result.liftoffDistance).toBeLessThan(TEST_RUNWAY.length - 60);
      expect(heightAboveGround(state)).toBeGreaterThan(50);
    });

    it('needs a longer run on grass than on the runway (rolling resistance)', () => {
      const onRunway = takeOff(spec, createParkedState(spec, SPAWN), perf.stallSpeed);
      const grassSpawn = { ...SPAWN, position: { ...SPAWN.position, x: SPAWN.position.x + 200 } };
      const onGrass = takeOff(spec, createParkedState(spec, grassSpawn), perf.stallSpeed);
      expect(onGrass.liftoffDistance).toBeGreaterThan(onRunway.liftoffDistance * 1.05);
    });

    it('climbs at full power', () => {
      const state = airborne(spec, 500, perf.bestClimbSpeed * 1.1, 0, 0, 1);
      fly(state, spec, 30, (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, perf.bestClimbRate * 0.6) }));
      expect(state.position.y - 500).toBeGreaterThan(perf.bestClimbRate * 0.5 * 30 * 0.6);
      expect(state.telemetry.stalled).toBe(false);
    });
  });

  describe('flying qualities', () => {
    it('is stable hands-off: no divergence or stall over a minute at cruise', () => {
      const state = airborne(spec, 1000, perf.stallSpeed * 2, 0, 0, 0.6);
      let minAltitude = Infinity;
      let stalled = false;
      fly(state, spec, 60, () => ({ throttle: 0.6 }), (v) => {
        minAltitude = Math.min(minAltitude, v.state.position.y);
        stalled ||= v.state.telemetry.stalled;
        return false;
      });
      expect(stalled).toBe(false);
      expect(minAltitude).toBeGreaterThan(800);
      expect(Math.abs(rollToBank({ ...fakeView(state) }, 0))).toBeLessThan(0.5); // still roughly wings-level
    });

    it('rolls at close to its configured roll rate', () => {
      const state = airborne(spec, 1000, spec.handling.referenceSpeed, 0, 0, 0.8);
      let peakRollRate = 0;
      fly(state, spec, 3, () => ({ roll: 1, throttle: 0.8 }), (v) => {
        peakRollRate = Math.max(peakRollRate, v.rollRateDeg);
        return v.attitude.bankDeg >= 90;
      });
      expect(peakRollRate).toBeGreaterThan(spec.handling.roll.maxRateDeg * 0.8);
      expect(peakRollRate).toBeLessThan(spec.handling.roll.maxRateDeg * 1.1);
    });

    it('turns right when banked right and pulled, at the rate physics predicts', () => {
      const state = airborne(spec, 1000, perf.stallSpeed * 2.2, 0, 0, 1);
      let headingChange = 0;
      let previousHeading = 0;
      fly(state, spec, 20, (v) => {
        if (v.time > 0) headingChange += angleDifference(v.attitude.headingDeg, previousHeading);
        previousHeading = v.attitude.headingDeg;
        return { throttle: 1, roll: rollToBank(v, 60), pitch: Math.abs(v.attitude.bankDeg) > 40 ? holdVerticalSpeed(v, 0) : 0 };
      });
      // A level 60-degree banked turn pulls 2 g: turn rate = g * sqrt(n^2 - 1) / V.
      const expectedRate = (9.81 * Math.sqrt(3) * RAD_TO_DEG) / state.telemetry.airspeed;
      const actualRate = headingChange / 20;
      expect(headingChange).toBeGreaterThan(90);
      expect(actualRate).toBeGreaterThan(expectedRate * 0.6);
      expect(actualRate).toBeLessThan(expectedRate * 1.2);
      expect(state.position.y).toBeGreaterThan(850);
      expect(state.telemetry.stalled).toBe(false);
    });

    it('does not fly where the nose points: velocity lags behind a yaw (sideslip builds)', () => {
      const state = airborne(spec, 1000, spec.handling.referenceSpeed, 0, 0, 0.7);
      let peakSideslip = 0;
      fly(state, spec, 2, () => ({ yaw: 1, throttle: 0.7 }), (v) => {
        peakSideslip = Math.max(peakSideslip, Math.abs(v.state.telemetry.sideslip * RAD_TO_DEG));
        return false;
      });
      expect(peakSideslip).toBeGreaterThan(2);
    });

    it('does not fly where the nose points: after a sharp pull the nose leads the flight path (angle of attack)', () => {
      const state = airborne(spec, 1000, spec.handling.referenceSpeed, 0, 0, 0.7);
      fly(state, spec, 0.7, () => ({ pitch: 0.6, throttle: 0.7 }));
      // The nose rotates first; the velocity only follows as lift builds, so AoA rises above trim.
      expect(state.telemetry.angleOfAttack * RAD_TO_DEG).toBeGreaterThan(spec.handling.pitch.trimAngleOfAttackDeg + 1.5);
    });

    it('respects its g-limit when the stick is yanked at high speed', () => {
      const state = airborne(spec, 2000, perf.topSpeed * 0.95, 0, 0, 1);
      let peakLoad = 0;
      fly(state, spec, 3, () => ({ pitch: 1, throttle: 1 }), (v) => {
        peakLoad = Math.max(peakLoad, v.state.telemetry.loadFactor);
        return false;
      });
      expect(peakLoad).toBeGreaterThan(spec.handling.gLimit * 0.7);
      expect(peakLoad).toBeLessThan(spec.handling.gLimit + 1.5);
    });

    it('flies inverted: pushing the stick holds altitude upside down', () => {
      const state = airborne(spec, 1000, perf.stallSpeed * 2.4, 0, 180, 1);
      let minAltitude = Infinity;
      let alwaysInverted = true;
      let aoaSum = 0;
      let samples = 0;
      fly(state, spec, 10, (v) => ({ throttle: 1, roll: rollToBank(v, 180), pitch: -holdVerticalSpeed(v, 0) }), (v) => {
        minAltitude = Math.min(minAltitude, v.state.position.y);
        alwaysInverted &&= Math.abs(v.attitude.bankDeg) > 150;
        if (v.time > 2) {
          aoaSum += v.state.telemetry.angleOfAttack;
          samples++;
        }
        return false;
      });
      expect(state.crashed).toBe(false);
      expect(alwaysInverted).toBe(true);
      expect(minAltitude).toBeGreaterThan(850);
      // Negative AoA is what holds it up. Averaged, because the scripted pilot hunts a little in pitch.
      expect(aoaSum / samples).toBeLessThan(0);
    });

    it('reaches close to its derived top speed in level flight at full power', () => {
      const state = airborne(spec, 200, perf.topSpeed * 0.9, 0, 0, 1);
      fly(state, spec, 150, (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, (200 - v.state.position.y) * 0.1) }));
      expect(state.telemetry.airspeed).toBeGreaterThan(perf.topSpeed * 0.95);
      expect(state.telemetry.airspeed).toBeLessThan(perf.topSpeed * 1.05);
    });

    it('needs more speed at altitude: thin air at 6 km stalls at a speed that is fine at sea level', () => {
      // Whether it stalls, or (an old type near its ceiling) can't hold its height and mushes down instead.
      const run = (altitude: number) => {
        const state = airborne(spec, altitude, perf.stallSpeed * 1.25, 0, 0, 1);
        let stalled = false;
        fly(state, spec, 15, (v) => ({ throttle: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) }), (v) => {
          stalled ||= v.state.telemetry.stalled;
          return false;
        });
        return { stalled, sank: altitude - state.position.y > 30 };
      };
      expect(run(300).stalled).toBe(false);
      const high = run(6000);
      if (spec.airframe.fixedGear) expect(high.stalled || high.sank).toBe(true);
      else expect(high.stalled).toBe(true);
    });
  });

  describe('stall and recovery', () => {
    it('stalls when the stick is held back at idle: lift collapses, the nose drops, altitude is lost', () => {
      const state = airborne(spec, 1500, perf.stallSpeed * 1.5, 0, 0, 0);
      const critical = stallAngles(spec.aero).positive;
      let maxAoa = -Infinity;
      let peakCl = 0;
      let clAfterBreak = Infinity;
      let onsetTime = -1;
      let pitchAtOnset = 0;
      let lowestPitchAfterOnset = Infinity;
      let peakAltitude = -Infinity;
      let warningSteps = 0;
      let steps = 0;
      fly(state, spec, 15, (v) => ({ throttle: 0, pitch: 1, roll: rollToBank(v, 0) }), (v) => {
        const t = v.state.telemetry;
        if (v.time === 0) return false;
        steps++;
        if (t.stallWarning) warningSteps++;
        maxAoa = Math.max(maxAoa, t.angleOfAttack);
        peakAltitude = Math.max(peakAltitude, v.state.position.y);
        if (onsetTime < 0) {
          peakCl = Math.max(peakCl, t.liftCoefficient);
          if (t.stalled) {
            onsetTime = v.time;
            pitchAtOnset = v.attitude.pitchDeg;
          }
        } else if (v.time - onsetTime < 3) {
          clAfterBreak = Math.min(clAfterBreak, t.liftCoefficient);
          lowestPitchAfterOnset = Math.min(lowestPitchAfterOnset, v.attitude.pitchDeg);
        }
        return false;
      });

      expect(onsetTime).toBeGreaterThan(0); // it stalls
      expect(maxAoa).toBeGreaterThan(critical); // ...by exceeding the critical angle of attack
      expect(clAfterBreak).toBeLessThan(peakCl * 0.7); // lift reduces significantly
      expect(pitchAtOnset - lowestPitchAfterOnset).toBeGreaterThan(8); // the nose drops by itself, stick still back
      expect(state.position.y).toBeLessThan(peakAltitude - 30); // altitude is lost
      expect(warningSteps / steps).toBeGreaterThan(0.4); // the stall warning sounds for much of it
      expect(state.crashed).toBe(false);
    });

    it('recovers when the nose is lowered and speed rebuilt, then pulls out to level flight', () => {
      const state = airborne(spec, 1500, perf.stallSpeed * 1.5, 0, 0, 0);
      fly(state, spec, 15, (v) => ({ throttle: 0, pitch: 1, roll: rollToBank(v, 0) }), (v) => v.state.telemetry.stalled && v.time > 1);
      expect(state.telemetry.stalled).toBe(true);

      // Recovery: full power, lower the nose, wings level.
      const recoveryTime = fly(
        state,
        spec,
        10,
        (v) => ({ throttle: 1, pitch: holdPitchAttitude(v, -15), roll: rollToBank(v, 0) }),
        (v) => !v.state.telemetry.stalled && v.state.flowSeparation < 0.05 && v.state.telemetry.airspeed > perf.stallSpeed * 1.3,
      );
      expect(recoveryTime).toBeLessThan(8);

      // Gentle pull-out to level flight. Yanking the stick here would cause a
      // secondary (accelerated) stall, a classic real-world mistake the model reproduces.
      let restalled = false;
      fly(state, spec, 15, (v) => ({ throttle: 1, pitch: gentle(holdVerticalSpeed(v, 0)), roll: rollToBank(v, 0) }), (v) => {
        restalled ||= v.state.telemetry.stalled;
        return false;
      });
      expect(restalled).toBe(false);
      expect(state.crashed).toBe(false);
      expect(Math.abs(state.velocity.y)).toBeLessThan(3);
      expect(state.position.y).toBeGreaterThan(1000);
    });
  });

  describe('landing', () => {
    it('flies a 3-degree approach, flares, touches down on the runway and brakes to a stop', () => {
      const result = flyStraightInLanding(spec, perf.stallSpeed);
      expect(result.crashReason).toBeNull();
      expect(result.touchdownSinkRate).toBeLessThan(3.5);
      expect(result.touchdownZ).toBeGreaterThan(THRESHOLD_Z);
      expect(result.stopZ).toBeLessThan(RUNWAY_END_Z);
      expect(result.stopped).toBe(true);
    });
  });

  it.runIf(LOOP_CAPABLE.includes(id))('loops: pulls through vertical, over the top inverted and back to level', () => {
    const state = airborne(spec, 1000, perf.cornerSpeed * 1.05, 0, 0, 1);
    let wentVertical = false;
    let wentInverted = false;
    let minAltitude = Infinity;
    const time = fly(state, spec, 40, () => ({ throttle: 1, pitch: 1 }), (v) => {
      wentVertical ||= v.attitude.pitchDeg > 80;
      wentInverted ||= wentVertical && Math.abs(v.attitude.bankDeg) > 150;
      minAltitude = Math.min(minAltitude, v.state.position.y);
      return wentInverted && Math.abs(v.attitude.pitchDeg) < 5 && Math.abs(v.attitude.bankDeg) < 30;
    });
    expect(wentInverted).toBe(true);
    expect(time).toBeLessThan(35);
    expect(Math.abs(angleDifference(getHeading(state), 0))).toBeLessThan(20);
    expect(minAltitude).toBeGreaterThan(850);
  });

  it('flies a complete sortie: take-off, climb, 180-degree turn, (loop), stall, recovery, level-off', () => {
    const state = createParkedState(spec, SPAWN);
    const canLoop = LOOP_CAPABLE.includes(id);
    const phasesFlown: string[] = [];
    let phase = 'takeoff';
    let phaseStart = 0;
    let turnStartHeading = 0;
    let loopVertical = false;
    let loopInverted = false;
    const enter = (next: string, view: PilotView) => {
      phasesFlown.push(phase);
      phase = next;
      phaseStart = view.time;
      if (next === 'turn') turnStartHeading = view.attitude.headingDeg;
    };

    fly(state, spec, 600, (v) => {
      const s = v.state;
      const t = s.telemetry;
      const agl = heightAboveGround(s);
      switch (phase) {
        case 'takeoff':
          if (agl > 50) enter('climb', v);
          return { throttle: 1, roll: rollToBank(v, 0), pitch: t.airspeed > perf.stallSpeed * 1.1 ? holdPitchAttitude(v, 10) : 0 };
        case 'climb':
          if (agl > 900) enter('turn', v);
          return { throttle: 1, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, perf.bestClimbRate * 0.6) };
        case 'turn':
          if (Math.abs(angleDifference(v.attitude.headingDeg, turnStartHeading)) > 175) enter('rollOut', v);
          return { throttle: 1, roll: rollToBank(v, 45), pitch: holdVerticalSpeed(v, 0) };
        case 'rollOut': // wings level before the next manoeuvre (a banked pull makes an oblique loop)
          if (Math.abs(v.attitude.bankDeg) < 3 && Math.abs(v.rollRateDeg) < 5) enter(canLoop ? 'dive' : 'stall', v);
          return { throttle: 0.8, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) };
        case 'dive': // gain speed for the loop
          if (t.airspeed > perf.cornerSpeed) enter('loop', v);
          return { throttle: 1, roll: rollToBank(v, 0), pitch: holdPitchAttitude(v, -25) };
        case 'loop':
          loopVertical ||= v.attitude.pitchDeg > 80;
          loopInverted ||= loopVertical && Math.abs(v.attitude.bankDeg) > 150;
          if (loopInverted && Math.abs(v.attitude.pitchDeg) < 10 && Math.abs(v.attitude.bankDeg) < 30) enter('levelBeforeStall', v);
          return { throttle: 1, pitch: 1 };
        case 'levelBeforeStall':
          if (v.time - phaseStart > 8) enter('stall', v);
          return { throttle: 0.7, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) };
        case 'stall':
          if (t.stalled && v.time - phaseStart > 1) enter('recover', v);
          return { throttle: 0, roll: rollToBank(v, 0), pitch: 1 };
        case 'recover':
          if (!t.stalled && s.flowSeparation < 0.05 && t.airspeed > perf.stallSpeed * 1.3) enter('levelOff', v);
          return { throttle: 1, roll: rollToBank(v, 0), pitch: holdPitchAttitude(v, -15) };
        case 'levelOff':
          if (v.time - phaseStart > 15) enter('done', v);
          return { throttle: 0.8, roll: rollToBank(v, 0), pitch: gentle(holdVerticalSpeed(v, 0)) };
        default:
          return { throttle: 0.8, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, 0) };
      }
    }, () => phase === 'done');

    expect(state.crashReason).toBeNull();
    expect(phase).toBe('done');
    const expected = ['takeoff', 'climb', 'turn', 'rollOut', ...(canLoop ? ['dive', 'loop', 'levelBeforeStall'] : []), 'stall', 'recover', 'levelOff'];
    expect(phasesFlown).toEqual(expected);
    // Stalled at ~900 m; the heavy bomber needs ~600 m to recover with a gentle pull-out.
    expect(heightAboveGround(state)).toBeGreaterThan(150);
    expect(state.telemetry.stalled).toBe(false);
  });
});

describe('crashes and collisions (Fighter-Bomber)', () => {
  const { spec } = setup('fighterBomber');
  const runwayPoint = { x: TEST_RUNWAY.center.x, z: TEST_RUNWAY.center.z };

  /** Aircraft with its wheels `wheelHeight` above the runway, moving forward at `speed`, sinking at `sinkRate`. */
  const approaching = (wheelHeight: number, speed: number, sinkRate: number, bankDeg = 0) => {
    const state = airborne(spec, 0, speed, 0, bankDeg, 0);
    state.position.x = runwayPoint.x;
    state.position.z = runwayPoint.z;
    state.position.y = groundClearance(spec) + wheelHeight;
    state.velocity.y = -sinkRate;
    // Coming in to land: gear down (an air start begins with it up, and it's too low here to come down in time).
    state.gearPosition = 1;
    return state;
  };

  it('flying into the ground is a crash', () => {
    const state = airborne(spec, 300, 120, -30, 0, 1);
    fly(state, spec, 20, () => ({ throttle: 1 }));
    expect(state.crashed).toBe(true);
    expect(state.crashReason).toMatch(/impact|strike|landing|collapsed/);
  });

  it('a 9 m/s arrival is a hard-landing crash; 1.5 m/s is a normal touchdown', () => {
    const hard = approaching(0.3, 60, 9);
    fly(hard, spec, 3, () => ({ throttle: 0 }));
    expect(hard.crashed).toBe(true);
    expect(hard.crashReason).toMatch(/hard landing/);

    const gentle = approaching(0.3, 60, 1.5);
    fly(gentle, spec, 3, () => ({ throttle: 0 }));
    expect(gentle.crashed).toBe(false);
    expect(gentle.onGround).toBe(true);
  });

  it('touching down steeply banked strikes a wingtip', () => {
    const state = approaching(2, 60, 2, 70);
    fly(state, spec, 3, () => ({ throttle: 0 }));
    expect(state.crashed).toBe(true);
    expect(state.crashReason).toMatch(/wingtip|propeller|landing|collapsed/);
  });
});

describe('determinism (needed for client prediction in Phase 5)', () => {
  it('identical inputs produce bit-identical states', () => {
    const { spec, perf } = setup('interceptor');
    const run = () => {
      const state = createParkedState(spec, SPAWN);
      takeOff(spec, state, perf.stallSpeed);
      fly(state, spec, 20, (v) => ({ throttle: 0.9, roll: Math.sin(v.time), pitch: 0.3 * Math.cos(v.time * 0.7), yaw: 0.2 }));
      return cloneAircraftState(state);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

// ── helpers ──

/** Limits stick deflection, the way a pilot eases out of a dive instead of yanking. */
function gentle(input: number): number {
  return Math.max(-0.4, Math.min(0.4, input));
}

function getHeading(state: AircraftState): number {
  return fakeView(state).attitude.headingDeg;
}

function fakeView(state: AircraftState): PilotView {
  let view: PilotView | undefined;
  fly(cloneAircraftState(state), AIRCRAFT_CLASSES[state.classId], 0.0001, () => ({}), (v) => {
    view = { ...v, attitude: { ...v.attitude } };
    return true;
  });
  if (!view) throw new Error('no view');
  return view;
}

/** Straight-in approach from 1.5 km on a 3-degree glide path, flare, touchdown, brakes. */
function flyStraightInLanding(spec: AircraftClassSpec, stallSpeed: number) {
  const glide = (3 * Math.PI) / 180;
  const aimPointZ = THRESHOLD_Z + 300;
  const approachSpeed = stallSpeed * 1.3;
  const startDistance = 1500;
  const state = airborne(spec, (aimPointZ - (THRESHOLD_Z - startDistance)) * Math.tan(glide), approachSpeed, 0, 0, 0.3);
  state.position.z = THRESHOLD_Z - startDistance;
  state.velocity.y = -approachSpeed * Math.sin(glide);
  const flareHeight = groundClearance(spec) + 6;

  let touchdownZ = Number.NaN;
  let touchdownSinkRate = 0;
  let flaring = false;
  fly(
    state,
    spec,
    150,
    (v) => {
      const s = v.state;
      if (Number.isNaN(touchdownZ) && !s.onGround) {
        if (s.position.y < flareHeight) flaring = true;
        if (flaring) return { throttle: 0, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, -1) };
        // Track the glide path: target vertical speed plus a correction for being high or low.
        const glidePathHeight = (aimPointZ - s.position.z) * Math.tan(glide) + groundClearance(spec);
        const targetVs = -approachSpeed * Math.sin(glide) + (glidePathHeight - s.position.y) * 0.15;
        const throttle = Math.max(0, Math.min(1, 0.35 + (approachSpeed - s.telemetry.airspeed) * 0.08));
        return { throttle, roll: rollToBank(v, 0), pitch: holdVerticalSpeed(v, targetVs) };
      }
      if (Number.isNaN(touchdownZ)) {
        touchdownZ = s.position.z;
        touchdownSinkRate = -s.velocity.y;
      }
      return { throttle: 0, brake: 1, roll: rollToBank(v, 0) };
    },
    (v) => !Number.isNaN(touchdownZ) && v.state.telemetry.airspeed < 0.5,
  );
  return { crashReason: state.crashReason, touchdownZ, touchdownSinkRate, stopZ: state.position.z, stopped: state.telemetry.airspeed < 0.5 };
}

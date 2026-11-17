import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  BLUE_CARRIER,
  SPAWN_DISTANCE,
  baseSpawnPoint,
  carrierDeckRunway,
  computePerformance,
  createApproachState,
  createParkedState,
  createTerrain,
  createWorldGround,
  hasTailhook,
  runwayLocal,
  teamBase,
  type AircraftClassId,
} from '../src/index';
import { fly, holdPitchAttitude, rollToBank } from './testPilot';

const world = createWorldGround(createTerrain());
const deck = carrierDeckRunway(BLUE_CARRIER);
const CARRIER_CLASSES: readonly AircraftClassId[] = ['navalFighter', 'diveBomber'];
/** Where the carrier glide slope meets the deck: early in the wire zone (the client's landing practice uses the same). */
const CARRIER_AIM_POINT = BLUE_CARRIER.wires.from + 15;

/** Distance forward from the stern along the deck (m). */
const fromStern = (p: { x: number; z: number }) => runwayLocal(deck, p.x, p.z).along + deck.length / 2;
const offCentre = (p: { x: number; z: number }) => runwayLocal(deck, p.x, p.z).across;

describe('carrier operations', () => {
  it('carrier aircraft have tailhooks and spawn on the carrier; island aircraft do not', () => {
    for (const id of CARRIER_CLASSES) {
      expect(hasTailhook(AIRCRAFT_CLASSES[id])).toBe(true);
      expect(AIRCRAFT_CLASSES[id].homeBase).toBe('carrier');
    }
    for (const id of ['interceptor', 'fighterBomber', 'heavyBomber'] as const) {
      expect(hasTailhook(AIRCRAFT_CLASSES[id])).toBe(false);
      expect(AIRCRAFT_CLASSES[id].homeBase).toBe('airfield');
    }
  });

  describe.each(CARRIER_CLASSES)('%s', (id) => {
    const spec = AIRCRAFT_CLASSES[id];
    const perf = computePerformance(spec);

    it('sits still on the catapult with the brakes on', () => {
      const state = createParkedState(spec, baseSpawnPoint(teamBase('blue', 'carrier')), true);
      const start = { ...state.position };
      fly(state, spec, 5, () => ({ brake: 1 }), undefined, world);
      expect(state.crashed).toBe(false);
      expect(Math.hypot(state.position.x - start.x, state.position.z - start.z)).toBeLessThan(0.05);
    });

    it('is held on the catapult while the engine runs up, then launched off the bow into a climb', () => {
      const state = createParkedState(spec, baseSpawnPoint(teamBase('blue', 'carrier')), true);
      const start = fromStern(state.position);
      // Half throttle: the holdback bar keeps it in place.
      fly(state, spec, 4, () => ({ throttle: 0.5 }), undefined, world);
      expect(fromStern(state.position) - start).toBeLessThan(0.1);
      expect(state.catapult).toBe('held');

      let launched = false;
      let leftDeckAt = Number.NaN;
      let lowest = Infinity;
      fly(
        state,
        spec,
        40,
        (v) => ({ throttle: 1, flaps: 0.5, roll: rollToBank(v, 0), pitch: v.state.catapult === 'none' ? holdPitchAttitude(v, 8) : 0 }),
        (v) => {
          launched ||= v.state.catapult === 'launching';
          if (Number.isNaN(leftDeckAt) && fromStern(v.state.position) > deck.length) leftDeckAt = v.state.telemetry.airspeed;
          if (!Number.isNaN(leftDeckAt)) lowest = Math.min(lowest, v.state.position.y);
          return v.state.position.y > deck.center.y + 60;
        },
        world,
      );
      expect(launched).toBe(true);
      expect(state.crashed).toBe(false);
      expect(state.hookEngaged).toBe(false);
      // Off the bow above stall speed, and it never sinks to the sea (16 m below the deck).
      expect(leftDeckAt).toBeGreaterThan(perf.stallSpeed);
      expect(lowest).toBeGreaterThan(deck.center.y - 8);
      expect(state.position.y).toBeGreaterThan(deck.center.y + 60);
    });

    it('hands-off after a catapult launch with take-off flaps, it flies away instead of sinking into the sea', () => {
      const state = createParkedState(spec, baseSpawnPoint(teamBase('blue', 'carrier')), true);
      state.flapPosition = 0.5;
      let lowest = Infinity;
      let launched = false;
      fly(
        state,
        spec,
        25,
        (v) => ({ throttle: 1, flaps: 0.5, roll: rollToBank(v, 0) }),
        (v) => {
          launched ||= v.state.catapult === 'launching';
          if (fromStern(v.state.position) > deck.length) lowest = Math.min(lowest, v.state.position.y);
          return false;
        },
        world,
      );
      expect(launched).toBe(true);
      expect(state.crashed).toBe(false);
      // At most a short dip off the bow, nowhere near the sea 16 m below the deck.
      expect(lowest).toBeGreaterThan(deck.center.y - 6);
    });

    it('lands itself from carrier landing practice: catches a wire and stops on the deck, undamaged', () => {
      const approach = createApproachState(spec, deck, {
        distanceFromThreshold: 1_500,
        glideSlopeDeg: 3,
        aimPointPastThreshold: CARRIER_AIM_POINT,
        speed: perf.handsOffApproachSpeed,
        throttle: perf.approachThrottle,
        flaps: 1,
      });
      let stoppedAt = Number.NaN;
      let touchdownAt = Number.NaN;
      fly(
        approach,
        spec,
        90,
        () => ({ throttle: perf.approachThrottle, flaps: 1 }),
        (v) => {
          if (v.state.onGround && Number.isNaN(touchdownAt)) touchdownAt = fromStern(v.state.position);
          const speed = Math.hypot(v.state.velocity.x, v.state.velocity.z);
          if (v.state.onGround && speed < 0.5) stoppedAt = fromStern(v.state.position);
          return !Number.isNaN(stoppedAt);
        },
        world,
      );
      expect(approach.crashed).toBe(false);
      expect(approach.touchdownCount).toBe(1);
      expect(approach.lastTouchdownDamage).toBe(0);
      expect(approach.hookEngaged).toBe(true);
      expect(stoppedAt).toBeGreaterThan(BLUE_CARRIER.wires.from);
      // No float over the deck: it touches down in the first half of the wire zone, and stops short of the barrier.
      expect(touchdownAt).toBeGreaterThan(BLUE_CARRIER.wires.from);
      expect(touchdownAt).toBeLessThan((BLUE_CARRIER.wires.from + BLUE_CARRIER.wires.to) / 2 + 10);
      expect(stoppedAt).toBeLessThan(BLUE_CARRIER.barrier.fromStern);
      expect(Math.abs(offCentre(approach.position))).toBeLessThan(deck.width / 2 - 6);
      // The wire holds it at approach power; at idle the crew frees the hook.
      fly(approach, spec, 3, () => ({ throttle: 0, flaps: 1 }), undefined, world);
      expect(approach.hookEngaged).toBe(false);
    });
  });

  it('the hook catches a wire from just above the deck, before the wheels touch', () => {
    const spec = AIRCRAFT_CLASSES.navalFighter;
    const perf = computePerformance(spec);
    // Level over the wire zone, wheels 0.25 m above the deck, hook armed.
    const state = createApproachState(spec, deck, { distanceFromThreshold: -40, glideSlopeDeg: 0.0001, aimPointPastThreshold: 0, speed: perf.handsOffApproachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    state.position.y += 0.25;
    state.hookArmed = true;
    let caughtInAir = false;
    fly(state, spec, 0.5, () => ({ throttle: perf.approachThrottle, flaps: 1 }), (v) => {
      caughtInAir ||= v.state.hookEngaged && !v.state.onGround;
      return v.state.hookEngaged;
    }, world);
    expect(state.hookEngaged).toBe(true);
    expect(caughtInAir).toBe(true);
  });

  it('an aircraft with no hook that lands on the deck is stopped by the crash barrier, damaged, instead of rolling off the bow', () => {
    const spec = AIRCRAFT_CLASSES.fighterBomber;
    const perf = computePerformance(spec);
    const approach = createApproachState(spec, deck, { distanceFromThreshold: 1_200, glideSlopeDeg: 3, aimPointPastThreshold: 40, speed: perf.handsOffApproachSpeed, throttle: perf.approachThrottle, flaps: 1 });
    fly(approach, spec, 60, (v) => ({ throttle: v.state.onGround ? 0 : perf.approachThrottle, flaps: 1 }), (v) => v.state.onGround && Math.hypot(v.state.velocity.x, v.state.velocity.z) < 0.5, world);
    expect(approach.crashed).toBe(false);
    expect(approach.hookEngaged).toBe(false);
    expect(fromStern(approach.position)).toBeLessThan(deck.length);
    expect(fromStern(approach.position)).toBeGreaterThan(BLUE_CARRIER.barrier.fromStern - 10);
    expect(approach.hullHealth).toBeLessThan(spec.combat.maxHullHealth);
  });

  it('carrier aircraft spawn on the catapult, clear of the landing area and the island', () => {
    const spawn = baseSpawnPoint(teamBase('blue', 'carrier'));
    expect(fromStern(spawn.position)).toBeCloseTo(SPAWN_DISTANCE.carrier, 5);
    expect(SPAWN_DISTANCE.carrier).toBe(BLUE_CARRIER.catapult.from);
    expect(BLUE_CARRIER.catapult.from).toBeGreaterThan(BLUE_CARRIER.island.along + BLUE_CARRIER.island.length / 2);
    expect(BLUE_CARRIER.catapult.to).toBeLessThan(BLUE_CARRIER.deckLength);
    expect(spawn.position.y).toBe(BLUE_CARRIER.center.y);
  });
});

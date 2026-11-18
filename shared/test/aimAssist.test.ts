import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  CombatWorld,
  HIT_ASSIST_CONFIG,
  TARGET_VISIBILITY_CONFIG,
  createAirborneState,
  createParkedState,
  enlargeBlend,
  visibilityScale,
  wingSpan,
  createFlatGround,
  createGunState,
  leadDirection,
  roundsWouldHit,
  type Shooter,
} from '../src/index';
import { STEP } from './testPilot';

/*
 * Hitting other aircraft: the near-miss allowance (a human pilot's aim
 * assist) and the HUD's gunnery aids.
 */

const spec = AIRCRAFT_CLASSES.fighterBomber;

/** A Blue fighter firing straight ahead at a Red one flying the same way, `ahead` metres in front and `offset` metres to its right. */
function firingAt(ahead: number, offset: number, nearMiss: number, enlargedTargets = false) {
  const shooter = createAirborneState(spec, { x: 0, y: 500, z: 0 }, 0, 110, 0.7);
  const target = createAirborneState(spec, { x: offset, y: 500, z: ahead }, 0, 110, 0.7);
  const world = new CombatWorld(createFlatGround(), []);
  const shooters: Shooter[] = [
    { id: 1, team: 'blue', state: shooter, spec, guns: createGunState(spec), trigger: true, nearMiss, enlargedTargets },
    { id: 2, team: 'red', state: target, spec, guns: createGunState(spec), trigger: false },
  ];
  let hits = 0;
  for (let t = 0; t < 1.5; t += STEP) {
    // Both fly on, straight and level (no flight model: the test is about the rounds).
    for (const s of [shooter, target]) s.position.z += s.velocity.z * STEP;
    world.step(STEP, shooters);
    hits += world.drainEvents().filter((e) => e.type === 'aircraftHit' && e.victim === 2).length;
  }
  return { hits, shooter, target };
}

describe('hitting aircraft', () => {
  it('rounds straight at an aircraft hit it, with or without the assist', () => {
    expect(firingAt(250, 0, 0).hits).toBeGreaterThan(5);
  });

  it('a near miss (rounds passing a few metres off) hits only with the assist', () => {
    const offset = 8; // the wing spheres reach about 5 m out; rounds pass about 2.5 m beyond them
    expect(firingAt(250, offset, 0).hits).toBe(0);
    expect(firingAt(250, offset, HIT_ASSIST_CONFIG.nearMissMetres).hits).toBeGreaterThan(0);
  });

  it('well off target, it still misses', () => {
    expect(firingAt(250, 25, HIT_ASSIST_CONFIG.nearMissMetres).hits).toBe(0);
  });
});

describe('target visibility: far aircraft are drawn larger, and your rounds hit what you see', () => {
  it('real size close up and on the ground; larger with distance, never narrower than the minimum apparent size, up to the cap', () => {
    const span = wingSpan(spec);
    expect(visibilityScale(span, 100)).toBe(1);
    const far = 400;
    const s = visibilityScale(span, far);
    expect(s).toBeGreaterThan(1.5);
    // Seen from 400 m, it spans the minimum angle.
    expect((Math.atan(span * s / far) * 180) / Math.PI).toBeCloseTo(TARGET_VISIBILITY_CONFIG.minApparentDeg, 1);
    expect(visibilityScale(span, 20_000)).toBe(TARGET_VISIBILITY_CONFIG.maxScale);
    const parked = createParkedState(spec, { position: { x: 0, y: 0, z: 0 }, headingDegrees: 0 });
    expect(enlargeBlend(parked, spec, 0)).toBe(0);
    expect(enlargeBlend(createAirborneState(spec, { x: 0, y: 500, z: 0 }, 0, 110, 0.7), spec, 0)).toBe(1);
  });

  it('far off, rounds that pass the real aircraft but cross its larger drawn shape hit (only for a shooter with the aid), and the cue agrees', () => {
    const ahead = 450;
    const offset = 15; // beyond the real wing spheres plus the near-miss allowance; inside the drawn shape
    expect(firingAt(ahead, offset, HIT_ASSIST_CONFIG.nearMissMetres).hits).toBe(0);
    const aided = firingAt(ahead, offset, HIT_ASSIST_CONFIG.nearMissMetres, true);
    expect(aided.hits).toBeGreaterThan(0);
    expect(roundsWouldHit(aided.shooter, spec, aided.target, spec, HIT_ASSIST_CONFIG.nearMissMetres, 0)).toBe(false);
    expect(roundsWouldHit(aided.shooter, spec, aided.target, spec, HIT_ASSIST_CONFIG.nearMissMetres, 1)).toBe(true);
    // Well outside even the drawn shape: still a miss.
    expect(firingAt(ahead, 45, HIT_ASSIST_CONFIG.nearMissMetres, true).hits).toBe(0);
  });
});

describe('gunnery aids', () => {
  it('the on-target cue agrees with the rounds: on when they would hit, off when they would miss', () => {
    const on = firingAt(250, 0, 0);
    expect(roundsWouldHit(on.shooter, spec, on.target, spec, HIT_ASSIST_CONFIG.nearMissMetres)).toBe(true);
    const off = firingAt(250, 25, 0);
    expect(roundsWouldHit(off.shooter, spec, off.target, spec, HIT_ASSIST_CONFIG.nearMissMetres)).toBe(false);
  });

  it('the lead points ahead of a crossing target, by its speed times the time of flight', () => {
    const shooter = createAirborneState(spec, { x: 0, y: 500, z: 0 }, 0, 110, 0.7);
    const crossing = createAirborneState(spec, { x: 0, y: 500, z: 400 }, 90, 120, 0.7); // flying east, 400 m ahead
    const out = { x: 0, y: 0, z: 0 };
    const time = leadDirection(shooter, spec, crossing, out);
    expect(time).toBeGreaterThan(0.3);
    expect(out.x).toBeCloseTo(120 * time, 0);
  });
});

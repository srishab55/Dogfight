import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  CombatWorld,
  GUN_SPECS,
  PRACTICE_TARGET_CONFIG,
  ProjectilePool,
  createAirborneState,
  createFlatGround,
  createGunState,
  createPracticeTargets,
  gunMounts,
  segmentSphereIntersection,
  stepGuns,
  type AircraftState,
  type GunSpec,
  type PracticeTarget,
} from '../src/index';
import { quatFromAxisAngle, quatIdentity } from '../src/math/quat';
import { STEP } from './testPilot';

const ground = createFlatGround();
const spec = AIRCRAFT_CLASSES.fighterBomber;
const gun = GUN_SPECS.fighterBomber;
const noScatter: GunSpec = { ...gun, dispersionDeg: 0 };
const ignoreImpacts = { onGroundImpact: () => {}, onTargetHit: () => {} };

/** A practice balloon at `position`, standing (or burst, with a respawn timer). */
const balloonAt = (position: { x: number; y: number; z: number }, health: number = PRACTICE_TARGET_CONFIG.maxHealth, respawnTimer = 0): PracticeTarget => ({
  ...(createPracticeTargets()[0] as PracticeTarget),
  id: 0,
  position,
  health,
  respawnTimer,
});

/** Level aircraft flying north at 1 km altitude. */
const flyingNorth = (speed = 100): AircraftState => createAirborneState(spec, { x: 0, y: 1000, z: 0 }, 0, speed, 0.7);

/** Holds the trigger for `seconds`, returning rounds fired. */
function fire(guns = createGunState(spec), seconds: number, pool = new ProjectilePool(4096), aircraft = flyingNorth(), gunSpec = gun, trigger = true): number {
  let fired = 0;
  for (let t = 0; t < seconds - 1e-9; t += STEP) fired += stepGuns(guns, aircraft, spec, gunSpec, trigger, pool, 1, STEP);
  return fired;
}

describe('guns: rate of fire, heat and overheating', () => {
  it('fire at the configured rate across all guns', () => {
    const expected = gun.roundsPerSecondPerGun * gunMounts(spec).length;
    expect(fire(createGunState(spec), 1)).toBeGreaterThanOrEqual(expected - 1);
    expect(fire(createGunState(spec), 1)).toBeLessThanOrEqual(expected + 1);
  });

  it('the first round leaves the instant the trigger is pulled', () => {
    expect(fire(createGunState(spec), STEP)).toBe(1);
  });

  it('overheat after sustained fire, lock out, and recover once cooled', () => {
    const guns = createGunState(spec);
    fire(guns, gun.secondsToOverheat + 0.1);
    expect(guns.overheated).toBe(true);
    expect(fire(guns, 0.5)).toBe(0); // locked: trigger does nothing
    // Cool off with the trigger released until below the recovery level.
    const coolTime = ((1 - gun.recoverBelowHeat) * gun.secondsToCool) + 0.2;
    fire(guns, coolTime, undefined, undefined, gun, false);
    expect(guns.overheated).toBe(false);
    expect(fire(guns, 0.2)).toBeGreaterThan(0);
  });

  it('short bursts stay cool: heat falls between bursts', () => {
    const guns = createGunState(spec);
    for (let i = 0; i < 10; i++) {
      fire(guns, 1);
      fire(guns, 1, undefined, undefined, gun, false);
    }
    expect(guns.overheated).toBe(false);
  });

  it('a crashed aircraft cannot fire', () => {
    const aircraft = flyingNorth();
    aircraft.crashed = true;
    expect(fire(createGunState(spec), 1, undefined, aircraft)).toBe(0);
  });
});

describe('ballistics', () => {
  it('rounds inherit the aircraft velocity on top of muzzle velocity', () => {
    const pool = new ProjectilePool(64);
    stepGuns(createGunState(spec), flyingNorth(150), spec, noScatter, true, pool, 1, STEP);
    const i = pool.active.indexOf(1);
    const speed = Math.hypot(pool.vx[i] ?? 0, pool.vy[i] ?? 0, pool.vz[i] ?? 0);
    expect(speed).toBeGreaterThan(gun.muzzleVelocity + 145);
    expect(speed).toBeLessThan(gun.muzzleVelocity + 151);
  });

  it('rounds fall under gravity: about 4.9 m below their launch line after 1 s', () => {
    const pool = new ProjectilePool(4);
    pool.spawn({ x: 0, y: 1000, z: 0 }, { x: 0, y: 0, z: 800 }, 5, 1, 1);
    for (let t = 0; t < 1 - 1e-9; t += STEP) pool.step(STEP, ground, [], ignoreImpacts);
    expect(1000 - (pool.py[0] ?? 0)).toBeCloseTo(4.9, 0);
  });

  it('guns converge: left and right streams cross at the convergence distance', () => {
    const pool = new ProjectilePool(64);
    const guns = createGunState(spec);
    // Fire one round from each of the first two guns (outer left and outer right).
    stepGuns(guns, flyingNorth(0), spec, noScatter, true, pool, 1, STEP);
    stepGuns(guns, flyingNorth(0), spec, noScatter, true, pool, 1, (1 / (gun.roundsPerSecondPerGun * 4)) * 1.01);
    const [a, b] = [0, 1];
    // Both reach z = convergence distance; compare their sideways positions there.
    const xAt = (i: number) => {
      const t = (noScatter.convergenceDistance - (pool.pz[i] ?? 0)) / (pool.vz[i] ?? 1);
      return (pool.px[i] ?? 0) + (pool.vx[i] ?? 0) * t;
    };
    expect(Math.abs(xAt(a))).toBeLessThan(0.05);
    expect(Math.abs(xAt(b))).toBeLessThan(0.05);
  });

  it('rounds expire after their lifetime', () => {
    const pool = new ProjectilePool(4);
    pool.spawn({ x: 0, y: 3000, z: 0 }, { x: 0, y: 0, z: 800 }, 0.5, 1, 1);
    for (let t = 0; t < 0.6; t += STEP) pool.step(STEP, ground, [], ignoreImpacts);
    expect(pool.activeCount).toBe(0);
  });
});

describe('hit detection', () => {
  it('segment-sphere test catches a sphere crossed mid-step (no tunnelling)', () => {
    const sphere = { position: { x: 0, y: 0, z: 7 }, radius: 1 };
    // A 15 m step that starts 7 m before the centre and ends 8 m past it.
    expect(segmentSphereIntersection(0, 0, 0, 0, 0, 15, sphere)).toBeCloseTo(6 / 15, 6);
    expect(segmentSphereIntersection(0, 2, 0, 0, 0, 15, sphere)).toBe(Infinity); // passes 2 m above
  });

  it('firing at a balloon dead ahead bursts it', () => {
    const target = balloonAt({ x: 0, y: 1000, z: 400 });
    const world = new CombatWorld(ground, [target]);
    const aircraft = flyingNorth();
    const guns = createGunState(spec);
    const events: string[] = [];
    for (let t = 0; t < 3; t += STEP) {
      world.step(STEP, [{ id: 1, team: 'blue', state: aircraft, spec, guns, trigger: t < 1.5 }]);
      events.push(...world.drainEvents().map((e) => e.type));
    }
    expect(events).toContain('targetHit');
    expect(events).toContain('targetDestroyed');
    expect(target.health).toBe(0);
  });

  it('rounds fired downward hit the ground and are removed', () => {
    const world = new CombatWorld(ground, []);
    const aircraft = flyingNorth();
    aircraft.position.y = 200;
    quatFromAxisAngle(aircraft.orientation, { x: 1, y: 0, z: 0 }, Math.PI / 4); // nose 45 degrees down
    const guns = createGunState(spec);
    let groundImpacts = 0;
    for (let t = 0; t < 2; t += STEP) {
      world.step(STEP, [{ id: 1, team: 'blue', state: aircraft, spec, guns, trigger: t < 0.5 }]);
      groundImpacts += world.drainEvents().filter((e) => e.type === 'groundImpact').length;
    }
    expect(groundImpacts).toBeGreaterThan(10);
    expect(world.projectiles.activeCount).toBe(0);
  });

  it('a burst balloon reappears after its respawn time', () => {
    const target = balloonAt({ x: 0, y: 1000, z: 400 }, 0, PRACTICE_TARGET_CONFIG.respawnSeconds);
    const world = new CombatWorld(ground, [target]);
    for (let t = 0; t < PRACTICE_TARGET_CONFIG.respawnSeconds + 0.1; t += STEP) world.step(STEP, []);
    expect(target.health).toBe(PRACTICE_TARGET_CONFIG.maxHealth);
  });
});

describe('determinism', () => {
  it('the same trigger input scatters rounds identically', () => {
    const run = () => {
      const pool = new ProjectilePool(512);
      const aircraft = flyingNorth();
      aircraft.orientation = quatIdentity();
      fire(createGunState(spec), 2, pool, aircraft);
      return Array.from(pool.px).concat(Array.from(pool.py));
    };
    expect(run()).toEqual(run());
  });
});

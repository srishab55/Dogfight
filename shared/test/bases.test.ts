import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  BASE_DEFENCE_KINDS,
  CAPTURE_CONFIG,
  CombatWorld,
  RED_RUNWAY,
  baseSpawnPoint,
  createGunState,
  createParkedState,
  createServiceStatus,
  createTargets,
  createTerrain,
  createWorldGround,
  stepService,
  teamBase,
  type CombatEvent,
  type Shooter,
} from '../src/index';
import { STEP } from './testPilot';

const spec = AIRCRAFT_CLASSES.fighterBomber;
const ground = createWorldGround(createTerrain());

/** A Blue aircraft stopped on Red's runway. */
function landedOnRedRunway(): Shooter {
  const state = createParkedState(spec, baseSpawnPoint(teamBase('red', 'airfield')));
  return { id: 1, team: 'blue', state, spec, guns: createGunState(spec), trigger: false };
}

function destroyDefences(world: CombatWorld): void {
  for (const target of world.targets) if (target.baseId === 'red-airfield' && BASE_DEFENCE_KINDS.includes(target.kind)) while (target.health > 0) world.applyHit(target, 5, 1);
}

function run(world: CombatWorld, shooters: Shooter[], seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    world.step(STEP, shooters);
    events.push(...world.drainEvents());
  }
  return events;
}

describe('capturing a base', () => {
  it('a defended base cannot be captured, even by landing on it', () => {
    const world = new CombatWorld(ground, createTargets());
    run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds * 2);
    expect(world.ownerOf(teamBase('red', 'airfield'))).toBe('red');
  });

  it('destroying its AA gun, hangar, fuel depot and radar neutralizes it; landing and stopping there then captures it', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    const neutralized = run(world, [], 0.1);
    expect(neutralized.some((e) => e.type === 'baseNeutralized' && e.baseId === 'red-airfield')).toBe(true);
    const control = world.bases.find((b) => b.base.id === 'red-airfield');
    // Part-way: capture under way.
    run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds / 2);
    expect(control?.captureProgress).toBeGreaterThan(0.4);
    expect(control?.capturingTeam).toBe('blue');
    const events = run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds);
    expect(events.some((e) => e.type === 'baseCaptured' && e.owner === 'blue')).toBe(true);
    expect(world.ownerOf(teamBase('red', 'airfield'))).toBe('blue');
  });

  it('a captured base rearms its new owner, and its old defences stay down', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds + 0.5);
    // Rearm there.
    const shooter = landedOnRedRunway();
    shooter.guns.ammo = 0;
    const status = createServiceStatus();
    for (let t = 0; t < 8; t += STEP) stepService(status, shooter.state, spec, shooter.guns, 'blue', STEP, world.ownerOf);
    expect(shooter.guns.ammo).toBeGreaterThan(0);
    // Its defences never come back.
    run(world, [], 300);
    for (const target of world.targets.filter((t) => t.baseId === 'red-airfield')) expect(target.health).toBe(0);
    expect(world.aaGuns.some((g) => g.target.baseId === 'red-airfield' && g.target.health > 0)).toBe(false);
  });

  it('left alone, a neutralized base rebuilds its defences and is defended again', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    const events = run(world, [], 245);
    expect(events.some((e) => e.type === 'baseDefended' && e.baseId === 'red-airfield')).toBe(true);
    expect(world.bases.find((b) => b.base.id === 'red-airfield')?.neutralized).toBe(false);
  });

  it('rolling through without stopping, or flying over, does not capture', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    const rolling = landedOnRedRunway();
    rolling.state.velocity.z = -20;
    run(world, [rolling], 1);
    expect(world.bases.find((b) => b.base.id === 'red-airfield')?.captureProgress).toBe(0);
    expect(RED_RUNWAY.id).toBe('red-airfield');
  });
});

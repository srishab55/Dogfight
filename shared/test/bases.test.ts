import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  BASE_DEFENCE_KINDS,
  CAPTURE_CONFIG,
  CombatWorld,
  RED_RUNWAY,
  baseSpawnPoint,
  createGunState,
  createAirborneState,
  createCarrierStatuses,
  createParkedState,
  createServiceStatus,
  createTargets,
  createTerrain,
  createWorldGround,
  runwayLocal,
  startingBases,
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

  it('a captured base rearms its new owner, and is repaired for them: its defences come back on their side', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds + 0.5);
    // Rearm there.
    const shooter = landedOnRedRunway();
    shooter.guns.ammo = 0;
    const status = createServiceStatus();
    for (let t = 0; t < 8; t += STEP) stepService(status, shooter.state, spec, shooter.guns, 'blue', STEP, world.ownerOf);
    expect(shooter.guns.ammo).toBeGreaterThan(0);
    // Everything there is Blue's now.
    for (const target of world.targets.filter((t) => t.baseId === 'red-airfield')) expect(target.team).toBe('blue');
    // The crews repair its defences.
    const events = run(world, [], CAPTURE_CONFIG.repairSeconds + 1);
    for (const target of world.targets.filter((t) => t.baseId === 'red-airfield' && BASE_DEFENCE_KINDS.includes(t.kind))) expect(target.health).toBe(target.maxHealth);
    expect(events.some((e) => e.type === 'baseDefended' && e.baseId === 'red-airfield' && e.owner === 'blue')).toBe(true);
    expect(world.bases.find((b) => b.base.id === 'red-airfield')?.neutralized).toBe(false);
  });

  it("the repaired AA gun defends it for its new owner: it holds fire at Blue and fires at Red", () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds + CAPTURE_CONFIG.repairSeconds + 1);
    const gun = world.aaGuns.find((g) => g.target.baseId === 'red-airfield')!;
    expect(gun.target.health).toBeGreaterThan(0);
    const near = (team: 'blue' | 'red'): Shooter => ({ id: 2, team, state: createAirborneState(spec, { x: gun.target.position.x + 300, y: 300, z: gun.target.position.z + 600 }, 180, 100, 0.7), spec, guns: createGunState(spec), trigger: false });
    const atBlue = run(world, [near('blue')], 6).filter((e) => e.type === 'aaFired');
    const atRed = run(world, [near('red')], 6).filter((e) => e.type === 'aaFired');
    expect(atBlue).toHaveLength(0);
    expect(atRed.length).toBeGreaterThan(0);
  });

  it('left alone, a neutralized base stays defenceless: nothing rebuilds itself', () => {
    const world = new CombatWorld(ground, createTargets());
    destroyDefences(world);
    const events = run(world, [], 300);
    expect(events.some((e) => e.type === 'baseDefended')).toBe(false);
    expect(world.bases.find((b) => b.base.id === 'red-airfield')?.neutralized).toBe(true);
    for (const target of world.targets.filter((t) => t.baseId === 'red-airfield' && BASE_DEFENCE_KINDS.includes(t.kind))) expect(target.health).toBe(0);
  });

  it('a damaged (not destroyed) defence is not repaired either, until captured', () => {
    const world = new CombatWorld(ground, createTargets());
    const radar = world.targets.find((t) => t.kind === 'radar')!;
    world.applyHit(radar, 10, 1);
    run(world, [], 300);
    expect(radar.health).toBe(radar.maxHealth - 10);
  });

  describe('where you can start from', () => {
    it("Blue starts from its airfield and carrier; once it captures Red's airfield, from there too", () => {
      const world = new CombatWorld(ground, createTargets());
      const ids = () => startingBases('blue', spec, world.ownerOf).map((b) => b.id);
      expect(ids()).toEqual(['blue-airfield', 'blue-carrier']);
      destroyDefences(world);
      run(world, [landedOnRedRunway()], CAPTURE_CONFIG.seconds + 0.5);
      expect(ids()).toEqual(['blue-airfield', 'blue-carrier', 'red-airfield']);
      // Red now has only its carrier.
      expect(startingBases('red', spec, world.ownerOf).map((b) => b.id)).toEqual(['red-carrier']);
    });

    it('the Heavy Bomber never starts from a carrier, and nobody starts from a sinking one', () => {
      const world = new CombatWorld(ground, createTargets());
      expect(startingBases('blue', AIRCRAFT_CLASSES.heavyBomber, world.ownerOf).map((b) => b.id)).toEqual(['blue-airfield']);
      const statuses = createCarrierStatuses();
      statuses.get('blue-carrier')!.sink = 2;
      expect(startingBases('blue', AIRCRAFT_CLASSES.navalFighter, world.ownerOf, statuses).map((b) => b.id)).toEqual(['blue-airfield']);
    });
  });

  describe('the radar, beside the runway', () => {
    const runway = teamBase('red', 'airfield').runway;
    /** Where a Blue aircraft landing northbound (the way in from Blue's side) typically stops: on the centreline, past the middle. */
    const stopAlong = -110;
    const stopPoint = () => {
      const h = (runway.headingDegrees * Math.PI) / 180;
      return { x: runway.center.x + Math.sin(h) * stopAlong, z: runway.center.z + Math.cos(h) * stopAlong };
    };

    it('stands just off the runway, a few hundred metres ahead of where you stop, nearly in line', () => {
      const radar = createTargets().find((t) => t.kind === 'radar')!;
      const local = runwayLocal(runway, radar.position.x, radar.position.z);
      expect(Math.abs(local.across)).toBeLessThan(60);
      const stop = stopPoint();
      const ahead = { x: radar.position.x - stop.x, z: radar.position.z - stop.z };
      const bearing = (Math.atan2(ahead.x, ahead.z) * 180) / Math.PI; // the aircraft faces north (0)
      expect(Math.hypot(ahead.x, ahead.z)).toBeLessThan(450);
      expect(Math.abs(bearing)).toBeLessThan(10);
    });

    it('can be shot from an aircraft stopped on the runway, which then captures the base by staying put', () => {
      const world = new CombatWorld(ground, createTargets());
      // The AA gun, hangar and fuel depot already destroyed from the air.
      for (const target of world.targets) if (target.baseId === 'red-airfield' && target.kind !== 'radar' && BASE_DEFENCE_KINDS.includes(target.kind)) while (target.health > 0) world.applyHit(target, 5, 1);
      const radar = world.targets.find((t) => t.kind === 'radar')!;
      const stop = stopPoint();
      // A touch of rudder on the ground: nose pointed at the radar.
      const heading = (Math.atan2(radar.position.x - stop.x, radar.position.z - stop.z) * 180) / Math.PI;
      const state = createParkedState(spec, { position: { x: stop.x, y: runway.center.y, z: stop.z }, headingDegrees: heading });
      const shooter: Shooter = { id: 1, team: 'blue', state, spec, guns: createGunState(spec), trigger: true };
      let destroyedAfter = -1;
      for (let t = 0; t < 6 && destroyedAfter < 0; t += STEP) {
        world.step(STEP, [shooter]);
        if (world.drainEvents().some((e) => e.type === 'targetDestroyed' && e.targetId === radar.id)) destroyedAfter = t;
      }
      expect(destroyedAfter).toBeGreaterThan(0);
      expect(destroyedAfter).toBeLessThan(4);
      const events = run(world, [{ ...shooter, trigger: false }], CAPTURE_CONFIG.seconds + 1);
      expect(events.some((e) => e.type === 'baseCaptured' && e.owner === 'blue')).toBe(true);
    });
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

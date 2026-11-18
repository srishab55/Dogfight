import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  BASE_DEFENCE_KINDS,
  CAPTURE_CONFIG,
  CombatWorld,
  airStartBases,
  baseById,
  baseSpawnPoint,
  basesHeld,
  createGunState,
  createAirborneState,
  createCarrierStatuses,
  createParkedState,
  createServiceStatus,
  createTargets,
  createTerrain,
  createWorldGround,
  homeBase,
  runwayLocal,
  startingBases,
  stepService,
  type CombatEvent,
  type Shooter,
  type Team,
} from '../src/index';
import { STEP } from './testPilot';

const spec = AIRCRAFT_CLASSES.fighterBomber;
const ground = createWorldGround(createTerrain());

/** An aircraft of `team` stopped at the start of a base's runway (a carrier: on the deck). */
function landedAt(baseId: string, team: Team, id = 1): Shooter {
  const state = createParkedState(spec, baseSpawnPoint(baseById(baseId)), baseById(baseId).kind === 'carrier');
  return { id, team, state, spec, guns: createGunState(spec), trigger: false };
}

function destroyDefences(world: CombatWorld, baseId: string): void {
  for (const target of world.targets) if (target.baseId === baseId && BASE_DEFENCE_KINDS.includes(target.kind)) while (target.health > 0) world.applyHit(target, 5, 1);
}

function run(world: CombatWorld, shooters: Shooter[], seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    world.step(STEP, shooters);
    events.push(...world.drainEvents());
  }
  return events;
}

/** `team` lands on a field nobody holds, takes it, and its crews build the defences. */
function takeAndBuild(world: CombatWorld, baseId: string, team: Team): void {
  run(world, [landedAt(baseId, team, 7)], CAPTURE_CONFIG.seconds + 0.5);
  run(world, [], CAPTURE_CONFIG.repairSeconds + 1);
}

describe('bases at the start of a match', () => {
  it('each team holds its carrier; the three island airfields belong to nobody, their AA guns not yet built', () => {
    const world = new CombatWorld(ground, createTargets());
    expect(world.ownerOf(homeBase('blue'))).toBe('blue');
    expect(world.ownerOf(homeBase('red'))).toBe('red');
    for (const id of ['south-airfield', 'central-airfield', 'north-airfield']) {
      expect(world.ownerOf(baseById(id))).toBeNull();
      const gun = world.targets.find((t) => t.baseId === id && t.kind === 'aaGun')!;
      expect(gun.built).toBe(false);
      expect(gun.health).toBe(0);
      // The buildings stand, nobody's.
      for (const t of world.targets.filter((x) => x.baseId === id && x.kind !== 'aaGun')) {
        expect(t.health).toBe(t.maxHealth);
        expect(t.team).toBeNull();
      }
    }
    expect(basesHeld(world.bases, 'blue')).toBe(1);
    expect(basesHeld(world.bases, 'red')).toBe(1);
  });

  it("nobody's AA gun fires at anyone", () => {
    const world = new CombatWorld(ground, createTargets());
    const gun = world.targets.find((t) => t.baseId === 'central-airfield' && t.kind === 'aaGun')!;
    const passer = (team: Team): Shooter => ({ id: 2, team, state: createAirborneState(spec, { x: gun.position.x + 300, y: 300, z: gun.position.z + 600 }, 180, 100, 0.7), spec, guns: createGunState(spec), trigger: false });
    const fired = [...run(world, [passer('blue')], 4), ...run(world, [passer('red')], 4)].filter((e) => e.type === 'aaFired' && e.targetId === gun.id);
    expect(fired).toHaveLength(0);
  });
});

describe('capturing a base', () => {
  it('a field nobody holds is taken just by landing and stopping on it', () => {
    const world = new CombatWorld(ground, createTargets());
    const control = world.bases.find((b) => b.base.id === 'south-airfield')!;
    run(world, [landedAt('south-airfield', 'blue')], CAPTURE_CONFIG.seconds / 2);
    expect(control.captureProgress).toBeGreaterThan(0.4);
    expect(control.capturingTeam).toBe('blue');
    const events = run(world, [landedAt('south-airfield', 'blue')], CAPTURE_CONFIG.seconds);
    expect(events.some((e) => e.type === 'baseCaptured' && e.baseId === 'south-airfield' && e.owner === 'blue' && e.previousOwner === null)).toBe(true);
    expect(world.ownerOf(baseById('south-airfield'))).toBe('blue');
    expect(basesHeld(world.bases, 'blue')).toBe(2);
  });

  it('then its crews build its AA gun for the new owner, and it rearms them', () => {
    const world = new CombatWorld(ground, createTargets());
    run(world, [landedAt('south-airfield', 'blue')], CAPTURE_CONFIG.seconds + 0.5);
    const shooter = landedAt('south-airfield', 'blue');
    shooter.guns.ammo = 0;
    const status = createServiceStatus();
    for (let t = 0; t < 8; t += STEP) stepService(status, shooter.state, spec, shooter.guns, 'blue', STEP, world.ownerOf);
    expect(shooter.guns.ammo).toBeGreaterThan(0);
    for (const target of world.targets.filter((t) => t.baseId === 'south-airfield')) expect(target.team).toBe('blue');
    run(world, [], CAPTURE_CONFIG.repairSeconds + 1);
    const gun = world.targets.find((t) => t.baseId === 'south-airfield' && t.kind === 'aaGun')!;
    expect(gun.built).toBe(true);
    expect(gun.health).toBe(gun.maxHealth);
  });

  it("a held field can't be taken while it's defended, even by landing on it", () => {
    const world = new CombatWorld(ground, createTargets());
    takeAndBuild(world, 'north-airfield', 'red');
    run(world, [landedAt('north-airfield', 'blue')], CAPTURE_CONFIG.seconds * 2);
    expect(world.ownerOf(baseById('north-airfield'))).toBe('red');
  });

  it('destroying its AA gun, hangar, fuel depot and radar neutralizes it; landing and stopping there then captures it', () => {
    const world = new CombatWorld(ground, createTargets());
    takeAndBuild(world, 'north-airfield', 'red');
    destroyDefences(world, 'north-airfield');
    const neutralized = run(world, [], 0.1);
    expect(neutralized.some((e) => e.type === 'baseNeutralized' && e.baseId === 'north-airfield')).toBe(true);
    const events = run(world, [landedAt('north-airfield', 'blue')], CAPTURE_CONFIG.seconds + 0.5);
    expect(events.some((e) => e.type === 'baseCaptured' && e.owner === 'blue' && e.previousOwner === 'red')).toBe(true);
    // Repaired for Blue, and defended again.
    const after = run(world, [], CAPTURE_CONFIG.repairSeconds + 1);
    for (const target of world.targets.filter((t) => t.baseId === 'north-airfield' && BASE_DEFENCE_KINDS.includes(t.kind))) expect(target.health).toBe(target.maxHealth);
    expect(after.some((e) => e.type === 'baseDefended' && e.baseId === 'north-airfield' && e.owner === 'blue')).toBe(true);
  });

  it("the built AA gun defends it for its owner: it holds fire at Blue and fires at Red", () => {
    const world = new CombatWorld(ground, createTargets());
    takeAndBuild(world, 'south-airfield', 'blue');
    const gun = world.aaGuns.find((g) => g.target.baseId === 'south-airfield')!;
    const near = (team: Team): Shooter => ({ id: 2, team, state: createAirborneState(spec, { x: gun.target.position.x + 300, y: 300, z: gun.target.position.z + 600 }, 180, 100, 0.7), spec, guns: createGunState(spec), trigger: false });
    const atBlue = run(world, [near('blue')], 6).filter((e) => e.type === 'aaFired');
    const atRed = run(world, [near('red')], 6).filter((e) => e.type === 'aaFired');
    expect(atBlue).toHaveLength(0);
    expect(atRed.length).toBeGreaterThan(0);
  });

  it('left alone, a neutralized base stays defenceless: nothing rebuilds itself', () => {
    const world = new CombatWorld(ground, createTargets());
    takeAndBuild(world, 'north-airfield', 'red');
    destroyDefences(world, 'north-airfield');
    const events = run(world, [], 300);
    expect(events.some((e) => e.type === 'baseDefended')).toBe(false);
    expect(world.bases.find((b) => b.base.id === 'north-airfield')?.neutralized).toBe(true);
  });

  it('a damaged (not destroyed) defence is not repaired either', () => {
    const world = new CombatWorld(ground, createTargets());
    const radar = world.targets.find((t) => t.kind === 'radar')!;
    world.applyHit(radar, 10, 1);
    run(world, [], 300);
    expect(radar.health).toBe(radar.maxHealth - 10);
  });

  it('rolling through without stopping, or flying over, does not capture', () => {
    const world = new CombatWorld(ground, createTargets());
    const rolling = landedAt('central-airfield', 'blue');
    rolling.state.velocity.x = 20;
    run(world, [rolling], 1);
    expect(world.bases.find((b) => b.base.id === 'central-airfield')?.captureProgress).toBe(0);
  });

  describe('a carrier is captured like an airfield', () => {
    it("Red's carrier: shoot its AA gun, land on the deck and stop; then Red holds nothing", () => {
      const world = new CombatWorld(ground, createTargets());
      run(world, [landedAt('red-carrier', 'blue')], CAPTURE_CONFIG.seconds * 2);
      expect(world.ownerOf(homeBase('red'))).toBe('red'); // defended by its gun
      destroyDefences(world, 'red-carrier');
      const events = run(world, [landedAt('red-carrier', 'blue')], CAPTURE_CONFIG.seconds + 0.5);
      expect(events.some((e) => e.type === 'baseCaptured' && e.baseId === 'red-carrier' && e.owner === 'blue')).toBe(true);
      expect(basesHeld(world.bases, 'red')).toBe(0);
      expect(startingBases('red', spec, world.ownerOf)).toEqual([]);
      expect(startingBases('blue', spec, world.ownerOf).map((b) => b.id)).toEqual(['blue-carrier', 'red-carrier']);
    });
  });

  describe('where you can start from', () => {
    it('Blue starts from its carrier; once it takes the south airfield, from there too', () => {
      const world = new CombatWorld(ground, createTargets());
      const ids = () => startingBases('blue', spec, world.ownerOf).map((b) => b.id);
      expect(ids()).toEqual(['blue-carrier']);
      run(world, [landedAt('south-airfield', 'blue')], CAPTURE_CONFIG.seconds + 0.5);
      expect(ids()).toEqual(['blue-carrier', 'south-airfield']);
      expect(startingBases('red', spec, world.ownerOf).map((b) => b.id)).toEqual(['red-carrier']);
    });

    it('the Heavy Bomber never starts on a carrier deck, but can be launched into the air over one; nobody starts from a sinking carrier', () => {
      const world = new CombatWorld(ground, createTargets());
      expect(startingBases('blue', AIRCRAFT_CLASSES.heavyBomber, world.ownerOf)).toEqual([]);
      expect(airStartBases('blue', world.ownerOf).map((b) => b.id)).toEqual(['blue-carrier']);
      const statuses = createCarrierStatuses();
      statuses.get('blue-carrier')!.sink = 2;
      expect(startingBases('blue', AIRCRAFT_CLASSES.navalFighter, world.ownerOf, statuses)).toEqual([]);
      expect(airStartBases('blue', world.ownerOf, statuses)).toEqual([]);
    });
  });

  describe('the radar, beside the runway', () => {
    const runway = baseById('north-airfield').runway;
    /** Landing towards the radar's end of the runway (against its heading), an aircraft typically stops here: on the centreline, past the middle. */
    const stopAlong = -110;
    const landingHeading = (runway.headingDegrees + 180) % 360;
    const stopPoint = () => {
      const h = (runway.headingDegrees * Math.PI) / 180;
      return { x: runway.center.x + Math.sin(h) * stopAlong, z: runway.center.z + Math.cos(h) * stopAlong };
    };

    it('stands just off the runway, a few hundred metres ahead of where you stop, nearly in line', () => {
      const radar = createTargets().find((t) => t.kind === 'radar' && t.baseId === 'north-airfield')!;
      const local = runwayLocal(runway, radar.position.x, radar.position.z);
      expect(Math.abs(local.across)).toBeLessThan(60);
      const stop = stopPoint();
      const ahead = { x: radar.position.x - stop.x, z: radar.position.z - stop.z };
      const bearing = (Math.atan2(ahead.x, ahead.z) * 180) / Math.PI;
      expect(Math.hypot(ahead.x, ahead.z)).toBeLessThan(450);
      expect(Math.abs(((bearing - landingHeading + 540) % 360) - 180)).toBeLessThan(10);
    });

    it('can be shot from an aircraft stopped on the runway, which then captures the base by staying put', () => {
      const world = new CombatWorld(ground, createTargets());
      takeAndBuild(world, 'north-airfield', 'red');
      // The AA gun, hangar and fuel depot already destroyed from the air.
      for (const target of world.targets) if (target.baseId === 'north-airfield' && target.kind !== 'radar' && BASE_DEFENCE_KINDS.includes(target.kind)) while (target.health > 0) world.applyHit(target, 5, 1);
      const radar = world.targets.find((t) => t.kind === 'radar' && t.baseId === 'north-airfield')!;
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
});

describe('a new match', () => {
  it('reset() puts every base, gun and building back as at the start', () => {
    const world = new CombatWorld(ground, createTargets());
    takeAndBuild(world, 'south-airfield', 'blue');
    destroyDefences(world, 'red-carrier');
    world.reset();
    expect(world.ownerOf(baseById('south-airfield'))).toBeNull();
    expect(world.targets.find((t) => t.baseId === 'south-airfield' && t.kind === 'aaGun')?.built).toBe(false);
    const redGun = world.targets.find((t) => t.baseId === 'red-carrier' && t.kind === 'aaGun')!;
    expect(redGun.health).toBe(redGun.maxHealth);
    expect(world.bases.every((b) => b.captureProgress === 0 && !b.neutralized)).toBe(true);
    expect(world.projectiles.activeCount).toBe(0);
  });
});

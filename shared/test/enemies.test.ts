import { describe, expect, it } from 'vitest';
import {
  AA_GUN_CONFIG,
  AIRCRAFT_CLASSES,
  CARRIER_DAMAGE_CONFIG,
  CombatWorld,
  PARKED_AIRCRAFT_CONFIG,
  RED_CARRIER,
  WORLD_CONFIG,
  createAirborneState,
  createCarrierStatuses,
  createFlatGround,
  createGunState,
  createTargets,
  createTerrain,
  createWorldGround,
  neutralControls,
  stepAircraft,
  type AircraftState,
  type CombatEvent,
  type CombatTarget,
  type GroundQuery,
  type Shooter,
} from '../src/index';
import { STEP } from './testPilot';

const spec = AIRCRAFT_CLASSES.fighterBomber;
const terrain = createTerrain();

/** A Blue aircraft in the fight, flying straight and level (crudely holding height). */
function blueShooter(state: AircraftState, trigger = false): Shooter {
  return { id: 1, team: 'blue', state, spec, guns: createGunState(spec), trigger };
}

/** Steps flight and combat together for `seconds`, collecting events. */
function run(world: CombatWorld, ground: GroundQuery, shooters: Shooter[], seconds: number, holdHeight: number | null = null): CombatEvent[] {
  const events: CombatEvent[] = [];
  const controls = { ...neutralControls(), throttle: 0.75 };
  for (let t = 0; t < seconds; t += STEP) {
    for (const s of shooters) {
      if (holdHeight !== null) controls.pitch = Math.max(-1, Math.min(1, (holdHeight - s.state.position.y) / 40 - s.state.velocity.y / 8));
      stepAircraft(s.state, controls, s.spec, ground, STEP);
    }
    world.step(STEP, shooters);
    events.push(...world.drainEvents());
  }
  return events;
}

const firstOf = (targets: CombatTarget[], kind: CombatTarget['kind'], onCarrier = false) => {
  const target = targets.find((t) => t.kind === kind && (t.carrierId !== null) === onCarrier);
  if (!target) throw new Error(`no ${kind}`);
  return target;
};

describe("Red's defences", () => {
  it('Red has AA guns at its airfield and on its carrier, parked aircraft, and the carrier itself; Blue has none', () => {
    const targets = createTargets();
    const red = targets.filter((t) => t.team === 'red');
    expect(red.filter((t) => t.kind === 'aaGun' && !t.carrierId)).toHaveLength(4);
    expect(red.filter((t) => t.kind === 'aaGun' && t.carrierId === RED_CARRIER.id)).toHaveLength(4);
    expect(red.filter((t) => t.kind === 'parkedAircraft')).toHaveLength(4);
    expect(red.filter((t) => t.kind === 'carrier')).toHaveLength(1);
    expect(targets.some((t) => t.team === 'blue')).toBe(false);
    // Everything stands on its island or deck, above the ground there.
    const world = createWorldGround(terrain);
    for (const t of red.filter((t) => t.kind !== 'carrier')) {
      const ground = world.heightAt(t.position.x, t.position.z);
      expect(ground).toBeGreaterThan(WORLD_CONFIG.seaLevel);
      expect(t.position.y - ground).toBeGreaterThan(0.5);
      expect(t.position.y - ground).toBeLessThan(3);
    }
  });
});

describe('anti-aircraft guns', () => {
  const flat = createFlatGround();

  it('engage an enemy aircraft flying past within range, and hit it', () => {
    const targets = createTargets();
    const gun = firstOf(targets, 'aaGun');
    const world = new CombatWorld(flat, targets);
    // Crossing east, 500 m to one side of the gun at 300 m up, at 120 m/s.
    const state = createAirborneState(spec, { x: gun.position.x - 1_300, y: 300, z: gun.position.z + 500 }, 90, 120, 0.75);
    const events = run(world, flat, [blueShooter(state)], 22, 300);
    expect(events.filter((e) => e.type === 'aaFired').length).toBeGreaterThan(10);
    const hits = events.filter((e) => e.type === 'aircraftHit');
    expect(hits.length).toBeGreaterThan(0);
    expect(state.hullHealth).toBeLessThan(spec.combat.maxHullHealth);
  });

  it('hold fire at aircraft out of range', () => {
    const targets = createTargets();
    const gun = firstOf(targets, 'aaGun');
    const world = new CombatWorld(flat, targets);
    const state = createAirborneState(spec, { x: gun.position.x - 2_500, y: 2_400, z: gun.position.z }, 270, 120, 0.75);
    const events = run(world, flat, [blueShooter(state)], 10, 2_400);
    expect(events.filter((e) => e.type === 'aaFired')).toHaveLength(0);
  });

  it('are destroyed by strafing, stop firing, and are replaced after their respawn time', () => {
    const targets = createTargets();
    const gun = firstOf(targets, 'aaGun');
    const world = new CombatWorld(flat, targets);
    // Hits straight on the gun: as many as it takes.
    let destroyed = false;
    for (let i = 0; i < 100 && !destroyed; i++) {
      world.applyHit(gun, 1, 1);
      destroyed = world.drainEvents().some((e) => e.type === 'targetDestroyed');
    }
    expect(destroyed).toBe(true);
    expect(gun.health).toBe(0);
    // A target 500 m away for the remaining guns... this one stays silent.
    const state = createAirborneState(spec, { x: gun.position.x + 200, y: 300, z: gun.position.z + 300 }, 0, 100, 0.75);
    const events = run(world, flat, [blueShooter(state)], 5, 300);
    expect(events.filter((e) => e.type === 'aaFired' && e.targetId === gun.id)).toHaveLength(0);
    // Respawns.
    let back = false;
    for (let t = 0; t < AA_GUN_CONFIG.respawnSeconds + 1 && !back; t += STEP) {
      world.step(STEP, []);
      back = world.drainEvents().some((e) => e.type === 'targetRespawned' && e.targetId === gun.id);
    }
    expect(back).toBe(true);
    expect(gun.health).toBe(AA_GUN_CONFIG.maxHealth);
  });

  it('do not hit their own side, and Blue rounds do not hit Blue aircraft', () => {
    const targets = createTargets();
    const world = new CombatWorld(flat, targets);
    const state = createAirborneState(spec, { x: 0, y: 500, z: 0 }, 0, 120, 0.75);
    // Our own guns firing: no hits on ourselves.
    const events = run(world, flat, [blueShooter(state, true)], 2, 500);
    expect(events.filter((e) => e.type === 'aircraftHit')).toHaveLength(0);
    // AA shells never damage Red targets.
    for (const target of targets.filter((t) => t.team === 'red')) expect(target.health).toBe(target.maxHealth);
  });

  it('an aircraft whose hull is shot away goes out of control, falls and crashes as "shot down"', () => {
    const sea = createWorldGround(terrain);
    const targets = createTargets();
    const gun = firstOf(targets, 'aaGun', true); // on the Red carrier, over open sea
    const world = new CombatWorld(sea, targets);
    const state = createAirborneState(spec, { x: gun.position.x - 1_200, y: 250, z: gun.position.z + 400 }, 90, 110, 0.75);
    state.hullHealth = AA_GUN_CONFIG.damagePerRound; // one hit is enough
    const shooter = blueShooter(state);
    let shotDown = false;
    const controls = { ...neutralControls(), throttle: 0.75 };
    for (let t = 0; t < 90 && !state.crashed; t += STEP) {
      controls.pitch = Math.max(-1, Math.min(1, (250 - state.position.y) / 40 - state.velocity.y / 8));
      stepAircraft(state, controls, spec, sea, STEP);
      world.step(STEP, [shooter]);
      shotDown ||= world.drainEvents().some((e) => e.type === 'aircraftShotDown');
    }
    expect(shotDown).toBe(true);
    expect(state.shotDown).toBe(true);
    expect(state.crashed).toBe(true);
    expect(state.crashReason).toBe('shot down');
  });
});

describe('parked aircraft', () => {
  it('are destroyed by gunfire and replaced later', () => {
    const targets = createTargets();
    const parked = firstOf(targets, 'parkedAircraft');
    const world = new CombatWorld(createFlatGround(), targets);
    for (let i = 0; i < PARKED_AIRCRAFT_CONFIG.maxHealth; i++) world.applyHit(parked, 1, 1);
    expect(world.drainEvents().some((e) => e.type === 'targetDestroyed' && e.targetId === parked.id)).toBe(true);
    expect(parked.health).toBe(0);
    for (let t = 0; t < PARKED_AIRCRAFT_CONFIG.respawnSeconds + 1; t += STEP) world.step(STEP, []);
    expect(parked.health).toBe(PARKED_AIRCRAFT_CONFIG.maxHealth);
  });
});

describe('the Red carrier', () => {
  /** A point on the Red carrier's deck, `fromStern` metres from its stern. */
  const deckPoint = (fromStern: number) => {
    const h = (RED_CARRIER.headingDegrees * Math.PI) / 180;
    const along = fromStern - RED_CARRIER.deckLength / 2;
    return { x: RED_CARRIER.center.x + along * Math.sin(h), z: RED_CARRIER.center.z + along * Math.cos(h) };
  };

  it('a Blue aircraft strafing the deck damages it (through its armour)', () => {
    const statuses = createCarrierStatuses();
    const ground = createWorldGround(terrain, undefined, undefined, statuses);
    const targets = createTargets();
    const carrier = firstOf(targets, 'carrier', true);
    const world = new CombatWorld(ground, targets, statuses);
    // 1.5 km astern, 300 m up, diving at the deck with guns firing.
    const aim = deckPoint(100);
    const h = (RED_CARRIER.headingDegrees * Math.PI) / 180;
    const start = { x: aim.x - 1_200 * Math.sin(h), y: RED_CARRIER.center.y + 260, z: aim.z - 1_200 * Math.cos(h) };
    const state = createAirborneState(spec, start, RED_CARRIER.headingDegrees, 120, 0.6);
    // Point the nose (and velocity) at the deck: about 12 degrees down.
    const dive = Math.atan2(start.y - RED_CARRIER.center.y, 1_200);
    state.velocity = { x: Math.sin(h) * Math.cos(dive) * 120, y: -Math.sin(dive) * 120, z: Math.cos(h) * Math.cos(dive) * 120 };
    const half = dive / 2;
    const yaw = { x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) };
    // Orientation = yaw, then pitch nose-down about the body X axis.
    state.orientation = { x: yaw.w * Math.sin(half), y: yaw.y * Math.cos(half), z: -yaw.y * Math.sin(half), w: yaw.w * Math.cos(half) };
    const shooter: Shooter = { id: 1, team: 'blue', state, spec, guns: createGunState(spec), trigger: true };
    const events: CombatEvent[] = [];
    for (let t = 0; t < 3 && !state.crashed; t += STEP) {
      world.step(STEP, [shooter]);
      events.push(...world.drainEvents());
    }
    const carrierHits = events.filter((e) => e.type === 'targetHit' && e.kind === 'carrier').length;
    expect(carrierHits).toBeGreaterThan(20);
    expect(carrier.health).toBeLessThan(carrier.maxHealth);
    expect(carrier.health).toBeCloseTo(carrier.maxHealth - carrierHits * CARRIER_DAMAGE_CONFIG.gunVulnerability, 6);
  });

  it('destroyed, it sinks (its deck becomes sea and its guns are lost), then a fresh carrier returns', () => {
    const statuses = createCarrierStatuses();
    const ground = createWorldGround(terrain, undefined, undefined, statuses);
    const targets = createTargets();
    const carrier = firstOf(targets, 'carrier', true);
    const guns = targets.filter((t) => t.kind === 'aaGun' && t.carrierId === RED_CARRIER.id);
    const world = new CombatWorld(ground, targets, statuses);
    const p = deckPoint(180);
    for (let i = 0; i < 2_000 && carrier.health > 0; i++) world.onGroundImpact(p.x, RED_CARRIER.center.y, p.z, 1, 0, 1);
    const events = world.drainEvents();
    expect(events.some((e) => e.type === 'targetDestroyed' && e.kind === 'carrier')).toBe(true);
    for (const gun of guns) expect(gun.health).toBe(0);
    expect(ground.surfaceAt(p.x, p.z)).toBe('deck');

    // Part-way: settling, still afloat.
    for (let t = 0; t < CARRIER_DAMAGE_CONFIG.sinkSeconds * 0.3; t += STEP) world.step(STEP, []);
    const status = statuses.get(RED_CARRIER.id);
    expect(status?.sink).toBeGreaterThan(0);
    expect(ground.heightAt(p.x, p.z)).toBeLessThan(RED_CARRIER.center.y);
    // Gone under.
    for (let t = 0; t < CARRIER_DAMAGE_CONFIG.sinkSeconds; t += STEP) world.step(STEP, []);
    expect(ground.surfaceAt(p.x, p.z)).toBe('water');
    expect(ground.heightAt(p.x, p.z)).toBe(WORLD_CONFIG.seaLevel);
    // Back again, with its guns.
    for (let t = 0; t < CARRIER_DAMAGE_CONFIG.respawnSeconds; t += STEP) world.step(STEP, []);
    expect(carrier.health).toBe(carrier.maxHealth);
    expect(statuses.get(RED_CARRIER.id)?.sink).toBe(0);
    expect(ground.heightAt(p.x, p.z)).toBe(RED_CARRIER.center.y);
    for (const gun of guns) expect(gun.health).toBe(AA_GUN_CONFIG.maxHealth);
  });

  it('Red AA shells hitting its own carrier do no damage', () => {
    const targets = createTargets();
    const carrier = firstOf(targets, 'carrier', true);
    const world = new CombatWorld(createWorldGround(terrain), targets);
    const p = deckPoint(120);
    for (let i = 0; i < 50; i++) world.onGroundImpact(p.x, RED_CARRIER.center.y, p.z, 10_000, 1, 6);
    expect(carrier.health).toBe(carrier.maxHealth);
  });
});

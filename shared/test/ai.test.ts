import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AiPilot,
  CAPTURE_CONFIG,
  Status,
  action,
  baseById,
  basesHeld,
  condition,
  cooldown,
  createAirborneState,
  createBaseControls,
  createGunState,
  createMatch,
  createSquadron,
  fullAmmo,
  getAttitude,
  baseSpawnPoint,
  createParkedState,
  homeBase,
  remainingSeconds,
  selector,
  sequence,
  stepMatch,
  type BaseControl,
} from '../src/index';
import { holdHeight, simulate, type Scripted } from './aiHarness';

/*
 * The AI pilots (shared/src/ai), flown by the real flight model over the
 * real map, with the real guns, AA and capture rules.
 */

describe('behaviour tree', () => {
  it('a sequence resumes the child that was running, and fails as soon as one fails', () => {
    const log: string[] = [];
    let ticks = 0;
    const tree = sequence('s', [
      action('a', () => (log.push('a'), Status.Success)),
      action('b', () => (log.push('b'), ++ticks < 3 ? Status.Running : Status.Success)),
      action('c', () => (log.push('c'), Status.Success)),
    ]);
    expect(tree.tick({}, 0)).toBe(Status.Running);
    expect(tree.tick({}, 0)).toBe(Status.Running);
    expect(tree.tick({}, 0)).toBe(Status.Success);
    // "a" ran once: the sequence resumed at "b" instead of starting over.
    expect(log).toEqual(['a', 'b', 'b', 'b', 'c']);
    expect(sequence('f', [condition('no', () => false), action('never', () => Status.Success)]).tick({}, 0)).toBe(Status.Failure);
  });

  it('a selector tries its children in priority order; a higher one that becomes possible interrupts a lower one that was running', () => {
    let danger = false;
    const done: string[] = [];
    let patrolResets = 0;
    const patrol = { ...action('patrol', () => Status.Running), reset: () => void patrolResets++ };
    const tree = selector('root', [sequence('emergency', [condition('danger', () => danger), action('react', () => (done.push('react'), Status.Running))]), patrol]);
    expect(tree.tick({}, 0)).toBe(Status.Running);
    danger = true;
    expect(tree.tick({}, 0)).toBe(Status.Running);
    expect(done).toEqual(['react']);
    expect(patrolResets).toBe(1);
    expect(selector('none', [condition('no', () => false)]).tick({}, 0)).toBe(Status.Failure);
  });

  it('a cooldown lets its child run again only after its time is up', () => {
    let now = 0;
    let runs = 0;
    const node = cooldown(5, () => now, action('go', () => (runs++, Status.Success)));
    expect(node.tick({}, 0)).toBe(Status.Success);
    now = 3;
    expect(node.tick({}, 0)).toBe(Status.Failure);
    now = 6;
    expect(node.tick({}, 0)).toBe(Status.Success);
    expect(runs).toBe(2);
  });
});

/** A Blue target drone at a steady height: straight on, or circling (a 45-degree banked turn, about 1.2 km across, so it stays on the map). */
function drone(id: number, x: number, y: number, z: number, heading: number, circling = false): Scripted {
  const spec = AIRCRAFT_CLASSES.fighterBomber;
  const state = createAirborneState(spec, { x, y, z }, heading, 110, 0.75);
  const attitude = { headingDeg: 0, pitchDeg: 0, bankDeg: 0 };
  return {
    id,
    team: 'blue',
    state,
    spec,
    guns: createGunState(spec),
    control: () => {
      getAttitude(state.orientation, attitude);
      const roll = Math.max(-1, Math.min(1, ((circling ? 45 : 0) - attitude.bankDeg) / 20));
      return { pitch: holdHeight(state, y) + (circling ? 0.2 : 0), roll, throttle: 0.5 };
    },
  };
}

describe('the Red squadron on its own', { timeout: 120_000 }, () => {
  it('launches from its carrier, spreads out and takes all three island airfields within five minutes, without hitting the ground', () => {
    const pilots = createSquadron('red', 100, AIRCRAFT_CLASSES);
    const sim = simulate(pilots);
    sim.run(300);
    for (const id of ['south-airfield', 'central-airfield', 'north-airfield']) expect(sim.combat.ownerOf(baseById(id))).toBe('red');
    expect(pilots.map((p) => p.losses)).toEqual([0, 0, 0, 0]);
    const captures = sim.events.filter((e) => e.type === 'baseCaptured');
    // Different pilots took them: they spread out rather than all landing at one.
    expect(new Set(captures.map((e) => e.baseId)).size).toBe(captures.length);
  });

  it('is deterministic: the same start gives the same flights', () => {
    const a = createSquadron('red', 100, AIRCRAFT_CLASSES);
    const b = createSquadron('red', 100, AIRCRAFT_CLASSES);
    simulate(a).run(90);
    simulate(b).run(90);
    expect(a.map((p) => p.state.position)).toEqual(b.map((p) => p.state.position));
  });
});

describe('an AI hunter', { timeout: 120_000 }, () => {
  it('finds a Blue aircraft, closes on it and shoots it down', () => {
    const hunter = new AiPilot(100, 'red', AIRCRAFT_CLASSES.navalFighter, 'hunter', 0);
    const target = drone(1, 1_500, 450, 1_200, 270, true);
    const sim = simulate([hunter], [target]);
    let downAt = -1;
    sim.run(150, (t) => {
      if (target.state.shotDown && downAt < 0) downAt = t;
      return downAt > 0;
    });
    expect(downAt, `hunter was ${hunter.activity}`).toBeGreaterThan(0);
    expect(sim.events.some((e) => e.type === 'aircraftShotDown' && e.victim === 1 && e.owner === 100)).toBe(true);
    expect(hunter.state.crashed).toBe(false);
  });

  it('breaks hard when an enemy gets on its tail', () => {
    // Cruising at 500 m over the sea...
    const pilot = new AiPilot(100, 'red', AIRCRAFT_CLASSES.interceptor, 'hunter', 0);
    pilot.state = createAirborneState(pilot.spec, { x: 3_000, y: 500, z: -1_000 }, 0, 110, 0.8);
    pilot.spawned = true;
    // ...with a Blue fighter 300 m behind it, pointing at it.
    const attacker = drone(2, 3_000, 500, -1_300, 0);
    const sim2 = simulate([pilot], [attacker]);
    let broke = false;
    const seen = new Set<string>();
    sim2.run(2, () => {
      seen.add(pilot.activity);
      return (broke ||= pilot.activity === 'breaking');
    });
    expect(broke, [...seen].join(', ')).toBe(true);
  });
});

describe('an AI pilot out of ammunition', { timeout: 120_000 }, () => {
  it('lands at its carrier, is rearmed, and takes off again', () => {
    const pilot = new AiPilot(100, 'red', AIRCRAFT_CLASSES.navalFighter, 'hunter', 0);
    const sim = simulate([pilot]);
    sim.run(30, () => pilot.spawned && pilot.state.position.y > 150);
    pilot.guns.ammo = 0;
    let rearmed = false;
    let airborneAgain = false;
    sim.run(240, () => {
      rearmed ||= pilot.guns.ammo === fullAmmo(pilot.spec);
      airborneAgain = rearmed && !pilot.state.onGround && pilot.state.position.y > 60;
      return airborneAgain;
    });
    expect(rearmed, pilot.activity).toBe(true);
    expect(airborneAgain).toBe(true);
    expect(pilot.losses).toBe(0);
    expect(homeBase('red').id).toBe('red-carrier');
  });
});

describe('match rules', () => {
  const owned = (owners: Record<string, 'blue' | 'red' | null>): BaseControl[] => createBaseControls().map((c) => ({ ...c, owner: c.base.id in owners ? owners[c.base.id]! : c.owner }));

  it('when the time is up, the team holding more bases wins; equal is a draw', () => {
    const match = createMatch(5);
    expect(remainingSeconds(match)).toBe(300);
    expect(stepMatch(match, owned({}), 299)).toBeNull();
    expect(stepMatch(match, owned({ 'south-airfield': 'blue' }), 2)).toEqual({ winner: 'blue', reason: 'time', bases: { blue: 2, red: 1 } });
    // Over: no second result.
    expect(stepMatch(match, owned({}), 1)).toBeNull();
    const draw = createMatch(5);
    expect(stepMatch(draw, owned({ 'south-airfield': 'blue', 'north-airfield': 'red' }), 301)?.winner).toBeNull();
  });

  it('a team left with no base loses at once, before time', () => {
    const match = createMatch(10);
    const bases = owned({ 'red-carrier': 'blue', 'south-airfield': 'blue' });
    expect(basesHeld(bases, 'red')).toBe(0);
    expect(stepMatch(match, bases, 1)).toEqual({ winner: 'blue', reason: 'eliminated', bases: { blue: 3, red: 0 } });
    expect(match.elapsed).toBe(1);
  });

  it('capturing the last enemy base ends it: the full rules, through the combat world', { timeout: 60_000 }, () => {
    const match = createMatch(10);
    // Blue destroys Red's carrier gun and stops on its deck.
    const spec = AIRCRAFT_CLASSES.navalFighter;
    const deck = homeBase('red');
    const lander: Scripted = { id: 1, team: 'blue', spec, guns: createGunState(spec), state: createParkedState(spec, baseSpawnPoint(deck)), control: () => ({ throttle: 0, brake: 1 }) };
    const result = { value: null as ReturnType<typeof stepMatch> };
    const sim2 = simulate([], [lander]);
    for (const t of sim2.combat.targets) if (t.baseId === 'red-carrier') while (t.health > 0) sim2.combat.applyHit(t, 5, 1);
    sim2.run(CAPTURE_CONFIG.seconds + 2, () => {
      result.value ??= stepMatch(match, sim2.combat.bases, 1 / 60);
      return result.value !== null;
    });
    expect(sim2.combat.ownerOf(deck)).toBe('blue');
    expect(result.value?.reason).toBe('eliminated');
    expect(result.value?.winner).toBe('blue');
  });
});

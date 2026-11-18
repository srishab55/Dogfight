import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  GUN_SPECS,
  ProjectilePool,
  SERVICE_CONFIG,
  baseSpawnPoint,
  createAirborneState,
  createGunState,
  createParkedState,
  createServiceStatus,
  fullAmmo,
  gunMounts,
  stepGuns,
  stepService,
  baseById,
  serviceLaneAreas,
  homeBase,
  type BaseOwnerLookup,
  type AircraftState,
  type GunState,
  type ServiceEvent,
} from '../src/index';
import { STEP } from './testPilot';

const spec = AIRCRAFT_CLASSES.fighterBomber;
const gun = GUN_SPECS.fighterBomber;

/** Fires with the trigger held until the guns stop (empty), ignoring heat. */
function emptyTheGuns(guns: GunState, aircraft: AircraftState): number {
  const pool = new ProjectilePool(20_000);
  const coolGun = { ...gun, secondsToOverheat: Infinity };
  let fired = 0;
  for (let t = 0; t < 120; t += STEP) fired += stepGuns(guns, aircraft, spec, coolGun, true, pool, 1, STEP);
  return fired;
}

/** Runs the service for `seconds`, returning the events that happened. */
/** Mid-match: Blue has taken the south airfield and Red the north one; the central one is still nobody's. */
const owners: BaseOwnerLookup = (base) => (base.id === 'south-airfield' ? 'blue' : base.id === 'north-airfield' ? 'red' : base.team);
const AIRFIELDS = { blue: 'south-airfield', red: 'north-airfield' } as const;

function service(state: AircraftState, guns: GunState, seconds: number, status = createServiceStatus(), team: 'blue' | 'red' = 'blue'): ServiceEvent[] {
  const events: ServiceEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    const event = stepService(status, state, spec, guns, team, STEP, owners);
    if (event) events.push(event);
  }
  return events;
}

describe('limited ammunition', () => {
  it('every class carries rounds per gun x guns, and its gun count matches its airframe', () => {
    for (const id of AIRCRAFT_CLASS_IDS) {
      const s = AIRCRAFT_CLASSES[id];
      expect(gunMounts(s).length).toBe(s.combat.gunCount);
      expect(fullAmmo(s)).toBe(GUN_SPECS[id].roundsPerGun * s.combat.gunCount);
      // At least 15 s of fire, but not unlimited: rearming matters.
      const seconds = GUN_SPECS[id].roundsPerGun / GUN_SPECS[id].roundsPerSecondPerGun;
      expect(seconds).toBeGreaterThan(15);
      expect(seconds).toBeLessThan(60);
    }
  });

  it('the guns fire exactly their load, then fall silent', () => {
    const guns = createGunState(spec);
    const aircraft = createAirborneState(spec, { x: 0, y: 1000, z: 0 }, 0, 100);
    expect(emptyTheGuns(guns, aircraft)).toBe(fullAmmo(spec));
    expect(guns.ammo).toBe(0);
    expect(guns.firing).toBe(false);
  });
});

describe('rearming and repair at a base', () => {
  const parkedAt = (kind: 'airfield' | 'carrier', team: 'blue' | 'red' = 'blue') => createParkedState(spec, baseSpawnPoint(kind === 'carrier' ? homeBase(team) : baseById(AIRFIELDS[team])));

  it.each(['airfield', 'carrier'] as const)('stopped at idle at a friendly %s, the crew rearms and repairs in the service time', (kind) => {
    const state = parkedAt(kind);
    state.hullHealth = 40;
    const guns = createGunState(spec);
    guns.ammo = 10;
    guns.heat = 0.8;
    // Just short of the service time: not done yet.
    const status = createServiceStatus();
    const events = service(state, guns, SERVICE_CONFIG.durationSeconds - 0.5, status);
    expect(events).toEqual(['started']);
    expect(guns.ammo).toBe(10);
    expect(status.base?.kind).toBe(kind);
    // Then it completes.
    expect(service(state, guns, 1, status)).toEqual(['completed']);
    expect(guns.ammo).toBe(fullAmmo(spec));
    expect(guns.heat).toBe(0);
    expect(state.hullHealth).toBe(spec.combat.maxHullHealth);
  });

  it('nothing happens when nothing needs doing', () => {
    expect(service(parkedAt('airfield'), createGunState(spec), 10)).toEqual([]);
  });

  it('an enemy base gives no service', () => {
    const state = parkedAt('airfield', 'red');
    const guns = createGunState(spec);
    guns.ammo = 0;
    expect(service(state, guns, 10, createServiceStatus(), 'blue')).toEqual([]);
    expect(guns.ammo).toBe(0);
  });

  it('moving, opening the throttle or flying away interrupts the service', () => {
    const state = parkedAt('airfield');
    const guns = createGunState(spec);
    guns.ammo = 0;
    const status = createServiceStatus();
    service(state, guns, 2, status);
    expect(status.progress).toBeGreaterThan(0.2);
    state.throttle = 0.8;
    expect(service(state, guns, 0.1, status)).toEqual(['interrupted']);
    expect(status.progress).toBe(0);
    // Rolling: nothing starts until it stops again.
    state.throttle = 0;
    state.velocity.z = 5;
    expect(service(state, guns, 1, status)).toEqual([]);
    state.velocity.z = 0;
    expect(service(state, guns, 1, status)).toEqual(['started']);
    expect(guns.ammo).toBe(0);
  });

  it('no airfield service at a field nobody holds yet', () => {
    const state = createParkedState(spec, baseSpawnPoint(baseById('central-airfield')));
    const guns = createGunState(spec);
    guns.ammo = 0;
    expect(service(state, guns, 10)).toEqual([]);
  });

  it('pulled off the runway onto the service lane, it is serviced there', () => {
    const base = baseById(AIRFIELDS.blue);
    const lane = serviceLaneAreas(base.runway)[0]!;
    const state = createParkedState(spec, { position: lane.center, headingDegrees: lane.headingDegrees });
    const guns = createGunState(spec);
    guns.ammo = 0;
    expect(service(state, guns, SERVICE_CONFIG.durationSeconds + 1)).toEqual(['started', 'completed']);
  });

  it('no service in the air, even over a base', () => {
    const base = baseById(AIRFIELDS.blue);
    const state = createAirborneState(spec, { ...base.runway.center, y: 100 }, 0, 60);
    const guns = createGunState(spec);
    guns.ammo = 0;
    expect(service(state, guns, 10)).toEqual([]);
  });
});

import {
  AIRCRAFT_CLASSES,
  AiForce,
  CombatWorld,
  createCarrierStatuses,
  createTargets,
  createTerrain,
  createWorldGround,
  sanitizeControls,
  stepAircraft,
  type AiContact,
  type AiPilot,
  type AircraftState,
  type CombatEvent,
  type FlightControls,
  type GunState,
  type Shooter,
  type Team,
} from '../src/index';
import { STEP } from './testPilot';

export const terrain = createTerrain();

/** Something else in the fight: a scripted aircraft (a target drone, an attacker). */
export interface Scripted {
  readonly id: number;
  readonly team: Team;
  readonly state: AircraftState;
  readonly guns: GunState;
  readonly spec: (typeof AIRCRAFT_CLASSES)[keyof typeof AIRCRAFT_CLASSES];
  /** Its controls each step (null: neutral, holding height). */
  control(time: number): Partial<FlightControls>;
}

export interface Sim {
  readonly combat: CombatWorld;
  readonly force: AiForce;
  readonly events: CombatEvent[];
  time: number;
  run(seconds: number, each?: (time: number) => boolean | void): void;
}

/** The real world (islands, carriers, every base) with these AI pilots and scripted aircraft in it. */
export function simulate(pilots: AiPilot[], scripted: Scripted[] = []): Sim {
  const statuses = createCarrierStatuses();
  const ground = createWorldGround(terrain, undefined, undefined, statuses);
  const combat = new CombatWorld(ground, createTargets(), statuses);
  const force = new AiForce(pilots);
  const events: CombatEvent[] = [];
  const contacts: AiContact[] = [];
  const sim: Sim = {
    combat,
    force,
    events,
    time: 0,
    run(seconds, each) {
      const end = sim.time + seconds;
      while (sim.time < end) {
        contacts.length = 0;
        force.contacts(contacts);
        for (const s of scripted) if (!s.state.crashed) contacts.push({ id: s.id, team: s.team, state: s.state });
        force.fly({ time: sim.time, ground, aircraft: contacts, targets: combat.targets, bases: combat.bases, ownerOf: combat.ownerOf, carrierStatuses: statuses, pilots }, STEP);
        const shooters: Shooter[] = [...force.shooters()];
        for (const s of scripted) {
          if (s.state.crashed) continue;
          const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, brake: 0, flaps: 0, airbrake: 0, fire: false, ...s.control(sim.time) };
          stepAircraft(s.state, sanitizeControls(controls), s.spec, ground, STEP);
          shooters.push({ id: s.id, team: s.team, state: s.state, spec: s.spec, guns: s.guns, trigger: controls.fire });
        }
        combat.step(STEP, shooters);
        events.push(...combat.drainEvents());
        force.service(combat.ownerOf, STEP);
        sim.time += STEP;
        if (each?.(sim.time)) break;
      }
    },
  };
  return sim;
}

/** Holds height (crudely) on the stick: for scripted aircraft. */
export function holdHeight(state: AircraftState, height: number): number {
  return Math.max(-1, Math.min(1, (height - state.position.y) / 40 - state.velocity.y / 8));
}

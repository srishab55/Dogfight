import type { Shooter } from '../combat/CombatWorld';
import { stepService } from '../combat/service';
import { sanitizeControls } from '../flight/FlightControls';
import { stepAircraft } from '../flight/FlightModel';
import type { BaseOwnerLookup } from '../config/world';
import type { AiContact, AiPilot, AiWorld } from './AiPilot';

/**
 * A team's AI pilots, stepped the way the player's aircraft is: each
 * physics step they choose controls (think), fly (the shared flight model),
 * fight (as shooters in the combat world) and get serviced at their bases.
 */
export class AiForce {
  private readonly shooterList: Shooter[] = [];

  constructor(readonly pilots: readonly AiPilot[]) {}

  /** Before the combat step: every pilot decides, then flies. */
  fly(world: AiWorld, dt: number): void {
    for (const pilot of this.pilots) pilot.think(world, dt);
    for (const pilot of this.pilots) {
      if (pilot.spawned && !pilot.state.crashed) stepAircraft(pilot.state, sanitizeControls(pilot.controls), pilot.spec, world.ground, dt);
    }
  }

  /** The launched aircraft, as shooters for the combat world (fresh objects each step; the list is reused). */
  shooters(): readonly Shooter[] {
    this.shooterList.length = 0;
    for (const pilot of this.pilots) {
      if (pilot.spawned) this.shooterList.push({ id: pilot.id, team: pilot.team, state: pilot.state, spec: pilot.spec, guns: pilot.guns, trigger: pilot.controls.fire });
    }
    return this.shooterList;
  }

  /** After the combat step: rearm and repair any stopped at idle on their own base. */
  service(ownerOf: BaseOwnerLookup, dt: number): void {
    for (const pilot of this.pilots) {
      if (pilot.spawned) stepService(pilot.service, pilot.state, pilot.spec, pilot.guns, pilot.team, dt, ownerOf);
    }
  }

  /** The launched aircraft, as others see them. */
  contacts(out: AiContact[]): void {
    for (const pilot of this.pilots) if (pilot.spawned) out.push({ id: pilot.id, team: pilot.team, state: pilot.state });
  }
}

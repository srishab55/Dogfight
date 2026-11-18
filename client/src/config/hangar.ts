import type { AircraftClassId } from '@dogfight/shared';

/** The hangar (Esc): what each aircraft type is for, in one line. */
export const AIRCRAFT_ROLES: Readonly<Record<AircraftClassId, string>> = {
  interceptor: 'Fast and light: the best climb and top speed, four guns, thin armour. Catch them and run.',
  fighterBomber: 'The all-rounder: tough, four guns, carries bombs (coming soon).',
  heavyBomber: 'Four engines, heavy armour, a twin-gun turret. Slow and steady; airfields only.',
  navalFighter: 'Carrier fighter: a big wing for slow approaches; starts on the catapult.',
  diveBomber: 'Carrier dive bomber: dive brakes (X) hold a steep, steady dive.',
  triplane: 'Old-school triplane: slow and fragile, but it turns inside anything.',
  biplane: '1930s biplane: nimble and gentle, four guns, fixed gear.',
};

export const HANGAR_STORAGE_KEY = 'dogfight.hangar';

import { CARRIERS, WORLD_CONFIG, carrierPartAt, isOnRunway, RUNWAYS, type CarrierDefinition, type RunwayDefinition, type SurfaceType } from '../config/world';
import type { GroundQuery } from '../flight/ground';
import type { CarrierStatusMap } from './carrierStatus';

/**
 * Everything an aircraft can touch, as one ground surface:
 *  - the terrain where it stands above the sea;
 *  - the sea surface everywhere else (touching it is ditching);
 *  - the carriers: each is a solid block from the sea up to its flight deck,
 *    with its island standing higher still. Flying into the hull or the
 *    island is a crash; landing on the deck is a landing.
 *
 * Carriers are anchored, so their decks are static ground, except that a
 * sinking carrier (`statuses`) goes down with its deck: once a part of it
 * is under the sea, that part is sea again.
 */
export function createWorldGround(
  terrain: GroundQuery,
  carriers: readonly CarrierDefinition[] = CARRIERS,
  runways: readonly RunwayDefinition[] = RUNWAYS,
  statuses: CarrierStatusMap | null = null,
): GroundQuery {
  const sea = WORLD_CONFIG.seaLevel;
  // Scratch result: heightAt runs for every wheel, crash point and round each step, so it allocates nothing.
  const found = { height: 0, part: 'deck' as 'deck' | 'wires' | 'barrier' | 'island' };
  /** Is there a carrier part at (x, z) still above the sea? Its height and kind go into `found`. */
  const carrierAt = (x: number, z: number): boolean => {
    for (const carrier of carriers) {
      const part = carrierPartAt(carrier, x, z);
      if (!part) continue;
      const sink = statuses?.get(carrier.id)?.sink ?? 0;
      const height = carrier.center.y - sink + (part === 'island' ? carrier.island.height : 0);
      if (height <= sea) continue;
      found.height = height;
      found.part = part;
      return true;
    }
    return false;
  };
  return {
    heightAt(x, z) {
      return carrierAt(x, z) ? found.height : Math.max(terrain.heightAt(x, z), sea);
    },
    // Ground effect comes from the terrain and the sea only, not from carrier
    // decks: carrier approaches are flown onto the deck without a flare, and
    // a cushion over the deck would float aircraft past the wires.
    groundEffectHeightAt(x, z) {
      return Math.max(terrain.heightAt(x, z), sea);
    },
    surfaceAt(x, z): SurfaceType {
      if (carrierAt(x, z)) return found.part === 'island' ? 'deck' : found.part;
      if (runways.some((runway) => isOnRunway(runway, x, z))) return 'runway';
      return terrain.heightAt(x, z) < sea ? 'water' : 'grass';
    },
  };
}

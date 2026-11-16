import { CARRIERS, WORLD_CONFIG, carrierPartAt, isOnRunway, RUNWAYS, type CarrierDefinition, type RunwayDefinition, type SurfaceType } from '../config/world';
import type { GroundQuery } from '../flight/ground';

/**
 * Everything an aircraft can touch, as one ground surface:
 *  - the terrain where it stands above the sea;
 *  - the sea surface everywhere else (touching it is ditching);
 *  - the carriers: each is a solid block from the sea up to its flight deck,
 *    with its island standing higher still. Flying into the hull or the
 *    island is a crash; landing on the deck is a landing.
 *
 * Carriers are anchored, so their decks are static ground.
 */
export function createWorldGround(
  terrain: GroundQuery,
  carriers: readonly CarrierDefinition[] = CARRIERS,
  runways: readonly RunwayDefinition[] = RUNWAYS,
): GroundQuery {
  const sea = WORLD_CONFIG.seaLevel;
  return {
    heightAt(x, z) {
      for (const carrier of carriers) {
        const part = carrierPartAt(carrier, x, z);
        if (part === 'island') return carrier.center.y + carrier.island.height;
        if (part) return carrier.center.y;
      }
      return Math.max(terrain.heightAt(x, z), sea);
    },
    surfaceAt(x, z): SurfaceType {
      for (const carrier of carriers) {
        const part = carrierPartAt(carrier, x, z);
        if (part === 'wires') return 'wires';
        if (part) return 'deck';
      }
      if (runways.some((runway) => isOnRunway(runway, x, z))) return 'runway';
      return terrain.heightAt(x, z) < sea ? 'water' : 'grass';
    },
  };
}

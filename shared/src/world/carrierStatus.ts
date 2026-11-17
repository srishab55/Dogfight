import { CARRIERS, type CarrierDefinition } from '../config/world';

/**
 * A carrier's condition that the world can see: how far it has sunk, and
 * (visual only) how far its stern has gone down and how much it lists.
 * Updated by the combat world while a destroyed carrier sinks; read by the
 * world ground (a sunken deck is no longer ground) and by the client's model.
 */
export interface CarrierStatus {
  /** Metres below its normal deck height. 0 afloat. */
  sink: number;
  /** Stern-down pitch (deg). */
  sternDownDeg: number;
  /** List to port (deg). */
  listDeg: number;
}

export type CarrierStatusMap = Map<string, CarrierStatus>;

export function createCarrierStatuses(carriers: readonly CarrierDefinition[] = CARRIERS): CarrierStatusMap {
  return new Map(carriers.map((carrier) => [carrier.id, { sink: 0, sternDownDeg: 0, listDeg: 0 }]));
}

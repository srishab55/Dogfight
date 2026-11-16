/**
 * Simulation timing. The flight model always advances in fixed steps of
 * `1 / physicsHz`, on the client (prediction) and on the server alike, so
 * both compute identical results from identical inputs.
 */
export const SIMULATION_CONFIG = {
  /** Physics steps per second. */
  physicsHz: 60,
  /** Server simulation ticks per second (Phase 5). Each tick runs physicsHz / serverTickHz physics steps. */
  serverTickHz: 30,
  /** State snapshots sent to clients per second (Phase 5). */
  stateSyncHz: 20,
  /**
   * Most physics steps a client runs in one rendered frame. If the browser
   * stalls, the simulation drops time instead of trying to catch up and
   * stalling further (the "spiral of death").
   */
  maxStepsPerFrame: 8,
} as const;

/** Physical constants, SI units. */
export const PHYSICS_CONSTANTS = {
  /** Gravitational acceleration (m/s^2). */
  gravity: 9.81,
  /** Air density at sea level, standard atmosphere (kg/m^3). */
  seaLevelAirDensity: 1.225,
  /** Altitude over which air density falls by a factor of e (m). Exponential-atmosphere approximation. */
  atmosphereScaleHeight: 8_500,
} as const;

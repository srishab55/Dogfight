/**
 * Plain 3D vector used in configuration and, later, in simulation state and
 * network messages.
 *
 * It is deliberately a plain object rather than a class: it serialises cleanly
 * and carries no dependency on a rendering engine, so the Node.js server can
 * use exactly the same data.
 *
 * World coordinate convention (identical to Babylon.js's default left-handed
 * system, so no conversion is needed when rendering):
 *   +X = east,  aircraft right wing
 *   +Y = up,    aircraft canopy
 *   +Z = north, aircraft nose
 * Units are SI throughout the project: metres, seconds, kilograms, newtons.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

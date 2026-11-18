import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PHYSICS_CONSTANTS } from '../config/simulation';
import { GUN_SPECS } from '../config/weapons';
import type { AircraftState } from '../flight/AircraftState';
import { rotateVec3 } from '../math/quat';
import { vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';
import { airframeHitSpheres, placeHitSpheres, placedSphere, type PlacedSphere } from './hitShapes';
import { shownScale } from './visibility';

/*
 * Gunnery aids for a human pilot (the HUD's lead marker and on-target cue),
 * using the same rounds and hit shapes as the combat world.
 */

const FORWARD: Vec3 = { x: 0, y: 0, z: 1 };
const nose = vec3();
const MAX_SPHERES = 16;
const spheres: PlacedSphere[] = Array.from({ length: MAX_SPHERES }, placedSphere);

/**
 * The gun solution: the direction to point the nose so rounds fired now
 * meet the target (its motion relative to ours, and the rounds' drop,
 * allowed for), written into `out` (not normalised). Returns the rounds'
 * time of flight (s).
 */
export function leadDirection(shooter: Readonly<AircraftState>, spec: AircraftClassSpec, target: Readonly<AircraftState>, out: Vec3): number {
  const dx = target.position.x - shooter.position.x;
  const dy = target.position.y - shooter.position.y;
  const dz = target.position.z - shooter.position.z;
  const time = Math.hypot(dx, dy, dz) / GUN_SPECS[spec.id].muzzleVelocity;
  out.x = dx + (target.velocity.x - shooter.velocity.x) * time;
  out.y = dy + (target.velocity.y - shooter.velocity.y) * time + 0.5 * PHYSICS_CONSTANTS.gravity * time * time;
  out.z = dz + (target.velocity.z - shooter.velocity.z) * time;
  return time;
}

/**
 * Would rounds fired now hit `target`? Follows a round out of the nose
 * (our velocity plus the muzzle velocity, falling under gravity) over its
 * lifetime, against each of the target's hit spheres moving at its present
 * velocity, and asks whether any comes within its radius plus `nearMiss`.
 * Turning targets are taken as flying straight: over a second of flight
 * that's close enough for a cue. `enlarge`: target visibility for the
 * target (see enlargeBlend), so the cue agrees with the shape the rounds hit.
 */
export function roundsWouldHit(shooter: Readonly<AircraftState>, spec: AircraftClassSpec, target: Readonly<AircraftState>, targetSpec: AircraftClassSpec, nearMiss: number, enlarge = 0): boolean {
  const gun = GUN_SPECS[spec.id];
  rotateVec3(nose, shooter.orientation, FORWARD);
  const count = Math.min(MAX_SPHERES, airframeHitSpheres(targetSpec.airframe).length);
  placeHitSpheres(target, targetSpec, -1, spheres, 0);
  if (enlarge > 0) {
    // As the combat world does for these rounds: the shape scaled about its centre, by its range.
    const range = Math.hypot(target.position.x - shooter.position.x, target.position.y - shooter.position.y, target.position.z - shooter.position.z);
    const s = shownScale(spheres[0]?.span ?? 0, range, enlarge);
    for (let i = 0; i < count; i++) {
      const sphere = spheres[i]!;
      const c = sphere.centre;
      sphere.position.x = c.x + (sphere.position.x - c.x) * s;
      sphere.position.y = c.y + (sphere.position.y - c.y) * s;
      sphere.position.z = c.z + (sphere.position.z - c.z) * s;
      sphere.radius *= s;
    }
  }
  const g = PHYSICS_CONSTANTS.gravity;
  const vx = shooter.velocity.x + nose.x * gun.muzzleVelocity;
  const vy = shooter.velocity.y + nose.y * gun.muzzleVelocity;
  const vz = shooter.velocity.z + nose.z * gun.muzzleVelocity;
  const step = 1 / 120;
  for (let t = 0; t <= gun.projectileLifetime; t += step) {
    const rx = shooter.position.x + vx * t;
    const ry = shooter.position.y + vy * t - 0.5 * g * t * t;
    const rz = shooter.position.z + vz * t;
    for (let i = 0; i < count; i++) {
      const s = spheres[i]!;
      const ex = rx - (s.position.x + target.velocity.x * t);
      const ey = ry - (s.position.y + target.velocity.y * t);
      const ez = rz - (s.position.z + target.velocity.z * t);
      const reach = s.radius + nearMiss;
      if (ex * ex + ey * ey + ez * ez < reach * reach) return true;
    }
  }
  return false;
}

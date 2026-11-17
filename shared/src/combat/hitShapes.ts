import type { AircraftClassSpec } from '../config/aircraftClasses';
import type { Airframe } from '../config/airframe';
import { AIRCRAFT_HIT_SHAPE_CONFIG } from '../config/targets';
import type { AircraftState } from '../flight/AircraftState';
import { rotateVec3 } from '../math/quat';
import { vec3 } from '../math/vec3';
import type { Vec3 } from '../types/vector';

/** One sphere of an aircraft's hit shape, in its body frame at scale 1. */
export interface HitSphere {
  readonly offset: Readonly<Vec3>;
  readonly radius: number;
}

const cache = new WeakMap<Airframe, readonly HitSphere[]>();

/**
 * An airframe's hit shape: spheres along the fuselage and both wings, sized
 * from the airframe's own dimensions (see AIRCRAFT_HIT_SHAPE_CONFIG).
 * Computed once per airframe.
 */
export function airframeHitSpheres(airframe: Airframe): readonly HitSphere[] {
  const cached = cache.get(airframe);
  if (cached) return cached;
  const config = AIRCRAFT_HIT_SHAPE_CONFIG;
  const profile = airframe.fuselage;
  const tail = profile[0]?.[1] ?? 0;
  const nose = profile[profile.length - 1]?.[1] ?? 0;
  const widest = Math.max(...profile.map(([radius]) => radius));
  const spheres: HitSphere[] = config.fuselageStations.map((f) => ({ offset: { x: 0, y: 0, z: nose + (tail - nose) * f }, radius: widest * config.fuselageRadiusScale }));
  const w = airframe.wing;
  for (const f of config.wingStations) {
    const x = w.halfSpan * f;
    const leading = w.rootLeadingZ + (w.tipLeadingZ - w.rootLeadingZ) * f;
    const trailing = w.rootTrailingZ + (w.tipTrailingZ - w.rootTrailingZ) * f;
    const y = w.y + x * Math.tan((w.dihedralDeg * Math.PI) / 180);
    const radius = (leading - trailing) * config.wingRadiusScale;
    for (const side of [1, -1]) spheres.push({ offset: { x: side * x, y, z: (leading + trailing) / 2 }, radius });
  }
  cache.set(airframe, spheres);
  return spheres;
}

/** A hit sphere placed in the world for this step. */
export interface PlacedSphere {
  readonly position: Vec3;
  radius: number;
  team: number;
}

const scaled = vec3();

/** Writes an aircraft's hit spheres in world space into `out` (which must have room for them). */
export function placeHitSpheres(state: Readonly<AircraftState>, spec: AircraftClassSpec, team: number, out: PlacedSphere[], start: number): number {
  const spheres = airframeHitSpheres(spec.airframe);
  const scale = spec.airframeScale;
  for (let i = 0; i < spheres.length; i++) {
    const sphere = spheres[i];
    const placed = out[start + i];
    if (!sphere || !placed) continue;
    scaled.x = sphere.offset.x * scale;
    scaled.y = sphere.offset.y * scale;
    scaled.z = sphere.offset.z * scale;
    rotateVec3(placed.position, state.orientation, scaled);
    placed.position.x += state.position.x;
    placed.position.y += state.position.y;
    placed.position.z += state.position.z;
    placed.radius = sphere.radius * scale;
    placed.team = team;
  }
  return spheres.length;
}

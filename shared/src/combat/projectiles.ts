import { PHYSICS_CONSTANTS } from '../config/simulation';
import { shownScale } from './visibility';
import type { GroundQuery } from '../flight/ground';
import type { Vec3 } from '../types/vector';

/** Anything a round can hit, approximated as a sphere (aircraft are a few of them). */
export interface SphereTarget {
  readonly position: Readonly<Vec3>;
  readonly radius: number;
  /** Team code (see `teamCode`); rounds pass through their own team. Omitted or -1: anyone can hit it. */
  readonly team?: number;
  /** Part of an aircraft: rounds fired with a near-miss allowance hit it from that much further out. */
  readonly aircraft?: boolean;
  /** An aircraft's: its centre, wingspan and how far target visibility applies (see combat/visibility.ts). */
  readonly centre?: Readonly<Vec3>;
  readonly span?: number;
  readonly enlarge?: number;
}

/** The enlarged sphere an assisted round is tested against (reused: no allocation per test). */
const enlarged = { position: { x: 0, y: 0, z: 0 }, radius: 0 };

/** Team as a small integer for the typed arrays: 0 Blue, 1 Red, -1 nobody's (practice targets). */
export function teamCode(team: 'blue' | 'red' | null): number {
  return team === 'blue' ? 0 : team === 'red' ? 1 : -1;
}

/** Receives what rounds hit during a step. Plain arguments (no event objects) so the hot loop allocates nothing. */
export interface ImpactListener {
  onGroundImpact(x: number, y: number, z: number, owner: number, team: number, damage: number): void;
  onTargetHit(targetIndex: number, x: number, y: number, z: number, damage: number, owner: number): void;
}

/**
 * Fixed-capacity pool of gun rounds, stored as flat typed arrays (one slot per
 * round) so firing hundreds of rounds creates no garbage. That matters: GC
 * pauses show up as stutter.
 *
 * Each step, every round falls under gravity and moves along a straight
 * segment. The *whole segment* is tested against targets and the ground. At
 * 900 m/s a round moves 15 m per step, so testing only its end point would let
 * it skip straight through a 4 m balloon ("tunnelling").
 */
export class ProjectilePool {
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly vz: Float64Array;
  readonly age: Float64Array;
  readonly lifetime: Float64Array;
  readonly damage: Float64Array;
  readonly owner: Int32Array;
  /** Team code of whoever fired it: rounds don't hit their own side. */
  readonly team: Int8Array;
  /** Near-miss allowance (m): passing this close to an aircraft counts as a hit (an aim assist; 0 for most rounds). */
  readonly nearMiss: Float32Array;
  /**
   * Target visibility for this round (m/s): its speed away from the gun, so
   * speed x age is its range, which sets how much larger aircraft look to
   * whoever fired it. 0: real sizes (the AI's rounds, AA shells).
   */
  readonly assistSpeed: Float32Array;
  readonly active: Uint8Array;
  private readonly freeSlots: number[];
  activeCount = 0;

  constructor(readonly capacity: number) {
    this.px = new Float64Array(capacity);
    this.py = new Float64Array(capacity);
    this.pz = new Float64Array(capacity);
    this.vx = new Float64Array(capacity);
    this.vy = new Float64Array(capacity);
    this.vz = new Float64Array(capacity);
    this.age = new Float64Array(capacity);
    this.lifetime = new Float64Array(capacity);
    this.damage = new Float64Array(capacity);
    this.owner = new Int32Array(capacity);
    this.team = new Int8Array(capacity);
    this.nearMiss = new Float32Array(capacity);
    this.assistSpeed = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    // Free slots as a stack, highest index at the bottom.
    this.freeSlots = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
  }

  /** Adds a round. Returns false if the pool is full (the round is dropped). */
  spawn(position: Readonly<Vec3>, velocity: Readonly<Vec3>, lifetime: number, damage: number, owner: number, team = -1, nearMiss = 0, assistSpeed = 0): boolean {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return false;
    this.px[slot] = position.x;
    this.py[slot] = position.y;
    this.pz[slot] = position.z;
    this.vx[slot] = velocity.x;
    this.vy[slot] = velocity.y;
    this.vz[slot] = velocity.z;
    this.age[slot] = 0;
    this.lifetime[slot] = lifetime;
    this.damage[slot] = damage;
    this.owner[slot] = owner;
    this.team[slot] = team;
    this.nearMiss[slot] = nearMiss;
    this.assistSpeed[slot] = assistSpeed;
    this.active[slot] = 1;
    this.activeCount++;
    return true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) if (this.active[i]) this.release(i);
  }

  /**
   * Advances every round by dt. `targets` may contain nulls for targets that
   * can't currently be hit (e.g. destroyed); their indices are preserved.
   */
  step(dt: number, ground: GroundQuery, targets: readonly (SphereTarget | null)[], listener: ImpactListener): void {
    const gravity = PHYSICS_CONSTANTS.gravity;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const age = (this.age[i] ?? 0) + dt;
      this.age[i] = age;
      if (age > (this.lifetime[i] ?? 0)) {
        this.release(i);
        continue;
      }

      // Semi-implicit Euler: gravity first, then move along the new velocity.
      // No air drag on rounds: a fair simplification over this range.
      const x0 = this.px[i] ?? 0;
      const y0 = this.py[i] ?? 0;
      const z0 = this.pz[i] ?? 0;
      const vy = (this.vy[i] ?? 0) - gravity * dt;
      this.vy[i] = vy;
      const dx = (this.vx[i] ?? 0) * dt;
      const dy = vy * dt;
      const dz = (this.vz[i] ?? 0) * dt;

      // Earliest thing this step's segment touches: a target or the ground.
      let hitT = Infinity;
      let hitTarget = -1;
      const team = this.team[i] ?? -1;
      const nearMiss = this.nearMiss[i] ?? 0;
      const range = (this.assistSpeed[i] ?? 0) * age;
      for (let t = 0; t < targets.length; t++) {
        const target = targets[t];
        if (!target) continue;
        if (team >= 0 && target.team === team) continue; // no friendly fire
        const along = segmentSphereIntersection(x0, y0, z0, dx, dy, dz, range > 0 ? enlargedFor(target, range) : target, target.aircraft ? nearMiss : 0);
        if (along < hitT) {
          hitT = along;
          hitTarget = t;
        }
      }
      const groundY = ground.heightAt(x0 + dx, z0 + dz);
      if (y0 + dy < groundY) {
        // Fraction of the step at which the round crosses the ground (flat-ground interpolation).
        const groundT = dy !== 0 ? Math.max(0, Math.min(1, (y0 - groundY) / -dy)) : 0;
        if (groundT < hitT) {
          hitT = groundT;
          hitTarget = -1;
          listener.onGroundImpact(x0 + dx * groundT, groundY, z0 + dz * groundT, this.owner[i] ?? -1, team, this.damage[i] ?? 0);
          this.release(i);
          continue;
        }
      }
      if (hitTarget >= 0) {
        listener.onTargetHit(hitTarget, x0 + dx * hitT, y0 + dy * hitT, z0 + dz * hitT, this.damage[i] ?? 0, this.owner[i] ?? -1);
        this.release(i);
        continue;
      }

      this.px[i] = x0 + dx;
      this.py[i] = y0 + dy;
      this.pz[i] = z0 + dz;
    }
  }

  private release(slot: number): void {
    this.active[slot] = 0;
    this.activeCount--;
    this.freeSlots.push(slot);
  }
}

/**
 * Where along the segment p0 + t*d (t from 0 to 1) it first touches the
 * sphere, or Infinity if it doesn't. Solves |p0 + t*d - c|^2 = r^2 for the
 * smaller root.
 */
/** An aircraft's sphere as it looks from `range` metres (target visibility), or the sphere itself. */
function enlargedFor(target: SphereTarget, range: number): SphereTarget {
  const blend = target.enlarge ?? 0;
  const centre = target.centre;
  if (!target.aircraft || blend <= 0 || !centre || !target.span) return target;
  const s = shownScale(target.span, range, blend);
  if (s <= 1.0001) return target;
  enlarged.position.x = centre.x + (target.position.x - centre.x) * s;
  enlarged.position.y = centre.y + (target.position.y - centre.y) * s;
  enlarged.position.z = centre.z + (target.position.z - centre.z) * s;
  enlarged.radius = target.radius * s;
  return enlarged;
}

export function segmentSphereIntersection(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number, sphere: SphereTarget, extraRadius = 0): number {
  const mx = x0 - sphere.position.x;
  const my = y0 - sphere.position.y;
  const mz = z0 - sphere.position.z;
  const b = mx * dx + my * dy + mz * dz;
  const r = sphere.radius + extraRadius;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return Infinity; // outside and moving away
  const a = dx * dx + dy * dy + dz * dz;
  if (a === 0) return c <= 0 ? 0 : Infinity;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity; // the line misses the sphere
  const t = (-b - Math.sqrt(discriminant)) / a;
  if (t > 1) return Infinity; // reaches the sphere only after this step
  return Math.max(0, t); // starting inside counts as an immediate hit
}

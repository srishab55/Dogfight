import { PHYSICS_CONSTANTS } from '../config/simulation';
import { AA_GUN_CONFIG } from '../config/targets';
import type { AircraftState } from '../flight/AircraftState';
import { hashToUnit } from './guns';
import { teamCode, type ProjectilePool } from './projectiles';
import { isTargetAlive, type CombatTarget } from './targets';

/** An anti-aircraft gun's mount: where it points and where it is in its firing cycle. */
export interface AaGunState {
  /** The target that is this gun (its position, team and health). */
  readonly target: CombatTarget;
  /** Owner id stamped on its shells. */
  readonly owner: number;
  /** Barrel direction: yaw clockwise from north, pitch above the horizon (rad). For the visual too. */
  yaw: number;
  pitch: number;
  /** Seconds left in the current burst, or of the pause before the next. */
  burstTimer: number;
  pausing: boolean;
  /** Time banked towards the next shot (s). */
  fireTimer: number;
  shotsFired: number;
  /** True if the gun fired this step. */
  fired: boolean;
}

export function createAaGun(target: CombatTarget, owner: number): AaGunState {
  return { target, owner, yaw: (target.headingDegrees * Math.PI) / 180, pitch: 0.3, burstTimer: 0, pausing: true, fireTimer: 0, shotsFired: 0, fired: false };
}

/** An aircraft the guns may engage. */
export interface AaTarget {
  readonly team: number;
  readonly state: Readonly<AircraftState>;
}

const DEG = Math.PI / 180;

/**
 * One step of a gun: pick the nearest enemy aircraft in range, work out
 * where to aim to meet it (lead plus shell drop), slew towards that at the
 * mount's limited rates, and fire bursts when on target.
 *
 * Lead: the shell (speed s) and the aircraft (relative position r, velocity
 * v) meet after time t where |r + v t| = s t, i.e.
 *   (v.v - s^2) t^2 + 2 (r.v) t + r.r = 0.
 * The gun aims at r + v t, raised by the shell's drop, g t^2 / 2.
 */
export function stepAaGun(gun: AaGunState, aircraft: readonly AaTarget[], pool: ProjectilePool, dt: number): void {
  const config = AA_GUN_CONFIG;
  gun.fired = false;
  if (!isTargetAlive(gun.target)) return;
  const team = teamCode(gun.target.team);
  const g = gun.target.position;

  // Nearest enemy aircraft in range that's still flying.
  let best: Readonly<AircraftState> | null = null;
  let bestDistance: number = config.range;
  for (const candidate of aircraft) {
    const s = candidate.state;
    if (candidate.team === team || s.crashed || s.shotDown) continue;
    const distance = Math.hypot(s.position.x - g.x, s.position.y - g.y, s.position.z - g.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = s;
    }
  }
  if (!best) {
    gun.burstTimer = 0;
    gun.pausing = true;
    return;
  }

  const rx = best.position.x - g.x;
  const ry = best.position.y - g.y;
  const rz = best.position.z - g.z;
  const v = best.velocity;
  const s = config.muzzleVelocity;
  const a = v.x * v.x + v.y * v.y + v.z * v.z - s * s;
  const b = 2 * (rx * v.x + ry * v.y + rz * v.z);
  const c = rx * rx + ry * ry + rz * rz;
  const discriminant = b * b - 4 * a * c;
  // a < 0 (the shell is faster than the aircraft), so the positive root is the larger one.
  const t = discriminant >= 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Math.sqrt(c) / s;
  const ax = rx + v.x * t;
  const ay = ry + v.y * t + 0.5 * PHYSICS_CONSTANTS.gravity * t * t;
  const az = rz + v.z * t;
  const wantYaw = Math.atan2(ax, az);
  const wantPitch = Math.atan2(ay, Math.hypot(ax, az));

  // Slew at the mount's limited rates.
  const yawError = wrapAngle(wantYaw - gun.yaw);
  gun.yaw = wrapAngle(gun.yaw + clamp(yawError, config.traverseRateDeg * DEG * dt));
  gun.pitch += clamp(wantPitch - gun.pitch, config.elevationRateDeg * DEG * dt);
  const onTarget = Math.abs(wrapAngle(wantYaw - gun.yaw)) < config.fireWithinDeg * DEG && Math.abs(wantPitch - gun.pitch) < config.fireWithinDeg * DEG;

  // Burst cycle.
  gun.burstTimer -= dt;
  if (gun.burstTimer <= 0) {
    gun.pausing = !gun.pausing;
    gun.burstTimer = gun.pausing ? config.pauseSeconds : config.burstSeconds;
  }
  if (gun.pausing || !onTarget || gun.pitch < config.minElevationDeg * DEG) {
    gun.fireTimer = 0;
    return;
  }

  const interval = 1 / config.roundsPerSecond;
  gun.fireTimer += dt;
  while (gun.fireTimer >= interval) {
    gun.fireTimer -= interval;
    fireShell(gun, pool, team);
  }
}

function fireShell(gun: AaGunState, pool: ProjectilePool, team: number): void {
  const config = AA_GUN_CONFIG;
  // Deterministic scatter in a cone around the barrel, as for the aircraft guns.
  const spread = config.dispersionDeg * DEG;
  const angle = 2 * Math.PI * hashToUnit(gun.shotsFired * 2 + gun.owner * 104_729);
  const radius = Math.sqrt(hashToUnit(gun.shotsFired * 2 + 1 + gun.owner * 104_729)) * spread;
  const yaw = gun.yaw + (Math.cos(angle) * radius) / Math.max(0.2, Math.cos(gun.pitch));
  const pitch = gun.pitch + Math.sin(angle) * radius;
  const cosPitch = Math.cos(pitch);
  const s = config.muzzleVelocity;
  const p = gun.target.position;
  pool.spawn(p, { x: Math.sin(yaw) * cosPitch * s, y: Math.sin(pitch) * s, z: Math.cos(yaw) * cosPitch * s }, config.projectileLifetime, config.damagePerRound, gun.owner, team);
  gun.shotsFired++;
  gun.fired = true;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

import type { AircraftClassSpec } from '../config/aircraftClasses';
import { PRIMITIVE_GUN_MOUNTS } from '../config/airframe';
import type { GunSpec } from '../config/weapons';
import type { AircraftState } from '../flight/AircraftState';
import { rotateVec3 } from '../math/quat';
import { addVec3, normalizeVec3, setVec3, vec3 } from '../math/vec3';
import type { ProjectilePool } from './projectiles';

export interface GunState {
  /** 0 = cold, 1 = overheated. Rises while firing, falls otherwise. */
  heat: number;
  /** Locked out after overheating until heat falls below the recovery level. */
  overheated: boolean;
  /** Time banked towards the next round (s). */
  fireTimer: number;
  /** Which gun fires next: the guns fire in turn, which spreads the rounds evenly in time. */
  nextGun: number;
  /** Rounds fired so far. Also seeds each round's dispersion, so it's deterministic. */
  roundsFired: number;
  /** True if any round left the barrels in the last step. */
  firing: boolean;
}

export function createGunState(): GunState {
  return { heat: 0, overheated: false, fireTimer: Infinity, nextGun: 0, roundsFired: 0, firing: false };
}

export function gunMounts(spec: AircraftClassSpec): readonly { x: number; y: number; z: number }[] {
  return PRIMITIVE_GUN_MOUNTS[spec.combat.gunCount <= 2 ? 2 : 4];
}

// Scratch vectors.
const mount = vec3();
const aim = vec3();
const muzzle = vec3();
const direction = vec3();
const velocity = vec3();

/**
 * One physics step of the guns: heat, overheating and firing. Rounds are
 * added to `pool` with the aircraft's own velocity plus muzzle velocity along
 * each gun's aim line.
 * @returns rounds fired this step
 */
export function stepGuns(
  guns: GunState,
  aircraft: Readonly<AircraftState>,
  spec: AircraftClassSpec,
  gun: GunSpec,
  trigger: boolean,
  pool: ProjectilePool,
  owner: number,
  dt: number,
): number {
  const mounts = gunMounts(spec);
  const interval = 1 / (gun.roundsPerSecondPerGun * mounts.length);
  let fired = 0;

  if (trigger && !guns.overheated && !aircraft.crashed) {
    // Bank time and fire every whole interval. On a fresh trigger pull the
    // timer is "full", so the first round leaves at once.
    guns.fireTimer = Math.min(guns.fireTimer, interval) + dt;
    while (guns.fireTimer >= interval) {
      guns.fireTimer -= interval;
      fireRound(guns, aircraft, spec, gun, mounts, pool, owner);
      fired++;
    }
    guns.heat = Math.min(1, guns.heat + dt / gun.secondsToOverheat);
    if (guns.heat >= 1) guns.overheated = true;
  } else {
    guns.fireTimer = Infinity;
    guns.heat = Math.max(0, guns.heat - dt / gun.secondsToCool);
    if (guns.overheated && guns.heat <= gun.recoverBelowHeat) guns.overheated = false;
  }
  guns.firing = fired > 0;
  return fired;
}

function fireRound(
  guns: GunState,
  aircraft: Readonly<AircraftState>,
  spec: AircraftClassSpec,
  gun: GunSpec,
  mounts: readonly { x: number; y: number; z: number }[],
  pool: ProjectilePool,
  owner: number,
): void {
  const m = mounts[guns.nextGun % mounts.length];
  guns.nextGun = (guns.nextGun + 1) % mounts.length;
  if (!m) return;
  const scale = spec.airframeScale;
  setVec3(mount, m.x * scale, m.y * scale, m.z * scale);

  // Each gun is angled at the convergence point on the nose axis, so the
  // streams from both wings cross there, as on real fighters.
  setVec3(aim, -mount.x, -mount.y, gun.convergenceDistance - mount.z);
  normalizeVec3(aim, aim);

  // Dispersion: a deterministic pseudo-random point in a disc, from the round
  // count, so client and server (Phase 5) scatter identically.
  const spread = Math.tan((gun.dispersionDeg * Math.PI) / 180);
  const angle = 2 * Math.PI * hashToUnit(guns.roundsFired * 2 + owner * 7919);
  const radius = Math.sqrt(hashToUnit(guns.roundsFired * 2 + 1 + owner * 7919)) * spread;
  aim.x += Math.cos(angle) * radius;
  aim.y += Math.sin(angle) * radius;
  normalizeVec3(aim, aim);

  rotateVec3(direction, aircraft.orientation, aim);
  rotateVec3(muzzle, aircraft.orientation, mount);
  addVec3(muzzle, muzzle, aircraft.position);
  setVec3(
    velocity,
    aircraft.velocity.x + direction.x * gun.muzzleVelocity,
    aircraft.velocity.y + direction.y * gun.muzzleVelocity,
    aircraft.velocity.z + direction.z * gun.muzzleVelocity,
  );
  pool.spawn(muzzle, velocity, gun.projectileLifetime, gun.damagePerRound, owner);
  guns.roundsFired++;
}

/** Integer hash to [0, 1): the mulberry32 mixing function applied to one value. */
function hashToUnit(n: number): number {
  let t = (Math.imul(n | 0, 0x9e3779b1) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}

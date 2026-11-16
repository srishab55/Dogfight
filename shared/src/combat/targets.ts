import { PRACTICE_TARGET_CONFIG } from '../config/weapons';
import { HOME_RUNWAY, type RunwayDefinition } from '../config/world';
import type { Vec3 } from '../types/vector';

/** A floating practice balloon. Bursts after enough hits, then reappears after a delay. */
export interface PracticeTarget {
  readonly id: number;
  readonly position: Readonly<Vec3>;
  readonly radius: number;
  health: number;
  /** Seconds until a burst balloon reappears (0 while it's up). */
  respawnTimer: number;
}

export function createPracticeTargets(runway: RunwayDefinition = HOME_RUNWAY): PracticeTarget[] {
  return PRACTICE_TARGET_CONFIG.layout.map((offset, id) => ({
    id,
    position: { x: runway.center.x + offset.x, y: runway.center.y + offset.y, z: runway.center.z + offset.z },
    radius: PRACTICE_TARGET_CONFIG.radius,
    health: PRACTICE_TARGET_CONFIG.maxHealth,
    respawnTimer: 0,
  }));
}

export function isTargetAlive(target: Readonly<PracticeTarget>): boolean {
  return target.health > 0;
}

/** Applies damage. Returns true if this hit burst the balloon. */
export function damagePracticeTarget(target: PracticeTarget, damage: number): boolean {
  if (!isTargetAlive(target)) return false;
  target.health = Math.max(0, target.health - damage);
  if (target.health > 0) return false;
  target.respawnTimer = PRACTICE_TARGET_CONFIG.respawnSeconds;
  return true;
}

/** Counts down burst balloons and re-inflates them. */
export function updatePracticeTargets(targets: PracticeTarget[], dt: number): void {
  for (const target of targets) {
    if (isTargetAlive(target)) continue;
    target.respawnTimer -= dt;
    if (target.respawnTimer <= 0) {
      target.respawnTimer = 0;
      target.health = PRACTICE_TARGET_CONFIG.maxHealth;
    }
  }
}

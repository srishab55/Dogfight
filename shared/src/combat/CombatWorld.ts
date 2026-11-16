import type { AircraftClassSpec } from '../config/aircraftClasses';
import { GUN_SPECS } from '../config/weapons';
import type { AircraftState } from '../flight/AircraftState';
import type { GroundQuery } from '../flight/ground';
import { stepGuns, type GunState } from './guns';
import { ProjectilePool, type ImpactListener } from './projectiles';
import { createPracticeTargets, damagePracticeTarget, isTargetAlive, updatePracticeTargets, type PracticeTarget } from './targets';

/** Something that happened this step, for effects, sound and the HUD. */
export type CombatEvent =
  | { readonly type: 'groundImpact'; readonly x: number; readonly y: number; readonly z: number; readonly owner: number }
  | { readonly type: 'targetHit'; readonly targetId: number; readonly x: number; readonly y: number; readonly z: number; readonly owner: number }
  | { readonly type: 'targetDestroyed'; readonly targetId: number; readonly x: number; readonly y: number; readonly z: number; readonly owner: number };

/** An aircraft that can shoot this step. */
export interface Shooter {
  readonly id: number;
  readonly state: Readonly<AircraftState>;
  readonly spec: AircraftClassSpec;
  readonly guns: GunState;
  readonly trigger: boolean;
}

/** Default pool size: four guns at 13 rounds/s each, 2.2 s lifetime = ~115 rounds per aircraft in flight. */
const DEFAULT_CAPACITY = 2048;

/**
 * All weapons simulation for one match: guns, rounds in flight, targets.
 * Lives in `shared` because the authoritative server (Phase 5) runs exactly
 * this; for now the client runs it locally, inside the fixed physics step.
 */
export class CombatWorld implements ImpactListener {
  readonly projectiles: ProjectilePool;
  readonly targets: PracticeTarget[];
  private readonly pending: CombatEvent[] = [];
  private readonly hittable: (PracticeTarget | null)[];

  constructor(
    private readonly ground: GroundQuery,
    targets: PracticeTarget[] = createPracticeTargets(),
    capacity = DEFAULT_CAPACITY,
  ) {
    this.projectiles = new ProjectilePool(capacity);
    this.targets = targets;
    this.hittable = targets.map(() => null);
  }

  step(dt: number, shooters: readonly Shooter[]): void {
    for (const shooter of shooters) {
      stepGuns(shooter.guns, shooter.state, shooter.spec, GUN_SPECS[shooter.spec.id], shooter.trigger, this.projectiles, shooter.id, dt);
    }
    // Only standing balloons can be hit; keep indices aligned with `targets`.
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      this.hittable[i] = target && isTargetAlive(target) ? target : null;
    }
    this.projectiles.step(dt, this.ground, this.hittable, this);
    updatePracticeTargets(this.targets, dt);
  }

  /** Returns the events since the last call and clears them. */
  drainEvents(): CombatEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  onGroundImpact(x: number, y: number, z: number, owner: number): void {
    this.pending.push({ type: 'groundImpact', x, y, z, owner });
  }

  onTargetHit(targetIndex: number, x: number, y: number, z: number, damage: number, owner: number): void {
    const target = this.targets[targetIndex];
    if (!target) return;
    const destroyed = damagePracticeTarget(target, damage);
    this.pending.push({ type: destroyed ? 'targetDestroyed' : 'targetHit', targetId: target.id, x, y, z, owner });
  }
}

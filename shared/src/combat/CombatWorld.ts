import type { AircraftClassSpec } from '../config/aircraftClasses';
import { AIRCRAFT_HIT_SHAPE_CONFIG, CARRIER_DAMAGE_CONFIG } from '../config/targets';
import { GUN_SPECS } from '../config/weapons';
import { CARRIERS, carrierPartAt, type CarrierDefinition } from '../config/world';
import type { AircraftState } from '../flight/AircraftState';
import type { GroundQuery } from '../flight/ground';
import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';
import type { CarrierStatusMap } from '../world/carrierStatus';
import { createAaGun, stepAaGun, type AaGunState, type AaTarget } from './antiAircraft';
import { createBaseControls, stepBaseControls, type BaseControl, type BaseEvent } from './baseControl';
import type { BaseDefinition, BaseOwnerLookup } from '../config/world';
import { stepGuns, type GunState } from './guns';
import { airframeHitSpheres, placeHitSpheres, type PlacedSphere } from './hitShapes';
import { ProjectilePool, teamCode, type ImpactListener, type SphereTarget } from './projectiles';
import { createTargets, damageTarget, isTargetAlive, updateTargets, type CombatTarget, type TargetKind, type TargetOptions } from './targets';

/** Something that happened this step, for effects, sound and the HUD. */
export type CombatEvent =
  | { readonly type: 'groundImpact'; readonly x: number; readonly y: number; readonly z: number; readonly owner: number }
  /** `damage`: hull points the hit actually removed (after armour), for after-action reports. */
  | { readonly type: 'targetHit'; readonly targetId: number; readonly kind: TargetKind; readonly x: number; readonly y: number; readonly z: number; readonly owner: number; readonly damage: number }
  | { readonly type: 'targetDestroyed'; readonly targetId: number; readonly kind: TargetKind; readonly x: number; readonly y: number; readonly z: number; readonly owner: number; readonly damage: number }
  | { readonly type: 'targetRespawned'; readonly targetId: number; readonly kind: TargetKind }
  | { readonly type: 'aircraftHit'; readonly victim: number; readonly x: number; readonly y: number; readonly z: number; readonly owner: number; readonly damage: number }
  | { readonly type: 'aircraftShotDown'; readonly victim: number; readonly x: number; readonly y: number; readonly z: number; readonly owner: number }
  | { readonly type: 'aaFired'; readonly targetId: number; readonly x: number; readonly y: number; readonly z: number }
  | BaseEvent;

/** An aircraft in the fight this step: it can shoot, and be shot. */
export interface Shooter {
  readonly id: number;
  readonly team: Team;
  readonly state: AircraftState;
  readonly spec: AircraftClassSpec;
  readonly guns: GunState;
  readonly trigger: boolean;
}

/** Default pool size: aircraft guns plus every AA gun's shells in flight. */
const DEFAULT_CAPACITY = 4096;
/** AA guns stamp their shells with owner ids from here up (aircraft use small ids). */
const AA_OWNER_BASE = 10_000;
/** Most aircraft one step can hold hit shapes for. */
const MAX_AIRCRAFT = 16;
const SPHERES_PER_AIRCRAFT = AIRCRAFT_HIT_SHAPE_CONFIG.fuselageStations.length + 2 * AIRCRAFT_HIT_SHAPE_CONFIG.wingStations.length;

/**
 * All weapons simulation for one match: aircraft guns, anti-aircraft guns,
 * rounds in flight, and everything they can hit (balloons, guns, parked
 * aircraft, carriers and the aircraft themselves).
 *
 * Lives in `shared` because the authoritative server (Phase 5) runs exactly
 * this; for now the client runs it locally, inside the fixed physics step.
 */
export class CombatWorld implements ImpactListener {
  readonly projectiles: ProjectilePool;
  readonly targets: CombatTarget[];
  readonly aaGuns: AaGunState[];
  /** Who holds each base, and captures under way. */
  readonly bases: BaseControl[] = createBaseControls();
  private readonly baseEvents: BaseEvent[] = [];
  private readonly pending: CombatEvent[] = [];
  /** Everything with a hit sphere this step: alive targets, then aircraft spheres. */
  private readonly hittable: (SphereTarget | null)[] = [];
  /** What each hittable sphere belongs to: a target index (>= 0) or -(shooter index + 1). */
  private readonly hittableOwner: number[] = [];
  private readonly aircraftSpheres: PlacedSphere[];
  /** Each target's hit sphere, built once (targets don't move; their team can change, with a captured base). */
  private readonly targetSpheres: { position: Readonly<Vec3>; radius: number; team: number }[];
  private readonly aaTargets: AaTarget[] = [];
  private shooters: readonly Shooter[] = [];
  private readonly respawned: CombatTarget[] = [];
  private readonly carriersById: ReadonlyMap<string, CarrierDefinition>;

  constructor(
    private readonly ground: GroundQuery,
    targets: CombatTarget[] = createTargets(),
    /** Carrier sink state shared with the world ground, so a sunk deck stops being ground. Null: carriers can't sink. */
    private readonly carrierStatuses: CarrierStatusMap | null = null,
    capacity = DEFAULT_CAPACITY,
    carriers: readonly CarrierDefinition[] = CARRIERS,
    /** How the targets were made, so `reset()` makes them the same way. */
    private readonly targetOptions: TargetOptions = {},
  ) {
    this.projectiles = new ProjectilePool(capacity);
    this.targets = targets;
    this.aaGuns = targets.filter((t) => t.kind === 'aaGun').map((t) => createAaGun(t, AA_OWNER_BASE + t.id));
    this.carriersById = new Map(carriers.map((c) => [c.id, c]));
    this.aircraftSpheres = Array.from({ length: MAX_AIRCRAFT * SPHERES_PER_AIRCRAFT }, () => ({ position: { x: 0, y: 0, z: 0 }, radius: 0, team: -1 }));
    this.targetSpheres = targets.map((t) => ({ position: t.position, radius: t.radius, team: teamCode(t.team) }));
  }

  step(dt: number, shooters: readonly Shooter[]): void {
    this.shooters = shooters;
    for (const shooter of shooters) {
      stepGuns(shooter.guns, shooter.state, shooter.spec, GUN_SPECS[shooter.spec.id], shooter.trigger, this.projectiles, shooter.id, dt, teamCode(shooter.team));
    }

    this.aaTargets.length = 0;
    for (const shooter of shooters) this.aaTargets.push({ team: teamCode(shooter.team), state: shooter.state });
    for (const gun of this.aaGuns) {
      stepAaGun(gun, this.aaTargets, this.projectiles, dt);
      if (gun.fired) this.pending.push({ type: 'aaFired', targetId: gun.target.id, ...gun.target.position });
    }

    this.collectHittable(shooters);
    this.projectiles.step(dt, this.ground, this.hittable, this);

    this.respawned.length = 0;
    updateTargets(this.targets, dt, this.respawned);
    for (const target of this.respawned) this.pending.push({ type: 'targetRespawned', targetId: target.id, kind: target.kind });
    this.updateSinking();
    this.baseEvents.length = 0;
    stepBaseControls(this.bases, this.targets, shooters, dt, this.baseEvents);
    this.pending.push(...this.baseEvents);
  }

  /** Who holds a base now (captured bases have changed sides; null: nobody yet). Pass to services such as rearming. */
  readonly ownerOf: BaseOwnerLookup = (base: BaseDefinition) => {
    const control = this.bases.find((b) => b.base.id === base.id);
    return control ? control.owner : base.team;
  };

  /** The team that fired a round, from its owner id: an aircraft in this step, or an AA gun (its base's side). */
  teamOfOwner(owner: number): Team | null {
    if (owner >= AA_OWNER_BASE) return this.targets[owner - AA_OWNER_BASE]?.team ?? null;
    return this.shooters.find((s) => s.id === owner)?.team ?? null;
  }

  /**
   * Back to the start of a match: every target, base, gun and carrier as
   * created, no rounds in flight, no events. Objects are reset in place, so
   * whatever holds a reference to a target (visuals) sees the fresh state.
   */
  reset(targets: readonly CombatTarget[] = createTargets(this.targetOptions)): void {
    targets.forEach((fresh, i) => {
      const target = this.targets[i];
      if (target) Object.assign(target, fresh);
    });
    createBaseControls().forEach((fresh, i) => {
      const control = this.bases[i];
      if (control) Object.assign(control, fresh);
    });
    this.aaGuns.forEach((gun) => Object.assign(gun, createAaGun(gun.target, gun.owner)));
    this.projectiles.clear();
    this.carrierStatuses?.forEach((status) => Object.assign(status, { sink: 0, sternDownDeg: 0, listDeg: 0 }));
    this.pending.length = 0;
  }

  /** Returns the events since the last call and clears them. */
  drainEvents(): CombatEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  /**
   * A round hit the ground, the sea, or a carrier's hull, deck or island
   * (carriers are part of the world ground). Enemy carriers take the hit.
   */
  onGroundImpact(x: number, y: number, z: number, owner: number, team: number, damage: number): void {
    for (const target of this.targets) {
      if (target.kind !== 'carrier' || !isTargetAlive(target) || teamCode(target.team) === team || !target.carrierId) continue;
      const carrier = this.carriersById.get(target.carrierId);
      if (!carrier || !carrierPartAt(carrier, x, z)) continue;
      this.hitTarget(target, x, y, z, damage, owner);
      return;
    }
    this.pending.push({ type: 'groundImpact', x, y, z, owner });
  }

  onTargetHit(index: number, x: number, y: number, z: number, damage: number, owner: number): void {
    const ref = this.hittableOwner[index] ?? 0;
    if (ref >= 0) {
      const target = this.targets[ref];
      if (target) this.hitTarget(target, x, y, z, damage, owner);
      return;
    }
    const shooter = this.shooters[-ref - 1];
    if (!shooter || shooter.state.crashed) return;
    const state = shooter.state;
    state.hullHealth = Math.max(0, state.hullHealth - damage);
    this.pending.push({ type: 'aircraftHit', victim: shooter.id, x, y, z, owner, damage });
    if (state.hullHealth <= 0 && !state.shotDown) {
      state.shotDown = true;
      this.pending.push({ type: 'aircraftShotDown', victim: shooter.id, x, y, z, owner });
    }
  }

  /**
   * Damages a target directly (before armour), as if hit at its centre:
   * for weapons that aren't rounds (bombs, later) and for tests.
   */
  applyHit(target: CombatTarget, damage: number, owner: number): void {
    this.hitTarget(target, target.position.x, target.position.y, target.position.z, damage, owner);
  }

  private hitTarget(target: CombatTarget, x: number, y: number, z: number, damage: number, owner: number): void {
    const before = target.health;
    const destroyed = damageTarget(target, damage);
    this.pending.push({ type: destroyed ? 'targetDestroyed' : 'targetHit', targetId: target.id, kind: target.kind, x, y, z, owner, damage: before - target.health });
    if (destroyed && target.kind === 'carrier') this.loseCarrierGuns(target);
  }

  /** A carrier going down takes its guns with it; they come back with the new carrier. */
  private loseCarrierGuns(carrier: CombatTarget): void {
    for (const target of this.targets) {
      if (target.kind !== 'aaGun' || target.carrierId !== carrier.carrierId) continue;
      if (isTargetAlive(target)) {
        this.pending.push({ type: 'targetDestroyed', targetId: target.id, kind: target.kind, ...target.position, owner: -1, damage: target.health });
        target.destroyedSeconds = 0;
      }
      target.health = 0;
      // Even a gun shot off earlier (never coming back by itself) returns with the new ship.
      target.respawnTimer = carrier.respawnTimer;
    }
  }

  /** Destroyed carriers sink, stern first and listing, over CARRIER_DAMAGE_CONFIG.sinkSeconds; a replacement floats at full height. */
  private updateSinking(): void {
    if (!this.carrierStatuses) return;
    const c = CARRIER_DAMAGE_CONFIG;
    for (const target of this.targets) {
      if (target.kind !== 'carrier' || !target.carrierId) continue;
      const status = this.carrierStatuses.get(target.carrierId);
      if (!status) continue;
      const sinceDestroyed = isTargetAlive(target) ? 0 : target.destroyedSeconds;
      const progress = Math.min(1, sinceDestroyed / c.sinkSeconds);
      // Slow at first, then going faster as she fills: progress squared.
      status.sink = c.finalSinkDepth * progress * progress;
      status.sternDownDeg = c.maxSternDownDeg * Math.min(1, progress * 1.6);
      status.listDeg = c.maxListDeg * Math.min(1, progress * 1.3);
    }
  }

  /** Alive targets with a hit sphere, then every flying aircraft's hit spheres. Indices stay aligned with `hittableOwner`. */
  private collectHittable(shooters: readonly Shooter[]): void {
    let n = 0;
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      if (!target || target.radius <= 0 || !isTargetAlive(target)) continue;
      const sphere = this.targetSpheres[i];
      // A captured base's targets change sides.
      if (sphere) sphere.team = teamCode(target.team);
      this.setHittable(n++, sphere ?? null, i);
    }
    let used = 0;
    for (let s = 0; s < shooters.length && s < MAX_AIRCRAFT; s++) {
      const shooter = shooters[s];
      if (!shooter || shooter.state.crashed) continue;
      const count = airframeHitSpheres(shooter.spec.airframe).length;
      if (used + count > this.aircraftSpheres.length) break;
      placeHitSpheres(shooter.state, shooter.spec, teamCode(shooter.team), this.aircraftSpheres, used);
      for (let k = 0; k < count; k++) this.setHittable(n++, this.aircraftSpheres[used + k] ?? null, -(s + 1));
      used += count;
    }
    this.hittable.length = n;
    this.hittableOwner.length = n;
  }

  private setHittable(index: number, sphere: SphereTarget | null, owner: number): void {
    this.hittable[index] = sphere;
    this.hittableOwner[index] = owner;
  }
}

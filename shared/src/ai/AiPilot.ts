import { hasTailhook, type AircraftClassSpec } from '../config/aircraftClasses';
import { AI_CONFIG } from '../config/ai';
import { GUN_SPECS } from '../config/weapons';
import { BASES, baseSpawnPoint, type BaseDefinition, type BaseOwnerLookup } from '../config/world';
import { startingBases, type BaseControl } from '../combat/baseControl';
import { createGunState, fullAmmo, type GunState } from '../combat/guns';
import { createServiceStatus, type ServiceStatus } from '../combat/service';
import { BASE_DEFENCE_KINDS, isTargetAlive, type CombatTarget } from '../combat/targets';
import { createParkedState, type AircraftState } from '../flight/AircraftState';
import { planAutoLand, stepAutoLand, type AutoLand } from '../flight/autoLand';
import { DEFAULT_DIRECTION_PILOT, steerTowards, type DirectionPilotTuning, type StickInputs } from '../flight/directionPilot';
import { neutralControls, type FlightControls } from '../flight/FlightControls';
import type { GroundQuery } from '../flight/ground';
import { computePerformance, type AircraftPerformance } from '../flight/performance';
import { groundClearance } from '../config/aircraftClasses';
import { rotateVec3 } from '../math/quat';
import { vec3 } from '../math/vec3';
import type { Team } from '../types/team';
import type { Vec3 } from '../types/vector';
import type { CarrierStatusMap } from '../world/carrierStatus';
import { Status, action, condition, selector, sequence, type BtNode } from './behaviourTree';

/*
 * An AI pilot: a behaviour tree (game-skills/GameAI/references/behaviour-tree.md)
 * that chooses control positions each physics step, flying the same flight
 * model, guns and rules as the player. Its top level is a two-state machine
 * (in the air / waiting to launch); in the air, the tree, highest priority first:
 *
 *   on the ground     take off, or wait out a capture or a service
 *   terrain ahead     pull up
 *   landing           fly the auto-land it started (to capture or to rearm)
 *   under attack      break turn
 *   needs service     go home and land to rearm and repair
 *   enemy aircraft    attack it: lead pursuit, fire when on target
 *   a base to take    land on it if it's open; otherwise strafe its defences
 *   patrol            fly towards the action
 *
 * Deterministic (no Math.random): the Phase 5 server runs the same pilots.
 */

export type AiRole = 'hunter' | 'raider';

/** Any aircraft in the fight, as the AI sees it. */
export interface AiContact {
  readonly id: number;
  readonly team: Team;
  readonly state: Readonly<AircraftState>;
}

/** What the AI pilots read about the world each step. */
export interface AiWorld {
  /** Match time (s): for cooldowns and aim wander. */
  readonly time: number;
  readonly ground: GroundQuery;
  readonly aircraft: readonly AiContact[];
  readonly targets: readonly CombatTarget[];
  readonly bases: readonly BaseControl[];
  readonly ownerOf: BaseOwnerLookup;
  readonly carrierStatuses: CarrierStatusMap | null;
  /** Every AI pilot (their blackboards say which base each is going for, so teammates spread out). */
  readonly pilots: readonly AiPilot[];
}

interface Landing {
  readonly base: BaseDefinition;
  readonly purpose: 'capture' | 'service';
  readonly auto: AutoLand;
}

/** The shared memory between the tree's nodes. */
interface Blackboard {
  target: AiContact | null;
  objective: BaseDefinition | null;
  groundTarget: CombatTarget | null;
  landing: Landing | null;
  /** The base it's on after a landing, while waiting there. */
  landedAt: Landing | null;
  groundTimer: number;
  takingOff: boolean;
  evadeUntil: number;
  evadeReadyAt: number;
  evadeSide: 1 | -1;
  strafe: 'setup' | 'dive' | 'recover';
  strafeTimer: number;
}

interface Context {
  readonly pilot: AiPilot;
  readonly world: AiWorld;
}

const DEG = Math.PI / 180;
/** Flying from place to place: steer the flight path, firmly but not to the limit. */
const NAVIGATION: DirectionPilotTuning = { ...DEFAULT_DIRECTION_PILOT, aimWithNose: false, maxTurnAccelG: 5 };
/**
 * Gunnery: point the nose, pull as hard as the aircraft allows. Stiffer than
 * mouse flying: following a turning target needs extra pull, and at the
 * mouse pilot's gain that would leave the nose several degrees behind the
 * firing solution (proportional steering's steady error).
 */
const GUNNERY: DirectionPilotTuning = { ...DEFAULT_DIRECTION_PILOT, turnAccelPerRadG: 28 };
/** Chasing: steer the flight path itself (the nose rides above it), pulling hard. */
const PURSUIT: DirectionPilotTuning = { ...DEFAULT_DIRECTION_PILOT, aimWithNose: false };
const FORWARD: Vec3 = { x: 0, y: 0, z: 1 };

export class AiPilot {
  state: AircraftState;
  guns: GunState;
  readonly controls: FlightControls = neutralControls();
  readonly service: ServiceStatus = createServiceStatus();
  readonly performance: AircraftPerformance;
  /** In the world (launched and not yet lost). */
  spawned = false;
  /** Seconds until it launches; Infinity: its team holds no base to launch from. */
  respawnIn: number;
  /** The leaf it ran last step: what it's doing, for the debug overlay and tests. */
  activity = 'waiting to launch';
  losses = 0;
  /** In a gun attack: how far the nose is off the firing solution (deg); for the debug overlay and tests. */
  aimErrorDeg = 0;
  readonly blackboard: Blackboard = freshBlackboard();
  private readonly tree: BtNode<Context>;
  private readonly sticks: StickInputs = { pitch: 0, roll: 0, yaw: 0 };
  /** Integral aim correction while tracking a target (a direction offset). */
  readonly aimBias = vec3();
  private readonly aim = vec3();
  private readonly nose = vec3();

  constructor(
    readonly id: number,
    readonly team: Team,
    readonly spec: AircraftClassSpec,
    readonly role: AiRole,
    launchDelay: number,
  ) {
    this.respawnIn = launchDelay;
    this.state = createParkedState(spec, baseSpawnPoint(BASES[0]!));
    this.guns = createGunState(spec);
    this.performance = computePerformance(spec);
    this.tree = buildTree();
  }

  /** Chooses this step's controls (trigger included). Call before the physics step. */
  think(world: AiWorld, dt: number): void {
    if (!this.spawned) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.launch(world);
      return;
    }
    if (this.state.crashed) {
      this.spawned = false;
      this.losses++;
      this.respawnIn = AI_CONFIG.respawnSeconds;
      this.activity = 'lost';
      return;
    }
    Object.assign(this.controls, neutralControls(), { throttle: this.state.throttle });
    this.tree.tick({ pilot: this, world }, dt);
  }

  /** Starts at a base its team holds (on the catapult, or the runway), with full guns. */
  private launch(world: AiWorld): void {
    const bases = startingBases(this.team, this.spec, world.ownerOf, world.carrierStatuses);
    if (bases.length === 0) {
      this.respawnIn = Infinity;
      return;
    }
    // Raiders start nearest the middle of the map (where the bases to take are); hunters, from home.
    const base = this.role === 'raider' ? (bases.slice().sort((a, b) => distanceFromCentre(a) - distanceFromCentre(b))[0] ?? bases[0]!) : bases[0]!;
    this.state = createParkedState(this.spec, baseSpawnPoint(base), base.kind === 'carrier');
    this.guns = createGunState(this.spec);
    Object.assign(this.service, createServiceStatus());
    Object.assign(this.blackboard, freshBlackboard(), { takingOff: true });
    this.tree.reset();
    this.spawned = true;
    this.activity = 'taking off';
  }

  // ── Helpers the tree's leaves use ──

  heightAboveGround(ground: GroundQuery): number {
    const p = this.state.position;
    return p.y - groundClearance(this.spec) - ground.heightAt(p.x, p.z);
  }

  /** Steers along a compass heading (rad) at a climb angle (rad). */
  steerHeading(heading: number, climb: number, tuning: DirectionPilotTuning = NAVIGATION): void {
    this.aim.x = Math.cos(climb) * Math.sin(heading);
    this.aim.y = Math.sin(climb);
    this.aim.z = Math.cos(climb) * Math.cos(heading);
    this.steer(this.aim, tuning);
  }

  /** Steers at a world direction (need not be normalised). */
  steer(direction: Readonly<Vec3>, tuning: DirectionPilotTuning = NAVIGATION): void {
    steerTowards(this.state, this.spec, direction, this.sticks, tuning);
    this.controls.pitch = this.sticks.pitch;
    this.controls.roll = this.sticks.roll;
    this.controls.yaw = this.sticks.yaw;
  }

  /** Flies towards a point at a sensible climb or descent (at most `maxClimbDeg`). */
  flyTo(x: number, y: number, z: number, maxClimbDeg = 18): void {
    const p = this.state.position;
    const heading = Math.atan2(x - p.x, z - p.z);
    const climb = Math.max(-maxClimbDeg * DEG, Math.min(maxClimbDeg * DEG, Math.atan2(y - p.y, Math.max(300, Math.hypot(x - p.x, z - p.z)))));
    this.steerHeading(heading, climb);
  }

  /** Which way the nose (and the guns) points: a unit vector, valid until the next call. */
  noseDirection(): Readonly<Vec3> {
    return rotateVec3(this.nose, this.state.orientation, FORWARD);
  }

  /** Angle between the nose and a direction (rad). */
  noseAngleTo(direction: Readonly<Vec3>): number {
    rotateVec3(this.nose, this.state.orientation, FORWARD);
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const cos = (this.nose.x * direction.x + this.nose.y * direction.y + this.nose.z * direction.z) / length;
    return Math.acos(Math.max(-1, Math.min(1, cos)));
  }

  track(): number {
    const v = this.state.velocity;
    return Math.atan2(v.x, v.z);
  }

  /** Whether it should go home: low on rounds, or badly damaged. */
  needsService(): boolean {
    return this.guns.ammo < fullAmmo(this.spec) * AI_CONFIG.rtbAmmoFraction || this.state.hullHealth < this.spec.combat.maxHullHealth * AI_CONFIG.rtbHullFraction;
  }

  /** Its team's nearest base it can land on (a carrier needs a hook and must be afloat), or null. */
  nearestFriendlyBase(world: AiWorld): BaseDefinition | null {
    const p = this.state.position;
    let best: BaseDefinition | null = null;
    let bestDistance = Infinity;
    for (const base of BASES) {
      if (world.ownerOf(base) !== this.team) continue;
      if (base.kind === 'carrier' && (!hasTailhook(this.spec) || (world.carrierStatuses?.get(base.id)?.sink ?? 0) > 0)) continue;
      const d = Math.hypot(base.runway.center.x - p.x, base.runway.center.z - p.z);
      if (d < bestDistance) {
        best = base;
        bestDistance = d;
      }
    }
    return best;
  }
}

function freshBlackboard(): Blackboard {
  return { target: null, objective: null, groundTarget: null, landing: null, landedAt: null, groundTimer: 0, takingOff: false, evadeUntil: -Infinity, evadeReadyAt: -Infinity, evadeSide: 1, strafe: 'setup', strafeTimer: 0 };
}

function distanceFromCentre(base: BaseDefinition): number {
  return Math.hypot(base.runway.center.x, base.runway.center.z);
}

// ── The tree ────────────────────────────────────────────────────────────

function buildTree(): BtNode<Context> {
  return selector('pilot', [
    // (Landing's own roll-out stays with the landing branch until it has stopped.)
    sequence('on the ground', [condition('on the ground or taking off', ({ pilot }) => (pilot.state.onGround && !pilot.blackboard.landing) || pilot.blackboard.takingOff), action('take off or wait', groundRoutine)]),
    sequence('avoid terrain', [condition('ground ahead', terrainAhead), action('pull up', pullUp)]),
    sequence('stay on the map', [condition('off the map', offTheMap), action('turn back', turnBack)]),
    sequence('landing', [condition('landing', keepLanding), action('fly the landing', flyLanding)]),
    sequence('evade', [condition('under attack', underAttack), action('break turn', evade)]),
    sequence('go home', [condition('needs service', ({ pilot }) => pilot.needsService()), action('land to rearm', landToRearm)]),
    sequence('fight', [condition('enemy aircraft near', findAircraftTarget), action('attack', attackAircraft)]),
    sequence('take a base', [condition('a base to take', chooseObjective), action('take it', takeObjective)]),
    action('patrol', patrol),
  ]);
}

/** Marks what it's doing (for the debug overlay and tests) and returns RUNNING. */
function running(pilot: AiPilot, activity: string): Status {
  pilot.activity = activity;
  return Status.Running;
}

/**
 * On the ground. Just landed: stopped at idle, brakes on, while the base is
 * captured or the crew rearms it; then the ground crew tows it to the start
 * of the runway (or the catapult) and it takes off. Taking off: full
 * throttle along the runway, rotate at flying speed, climb out to a safe height.
 */
function groundRoutine({ pilot, world }: Context, dt: number): Status {
  const bb = pilot.blackboard;
  const state = pilot.state;
  const c = pilot.controls;
  if (bb.landedAt && !bb.takingOff) {
    c.throttle = 0;
    c.brake = 1;
    bb.groundTimer += dt;
    const landing = bb.landedAt;
    const done = landing.purpose === 'capture' ? world.ownerOf(landing.base) === pilot.team : !pilot.needsService() && pilot.guns.ammo === fullAmmo(pilot.spec);
    const lost = world.ownerOf(landing.base) !== pilot.team && landing.purpose === 'service';
    if ((done && bb.groundTimer > 1) || lost || bb.groundTimer > AI_CONFIG.groundWaitSeconds) {
      // Towed to the start of the runway (a carrier: the catapult), ready to go.
      const base = world.ownerOf(landing.base) === pilot.team ? landing.base : (pilot.nearestFriendlyBase(world) ?? landing.base);
      const guns = pilot.guns;
      pilot.state = createParkedState(pilot.spec, baseSpawnPoint(base), base.kind === 'carrier');
      pilot.state.hullHealth = Math.max(pilot.state.hullHealth, state.hullHealth);
      pilot.guns = guns;
      bb.landedAt = null;
      bb.takingOff = true;
    }
    return running(pilot, landing.purpose === 'capture' ? 'capturing' : 'rearming');
  }
  if (state.onGround && !bb.takingOff) {
    // On the ground without having landed here deliberately (bounced in, say): take off again.
    bb.takingOff = true;
  }
  bb.landing = null;
  // Taking off.
  c.throttle = 1;
  c.brake = 0;
  c.flaps = 0.5;
  const heading = state.onGround ? headingOf(state) : pilot.track();
  if (state.onGround) {
    const rotate = state.telemetry.airspeed > pilot.performance.stallSpeed * 1.2;
    if (rotate) pilot.steerHeading(heading, 10 * DEG);
    else {
      c.pitch = 0;
      c.roll = 0;
    }
    return running(pilot, 'taking off');
  }
  pilot.steerHeading(heading, 12 * DEG);
  if (pilot.heightAboveGround(world.ground) > 80) {
    bb.takingOff = false;
    c.flaps = 0;
    return Status.Success;
  }
  return running(pilot, 'climbing out');
}

/** The heading the nose points (rad). */
function headingOf(state: Readonly<AircraftState>): number {
  const q = state.orientation;
  // Forward (0, 0, 1) rotated by q, projected on the ground.
  const x = 2 * (q.x * q.z + q.w * q.y);
  const z = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(x, z);
}

/** Its path over the next few seconds comes within the margin of the ground or sea. */
function terrainAhead({ pilot, world }: Context): boolean {
  const state = pilot.state;
  if (state.onGround || pilot.blackboard.landing) return false;
  const p = state.position;
  const v = state.velocity;
  const clearance = groundClearance(pilot.spec);
  for (let t = 0.5; t <= AI_CONFIG.terrainLookSeconds; t += 0.5) {
    const x = p.x + v.x * t;
    const z = p.z + v.z * t;
    if (p.y + v.y * t - clearance - world.ground.heightAt(x, z) < AI_CONFIG.terrainMargin) return true;
  }
  return false;
}

function pullUp({ pilot }: Context): Status {
  pilot.controls.throttle = 1;
  pilot.controls.fire = false;
  pilot.steerHeading(pilot.track(), 25 * DEG, GUNNERY);
  return running(pilot, 'pulling up');
}

/** Beyond the edge of the map; further out is allowed while chasing an enemy close by (no escaping a fight off the edge). */
function offTheMap({ pilot }: Context): boolean {
  const p = pilot.state.position;
  const target = pilot.blackboard.target;
  const chasing = target !== null && flying(target.state) && Math.hypot(target.state.position.x - p.x, target.state.position.z - p.z) < AI_CONFIG.chaseBeyondBoundary.range;
  return Math.max(Math.abs(p.x), Math.abs(p.z)) > AI_CONFIG.boundary + (chasing ? AI_CONFIG.chaseBeyondBoundary.extra : 0);
}

function turnBack({ pilot }: Context): Status {
  pilot.controls.throttle = 0.9;
  pilot.flyTo(0, AI_CONFIG.cruiseHeight, 0);
  return running(pilot, 'turning back');
}

/** Keeps landing unless attacked while still well up (then it fights), or the reason to land has gone. */
function keepLanding(context: Context): boolean {
  const { pilot, world } = context;
  const landing = pilot.blackboard.landing;
  if (!landing) return false;
  const control = world.bases.find((b) => b.base.id === landing.base.id);
  const stillWorthIt =
    landing.purpose === 'service'
      ? world.ownerOf(landing.base) === pilot.team
      : control !== undefined && control.owner !== pilot.team && (control.owner === null || control.neutralized);
  if (!stillWorthIt || (underAttack(context) && pilot.heightAboveGround(world.ground) > 120)) {
    pilot.blackboard.landing = null;
    return false;
  }
  return true;
}

function flyLanding({ pilot, world }: Context, dt: number): Status {
  const landing = pilot.blackboard.landing;
  if (!landing) return Status.Failure;
  pilot.controls.fire = false;
  const phase = stepAutoLand(landing.auto, pilot.state, pilot.spec, world.ground, pilot.controls, dt);
  if (phase === 'done' && !pilot.state.crashed) {
    pilot.blackboard.landedAt = landing;
    pilot.blackboard.landing = null;
    pilot.blackboard.groundTimer = 0;
    return Status.Success;
  }
  return running(pilot, landing.purpose === 'capture' ? `landing to capture ${landing.base.name}` : `landing to rearm at ${landing.base.name}`);
}

/** An enemy behind it, close, nose on it. */
function underAttack({ pilot, world }: Context): boolean {
  if (world.time < pilot.blackboard.evadeUntil) return true;
  if (world.time < pilot.blackboard.evadeReadyAt) return false;
  const me = pilot.state;
  for (const contact of world.aircraft) {
    if (contact.team === pilot.team || !flying(contact.state)) continue;
    const dx = me.position.x - contact.state.position.x;
    const dy = me.position.y - contact.state.position.y;
    const dz = me.position.z - contact.state.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > AI_CONFIG.threatRange) continue;
    // It's behind us...
    const speed = Math.hypot(me.velocity.x, me.velocity.y, me.velocity.z) || 1;
    const behind = (me.velocity.x * dx + me.velocity.y * dy + me.velocity.z * dz) / (speed * distance) > 0.3;
    // ...and pointing at us.
    const theirSpeed = Math.hypot(contact.state.velocity.x, contact.state.velocity.y, contact.state.velocity.z) || 1;
    const aimed = (contact.state.velocity.x * dx + contact.state.velocity.y * dy + contact.state.velocity.z * dz) / (theirSpeed * distance) > Math.cos(AI_CONFIG.threatConeDeg * DEG);
    if (behind && aimed) {
      const bb = pilot.blackboard;
      bb.evadeUntil = world.time + AI_CONFIG.evadeSeconds;
      bb.evadeReadyAt = world.time + AI_CONFIG.evadeSeconds + AI_CONFIG.evadeCooldown;
      // Break towards the side the attacker isn't on.
      const right = { x: Math.cos(pilot.track()), z: -Math.sin(pilot.track()) };
      bb.evadeSide = right.x * -dx + right.z * -dz > 0 ? -1 : 1;
      return true;
    }
  }
  return false;
}

/** A hard break turn, level or a little down if there's height to spare. */
function evade({ pilot, world }: Context): Status {
  const bb = pilot.blackboard;
  pilot.controls.throttle = 1;
  pilot.controls.fire = false;
  const descend = pilot.heightAboveGround(world.ground) > 400 ? -8 * DEG : 0;
  pilot.steerHeading(pilot.track() + bb.evadeSide * 80 * DEG, descend, GUNNERY);
  return running(pilot, 'breaking');
}

function landToRearm({ pilot, world }: Context): Status {
  const base = pilot.nearestFriendlyBase(world);
  if (!base) return Status.Failure;
  pilot.blackboard.landing = { base, purpose: 'service', auto: planAutoLand(base, pilot.state) };
  return running(pilot, `going home to ${base.name}`);
}

function flying(state: Readonly<AircraftState>): boolean {
  return !state.crashed && !state.shotDown && !state.onGround;
}

/** The nearest enemy aircraft in the air within this pilot's engagement range. */
function findAircraftTarget({ pilot, world }: Context): boolean {
  const range = AI_CONFIG.engageRange[pilot.role];
  const p = pilot.state.position;
  let best: AiContact | null = null;
  let bestDistance: number = range;
  for (const contact of world.aircraft) {
    if (contact.team === pilot.team || !flying(contact.state)) continue;
    const d = Math.hypot(contact.state.position.x - p.x, contact.state.position.y - p.y, contact.state.position.z - p.z);
    if (d < bestDistance) {
      best = contact;
      bestDistance = d;
    }
  }
  pilot.blackboard.target = best;
  return best !== null;
}

const aimScratch = vec3();
const leadScratch = vec3();

/**
 * Out of gun range, lead pursuit to close: fly at where the target will be
 * shortly. In range, the gun solution: point the nose where the target will
 * be when the rounds get there (relative motion and the rounds' drop allowed
 * for), with a little deterministic wander so not every burst hits; fire
 * when the nose is on it. Breaks away rather than collide, and won't follow
 * a target into the ground.
 */
function attackAircraft({ pilot, world }: Context, dt: number): Status {
  const target = pilot.blackboard.target;
  if (!target || !flying(target.state)) return Status.Failure;
  const me = pilot.state;
  const t = target.state;
  const dx = t.position.x - me.position.x;
  const dy = t.position.y - me.position.y;
  const dz = t.position.z - me.position.z;
  const distance = Math.hypot(dx, dy, dz);
  const c = pilot.controls;
  if (distance < AI_CONFIG.breakAwayDistance) {
    c.fire = false;
    c.throttle = 1;
    pilot.steerHeading(pilot.track() + 70 * DEG, 20 * DEG, GUNNERY);
    return running(pilot, 'breaking away');
  }
  // The gun solution: where to point the nose for the rounds to meet it.
  const muzzle = GUN_SPECS[pilot.spec.id].muzzleVelocity;
  const time = distance / muzzle;
  aimScratch.x = dx + (t.velocity.x - me.velocity.x) * time;
  aimScratch.y = dy + (t.velocity.y - me.velocity.y) * time + 0.5 * 9.81 * time * time;
  aimScratch.z = dz + (t.velocity.z - me.velocity.z) * time;
  if (distance > AI_CONFIG.trackingRange) {
    // Closing: lead pursuit, cutting inside a turning target. Fires if a
    // chance comes (the nose crosses the gun solution in range).
    c.fire = distance < AI_CONFIG.fireRange && pilot.noseAngleTo(aimScratch) < AI_CONFIG.fireConeDeg * DEG && pilot.guns.ammo > 0;
    const mySpeed = Math.hypot(me.velocity.x, me.velocity.y, me.velocity.z);
    const ahead = Math.min(1.5, (0.4 * distance) / Math.max(40, mySpeed));
    leadScratch.x = dx + t.velocity.x * ahead;
    leadScratch.y = dy + t.velocity.y * ahead;
    leadScratch.z = dz + t.velocity.z * ahead;
    if (leadScratch.y < 0 && pilot.heightAboveGround(world.ground) < AI_CONFIG.minAttackHeight) leadScratch.y = 0;
    pilot.steer(leadScratch, PURSUIT);
    c.throttle = 1;
    pilot.aimBias.x = pilot.aimBias.y = pilot.aimBias.z = 0;
    return running(pilot, 'closing in');
  }
  // Wander: a slow, pilot-specific circle about the lead point.
  const wander = AI_CONFIG.aimErrorDeg * DEG * Math.hypot(aimScratch.x, aimScratch.y, aimScratch.z);
  aimScratch.x += wander * Math.sin(world.time * 1.3 + pilot.id * 2.1);
  aimScratch.y += wander * Math.cos(world.time * 1.7 + pilot.id * 1.3);
  // Low down, it won't dive after the target.
  if (aimScratch.y < 0 && pilot.heightAboveGround(world.ground) < AI_CONFIG.minAttackHeight) aimScratch.y = 0;
  // Integral correction: steer a little beyond the solution, by however far the nose keeps lagging it.
  const length = Math.hypot(aimScratch.x, aimScratch.y, aimScratch.z) || 1;
  const nose = pilot.noseDirection();
  const k = AI_CONFIG.aimIntegralRate * dt;
  const bias = pilot.aimBias;
  bias.x += (aimScratch.x / length - nose.x) * k;
  bias.y += (aimScratch.y / length - nose.y) * k;
  bias.z += (aimScratch.z / length - nose.z) * k;
  const biasLength = Math.hypot(bias.x, bias.y, bias.z);
  if (biasLength > AI_CONFIG.aimIntegralMax) {
    bias.x *= AI_CONFIG.aimIntegralMax / biasLength;
    bias.y *= AI_CONFIG.aimIntegralMax / biasLength;
    bias.z *= AI_CONFIG.aimIntegralMax / biasLength;
  }
  leadScratch.x = aimScratch.x / length + bias.x;
  leadScratch.y = aimScratch.y / length + bias.y;
  leadScratch.z = aimScratch.z / length + bias.z;
  pilot.steer(leadScratch, GUNNERY);
  pilot.aimErrorDeg = pilot.noseAngleTo(aimScratch) / DEG;
  c.throttle = distance < 350 && (me.velocity.x * dx + me.velocity.z * dz) / Math.max(1, distance) > 15 ? 0.6 : 1;
  c.fire = distance < AI_CONFIG.fireRange && pilot.noseAngleTo(aimScratch) < AI_CONFIG.fireConeDeg * DEG && pilot.guns.ammo > 0;
  return running(pilot, 'attacking');
}

/**
 * The base to take next: the nearest one it doesn't hold, preferring any
 * that are open now (nobody's, or with their defences destroyed). Carriers
 * only for a hooked aircraft; the enemy's home carrier comes last.
 */
function chooseObjective({ pilot, world }: Context): boolean {
  const p = pilot.state.position;
  let best: BaseDefinition | null = null;
  let bestScore = Infinity;
  for (const control of world.bases) {
    const base = control.base;
    if (control.owner === pilot.team) continue;
    if (base.kind === 'carrier' && !hasTailhook(pilot.spec)) continue;
    const open = control.owner === null || control.neutralized;
    const distance = Math.hypot(base.runway.center.x - p.x, base.runway.center.z - p.z);
    // Teammates already going for it: spread out (unless it's defended, when two strafing is better).
    const claimed = world.pilots.filter((other) => other !== pilot && other.spawned && other.team === pilot.team && (other.blackboard.objective === base || other.blackboard.landing?.base === base)).length;
    const score = distance + (open ? claimed * 3_500 : 3_000 + claimed * 800) + (base.kind === 'carrier' ? 4_000 : 0);
    if (score < bestScore) {
      best = base;
      bestScore = score;
    }
  }
  if (best !== pilot.blackboard.objective) pilot.blackboard.strafe = 'setup';
  pilot.blackboard.objective = best;
  return best !== null;
}

function takeObjective(context: Context, dt: number): Status {
  const { pilot, world } = context;
  const base = pilot.blackboard.objective;
  if (!base) return Status.Failure;
  const control = world.bases.find((b) => b.base.id === base.id);
  if (!control) return Status.Failure;
  if (control.owner === null || control.neutralized) {
    pilot.blackboard.landing = { base, purpose: 'capture', auto: planAutoLand(base, pilot.state) };
    return running(pilot, `going to capture ${base.name}`);
  }
  // Defended: knock out its defences first, nearest first.
  const p = pilot.state.position;
  let target: CombatTarget | null = null;
  let bestDistance = Infinity;
  for (const t of world.targets) {
    if (t.baseId !== base.id || !BASE_DEFENCE_KINDS.includes(t.kind) || !isTargetAlive(t)) continue;
    const d = Math.hypot(t.position.x - p.x, t.position.z - p.z) + (t.kind === 'aaGun' ? -800 : 0);
    if (d < bestDistance) {
      target = t;
      bestDistance = d;
    }
  }
  if (!target) return Status.Failure;
  pilot.blackboard.groundTarget = target;
  return strafe(context, target, dt);
}

/**
 * A strafing run: set up a few kilometres out at a few hundred metres,
 * dive at the target firing inside range, pull up before it's too low or
 * too close, climb away, and come round again.
 */
function strafe({ pilot, world }: Context, target: CombatTarget, dt: number): Status {
  const s = AI_CONFIG.strafe;
  const bb = pilot.blackboard;
  const p = pilot.state.position;
  const c = pilot.controls;
  const dx = target.position.x - p.x;
  const dz = target.position.z - p.z;
  const horizontal = Math.hypot(dx, dz);
  const height = pilot.heightAboveGround(world.ground);
  c.throttle = 1;
  c.fire = false;
  if (bb.strafe === 'setup') {
    // A point out on the line from the target back towards us, at the run-in height.
    const k = s.setupDistance / Math.max(1, horizontal);
    const sx = target.position.x - dx * k;
    const sz = target.position.z - dz * k;
    pilot.flyTo(sx, target.position.y + s.setupHeight, sz);
    const facing = Math.abs(wrap(Math.atan2(dx, dz) - pilot.track())) < 25 * DEG;
    if (horizontal < s.setupDistance + 300 && horizontal > s.setupDistance * 0.6 && facing && height > s.setupHeight * 0.7) bb.strafe = 'dive';
    return running(pilot, 'setting up a strafing run');
  }
  if (bb.strafe === 'dive') {
    const time = Math.hypot(horizontal, target.position.y - p.y) / GUN_SPECS[pilot.spec.id].muzzleVelocity;
    aimScratch.x = dx;
    aimScratch.y = target.position.y - p.y + 0.5 * 9.81 * time * time;
    aimScratch.z = dz;
    pilot.steer(aimScratch, GUNNERY);
    c.fire = horizontal < s.fireRange && pilot.noseAngleTo(aimScratch) < s.fireConeDeg * DEG && pilot.guns.ammo > 0;
    if (horizontal < s.pullUpDistance || height < s.pullUpHeight) {
      bb.strafe = 'recover';
      bb.strafeTimer = 0;
    }
    return running(pilot, 'strafing');
  }
  bb.strafeTimer += dt;
  pilot.steerHeading(pilot.track(), 20 * DEG, GUNNERY);
  if (bb.strafeTimer > s.recoverSeconds) bb.strafe = 'setup';
  return running(pilot, 'climbing away');
}

/** No enemy near and nothing to take: fly towards the middle of the map at cruise height, circling there. */
function patrol({ pilot }: Context): Status {
  const p = pilot.state.position;
  pilot.controls.throttle = 0.8;
  if (Math.hypot(p.x, p.z) > 900) pilot.flyTo(0, AI_CONFIG.cruiseHeight, 0);
  else pilot.steerHeading(pilot.track() + 25 * DEG, Math.atan2(AI_CONFIG.cruiseHeight - p.y, 600));
  return running(pilot, 'patrolling');
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Red's (or Blue's) AI squadron, as AI_CONFIG lists it: alternating hunters and raiders, launching one after another. */
export function createSquadron(team: Team, firstId: number, specs: Readonly<Record<string, AircraftClassSpec>>): AiPilot[] {
  return AI_CONFIG.squadrons[team].map((classId, i) => {
    const spec = specs[classId];
    if (!spec) throw new Error(`No aircraft class ${classId}`);
    return new AiPilot(firstId + i, team, spec, i % 2 === 0 ? 'hunter' : 'raider', 1 + i * AI_CONFIG.launchInterval);
  });
}

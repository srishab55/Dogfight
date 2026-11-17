import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Axis } from '@babylonjs/core/Maths/math.axis';
import {
  BASES,
  CARRIERS,
  CombatWorld,
  RUNWAYS,
  createCarrierStatuses,
  createTargets,
  friendlyBaseAt,
  GUN_SPECS,
  SIMULATION_CONFIG,
  createGunState,
  createServiceStatus,
  createTerrain,
  createWorldGround,
  fullAmmo,
  groundClearance,
  stepService,
  steerTowards,
  type AircraftClassId,
  type CarrierStatusMap,
  type CombatEvent,
  type GroundQuery,
  type GunState,
  type ServiceEvent,
  type StickInputs,
  type Team,
} from '@dogfight/shared';
import { PlayerAircraft } from '../aircraft/PlayerAircraft';
import { CameraManager } from '../camera/CameraManager';
import { AudioSystem } from '../audio/AudioSystem';
import { AUDIO_CONFIG } from '../config/audio';
import { EnemyTargets } from '../combat/EnemyTargets';
import { ImpactEffects } from '../combat/ImpactEffects';
import { BURN_CONFIG, DEFENCE_VISUAL_CONFIG } from '../config/combatVisuals';
import { FireAndSmoke } from '../effects/FireAndSmoke';
import { TargetBalloons } from '../combat/TargetBalloons';
import { TracerRenderer } from '../combat/TracerRenderer';
import { KEY_BINDINGS, MOUSE_FLIGHT_CONFIG } from '../config/controls';
import { MouseFlight } from '../input/MouseFlight';
import { RENDER_CONFIG } from '../config/graphics';
import { FLIGHT_PATH_MARKER_MIN_SPEED, LANDING_PRACTICE } from '../config/landing';
import { FlightInputController } from '../input/FlightInputController';
import { InputManager } from '../input/InputManager';
import { applyPixelRatio, createEngine } from '../rendering/createEngine';
import { createPostProcessing } from '../rendering/postProcessing';
import { createControlsHint } from '../ui/ControlsHint';
import { DebugOverlay, type DebugLine } from '../ui/DebugOverlay';
import { FlightHud, PULL_UP_SECONDS, type ApproachGuide, type HudFrame, type ScreenPoint } from '../ui/FlightHud';
import { createGameTitle } from '../ui/GameTitle';
import { Environment } from '../world/Environment';
import { FixedTimestepLoop } from './FixedTimestepLoop';

const DEFAULT_AIRCRAFT: AircraftClassId = 'fighterBomber';
/** The local player's team until team selection arrives (Phase 6). */
const PLAYER_TEAM: Team = 'blue';
/** Aircraft selection keys, in order. */
const CLASS_KEYS = [
  ['selectInterceptor', 'interceptor'],
  ['selectFighterBomber', 'fighterBomber'],
  ['selectHeavyBomber', 'heavyBomber'],
  ['selectNavalFighter', 'navalFighter'],
  ['selectDiveBomber', 'diveBomber'],
] as const;
/** Height of the air start above the home base (m). */
const AIR_START_HEIGHT = 800;
const RAD_TO_DEG = 180 / Math.PI;
/** Identifies the local player's rounds in combat events. Phase 5 uses the server's player ids. */
const PLAYER_ID = 1;

/**
 * Top-level owner of the client. Creates every subsystem, runs each frame in
 * a fixed order, and tears everything down on dispose.
 *
 * Each frame:
 *   1. discrete actions (camera, respawn, aircraft select, flaps)
 *   2. physics: zero or more fixed 1/60 s steps, each sampling the controls,
 *      then stepping the flight model and the combat world (guns, rounds, targets)
 *   3. combat events (impacts, hits) become effects and HUD feedback
 *   4. visuals: blend the last two physics states for smooth motion
 *   5. cameras, shadows, tracers and effects follow
 *   6. render, then HUD and debug overlay
 */
export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  /** Everything the aircraft can touch: terrain, sea and carriers. */
  private readonly ground: GroundQuery;
  private readonly environment: Environment;
  private readonly aircraft: PlayerAircraft;
  private readonly cameras: CameraManager;
  private readonly input: InputManager;
  private readonly flightInput: FlightInputController;
  private readonly loop: FixedTimestepLoop;
  private readonly hud: FlightHud;
  private readonly debugOverlay: DebugOverlay;
  private readonly controlsHint: HTMLElement;
  private readonly combat: CombatWorld;
  private readonly playerGuns: GunState;
  private readonly service = createServiceStatus();
  /** The most recent service event in this frame's physics steps, for the HUD. */
  private serviceEvent: ServiceEvent = null;
  /** The "on the catapult" briefing is showing; it clears once the aircraft launches. */
  private catapultBriefing = false;
  private readonly tracers: TracerRenderer;
  private readonly effects: ImpactEffects;
  private readonly balloons: TargetBalloons;
  /** How far each carrier has sunk: shared by the physics ground, the combat world and the carrier models. */
  private readonly carrierStatuses: CarrierStatusMap;
  private readonly fireAndSmoke: FireAndSmoke;
  private readonly enemyTargets: EnemyTargets;
  private targetsDestroyed = 0;
  /** Camera shake from being hit (m), decaying. */
  private impactShake = 0;
  /** Smoke puffs owed to the player's damage trail (fractions carry between frames). */
  private smokeCarry = 0;
  private wasCrashed = false;
  private wasCrashedForAudio = false;
  /** A burning crash site, if the player has just crashed. */
  private crashFire: { x: number; y: number; z: number; seconds: number } | null = null;
  /** When the carrier-hull message was last shown (s), so strafing doesn't flood the HUD. */
  private lastCarrierReport = -Infinity;
  private clock = 0;
  private readonly audio = new AudioSystem();
  /** Last frame's values, to notice events the flight model doesn't announce (touchdown, wire caught, catapult fired). */
  private lastRoundsFired = 0;
  private lastTouchdowns = 0;
  private lastHookEngaged = false;
  private lastBarrier = false;
  private lastCatapult: 'none' | 'held' | 'launching' = 'none';
  private readonly listenerForward = new Vector3();
  private readonly listenerUp = new Vector3();
  private readonly mouseFlight: MouseFlight;
  private readonly mouseSticks: StickInputs = { pitch: 0, roll: 0, yaw: 0 };
  private readonly aimDirection = new Vector3(0, 0, 1);
  // Scratch vectors for screen projections.
  private readonly worldPoint = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly toPoint = new Vector3();
  private readonly projected = new Vector3();
  private readonly wheelHeightPoint = new Vector3();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = createEngine(canvas);
    this.scene = new Scene(this.engine);
    // Nothing uses mouse picking yet; skip the raycast Babylon would otherwise do on every mouse move.
    this.scene.skipPointerMovePicking = true;

    // The same terrain, sea and carriers the flight model collides with; the environment draws them.
    const terrain = createTerrain();
    this.carrierStatuses = createCarrierStatuses();
    this.ground = createWorldGround(terrain, CARRIERS, RUNWAYS, this.carrierStatuses);
    this.environment = new Environment(this.scene, terrain, this.carrierStatuses);

    this.aircraft = new PlayerAircraft(this.scene, this.ground, PLAYER_TEAM, DEFAULT_AIRCRAFT);
    this.environment.addShadowCasters(this.aircraft.allMeshes);
    this.playerGuns = createGunState(this.aircraft.spec);

    this.combat = new CombatWorld(this.ground, createTargets(), this.carrierStatuses);
    this.tracers = new TracerRenderer(this.scene, this.combat.projectiles);
    this.effects = new ImpactEffects(this.scene);
    this.balloons = new TargetBalloons(this.scene, this.combat.targets);
    this.fireAndSmoke = new FireAndSmoke(this.scene);
    this.enemyTargets = new EnemyTargets(this.scene, this.combat, this.fireAndSmoke, this.carrierStatuses);
    this.environment.addShadowCasters(this.enemyTargets.shadowCasters);

    this.cameras = new CameraManager(this.scene, this.ground);
    createPostProcessing(this.scene, this.cameras.allCameras());
    this.input = new InputManager(window, KEY_BINDINGS);
    this.flightInput = new FlightInputController(this.input);
    this.mouseFlight = new MouseFlight(canvas);
    this.mouseFlight.onChange = this.handleMouseFlightChange;
    this.loop = new FixedTimestepLoop(1 / SIMULATION_CONFIG.physicsHz, SIMULATION_CONFIG.maxStepsPerFrame);

    this.hud = new FlightHud(uiRoot);
    this.debugOverlay = new DebugOverlay(uiRoot, this.engine, this.scene, import.meta.env.DEV);
    this.controlsHint = createControlsHint(uiRoot, KEY_BINDINGS);
    createGameTitle(uiRoot);
    this.afterTeleport(0);
    this.briefSpawn();
  }

  start(): void {
    window.addEventListener('resize', this.handleResize);
    this.engine.runRenderLoop(this.frame);
  }

  dispose(): void {
    this.engine.stopRenderLoop(this.frame);
    window.removeEventListener('resize', this.handleResize);
    this.input.dispose();
    this.audio.dispose();
    this.mouseFlight.dispose();
    this.hud.dispose();
    this.debugOverlay.dispose();
    this.controlsHint.remove();
    this.cameras.dispose();
    this.tracers.dispose();
    this.effects.dispose();
    this.environment.dispose();
    this.aircraft.visual.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private readonly frame = (): void => {
    const deltaSeconds = Math.min(this.engine.getDeltaTime() / 1000, RENDER_CONFIG.maxFrameDeltaSeconds);
    this.clock += deltaSeconds;

    this.handleActions();

    const mouseFlying = this.isMouseFlying();
    const alpha = this.loop.advance(deltaSeconds, (dt) => {
      // Mouse flight: the direction pilot turns the aim into stick positions;
      // any flight key held overrides it on that axis.
      let assist: StickInputs | null = null;
      if (mouseFlying) {
        this.mouseFlight.aimDirection(this.aimDirection);
        assist = steerTowards(this.aircraft.state, this.aircraft.spec, this.aimDirection, this.mouseSticks);
      }
      const controls = this.flightInput.update(dt, assist);
      this.aircraft.step(controls, dt);
      const { state, spec } = this.aircraft;
      this.combat.step(dt, [{ id: PLAYER_ID, team: PLAYER_TEAM, state, spec, guns: this.playerGuns, trigger: controls.fire }]);
      this.serviceEvent = stepService(this.service, state, spec, this.playerGuns, PLAYER_TEAM, dt) ?? this.serviceEvent;
    });
    this.handleCombatEvents();
    this.handleServiceEvent();
    if (this.catapultBriefing && this.aircraft.state.catapult !== 'held') {
      this.catapultBriefing = false;
      this.hud.clearMessage();
    }
    this.aircraft.updateVisual(alpha, deltaSeconds, this.flightInput.controls);

    const { renderPosition, renderOrientation } = this.aircraft;
    if (mouseFlying) this.mouseFlight.aimDirection(this.aimDirection);
    const t = this.aircraft.state.telemetry;
    this.cameras.update(deltaSeconds, renderPosition, renderOrientation, mouseFlying ? this.aimDirection : null, {
      speed: t.airspeed,
      buffet: this.aircraft.state.flowSeparation,
      firing: this.playerGuns.firing,
      loadFactor: t.loadFactor,
      impact: this.impactShake,
    });
    this.impactShake *= Math.exp(-6 * deltaSeconds);
    // The glide slope (and so the PAPI) is defined for the wheels, not the centre of mass.
    this.wheelHeightPoint.copyFrom(renderPosition).y -= groundClearance(this.aircraft.spec);
    this.environment.update(deltaSeconds, renderPosition, this.wheelHeightPoint, this.scene.activeCamera?.globalPosition ?? renderPosition);
    if (this.scene.activeCamera) this.tracers.update(this.scene.activeCamera.globalPosition);
    this.effects.update(deltaSeconds);
    this.balloons.update(deltaSeconds);
    this.enemyTargets.update(deltaSeconds);
    this.updateAircraftFire(deltaSeconds);
    this.fireAndSmoke.update(deltaSeconds, this.scene.activeCamera?.globalPosition ?? renderPosition);
    this.updateAudio(deltaSeconds);

    this.scene.render();

    const state = this.aircraft.state;
    const heightAboveGround = state.position.y - this.ground.heightAt(state.position.x, state.position.z) - groundClearance(this.aircraft.spec);
    this.hud.update(deltaSeconds, {
      state,
      controls: this.flightInput.controls,
      spec: this.aircraft.spec,
      heightAboveGround,
      flapNotchName: this.flightInput.flapNotchName,
      flightPathMarker: this.projectFlightPath(),
      gunsight: this.projectGunsight(),
      aimReticle: mouseFlying ? this.projectAim() : null,
      guns: this.playerGuns,
      fullAmmo: fullAmmo(this.aircraft.spec),
      serviceProgress: this.service.base ? this.service.progress : null,
      nearestBase: this.nearestBase(),
      approach: this.approachGuide(),
      targetsDestroyed: this.targetsDestroyed,
    });
    this.debugOverlay.update(deltaSeconds, this.debugLines);
    this.input.endFrame();
  };

  /** Turns this frame's combat events into effects and HUD feedback. */
  private handleCombatEvents(): void {
    for (const event of this.combat.drainEvents()) this.handleCombatEvent(event);
  }

  private handleCombatEvent(event: CombatEvent): void {
    this.soundFor(event);
    switch (event.type) {
      case 'groundImpact':
        this.effects.spawn(this.ground.surfaceAt(event.x, event.z) === 'water' ? 'splash' : 'dust', event.x, event.y, event.z);
        return;
      case 'aaFired':
        // Muzzle flash at the gun.
        this.effects.spawn('spark', event.x, event.y, event.z);
        return;
      case 'targetRespawned':
        return;
      case 'aircraftHit':
        this.effects.spawn('spark', event.x, event.y, event.z);
        if (event.victim === PLAYER_ID) {
          this.hud.registerDamage(DEFENCE_VISUAL_CONFIG.hitFlashSeconds);
          this.impactShake = Math.max(this.impactShake, DEFENCE_VISUAL_CONFIG.hitShake);
        }
        return;
      case 'aircraftShotDown':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 1);
        if (event.victim === PLAYER_ID) this.hud.showMessage('SHOT DOWN · you are going down', 'bad', 4);
        return;
      case 'targetHit':
        this.effects.spawn('spark', event.x, event.y, event.z);
        if (event.kind === 'balloon') this.balloons.flash(event.targetId);
        if (event.owner === PLAYER_ID) {
          this.hud.registerHit();
          if (event.kind === 'carrier') this.reportCarrierHull(event.targetId);
        }
        return;
      case 'targetDestroyed':
        this.targetDestroyed(event);
    }
  }

  private targetDestroyed(event: Extract<CombatEvent, { type: 'targetDestroyed' }>): void {
    const byPlayer = event.owner === PLAYER_ID;
    if (byPlayer) this.targetsDestroyed++;
    switch (event.kind) {
      case 'balloon':
        this.effects.spawn('burst', event.x, event.y, event.z);
        this.effects.spawn('shreds', event.x, event.y, event.z);
        return;
      case 'aaGun':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 1.2);
        if (byPlayer) this.hud.showMessage('AA GUN DESTROYED', 'good', 2.5);
        return;
      case 'parkedAircraft':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 2);
        if (byPlayer) this.hud.showMessage('PARKED AIRCRAFT DESTROYED', 'good', 2.5);
        return;
      case 'carrier':
        this.fireAndSmoke.explosion(event.x, event.y + 6, event.z, 5);
        this.hud.showMessage(byPlayer ? 'RED CARRIER DESTROYED · she is going down!' : 'RED CARRIER DESTROYED', 'good', 6);
    }
  }

  /** The sound of a combat event, from where it happened. */
  private soundFor(event: CombatEvent): void {
    const ear = this.scene.activeCamera?.globalPosition ?? this.aircraft.renderPosition;
    const a = AUDIO_CONFIG;
    switch (event.type) {
      case 'aaFired':
        this.audio.playAt('cannon', event, ear, a.aaVolume, 0.94 + Math.random() * 0.12);
        return;
      case 'aircraftHit':
        if (event.victim === PLAYER_ID) this.audio.play('clank', a.hitVolume, 0.9 + Math.random() * 0.25);
        return;
      case 'aircraftShotDown':
        this.audio.playAt('explosion', event, ear, a.explosionVolume * 0.7, 1.1);
        return;
      case 'targetDestroyed': {
        const size = { balloon: 0, aaGun: 1, parkedAircraft: 1.4, carrier: 2.5 }[event.kind];
        if (size === 0) this.audio.playAt('cannon', event, ear, 0.35, 1.8);
        else this.audio.playAt('explosion', event, ear, a.explosionVolume * Math.min(1, 0.6 + 0.2 * size), 1.15 / Math.sqrt(size));
        return;
      }
      default:
    }
  }

  /** Engine, wind, warnings and the listener every frame; plus the aircraft's own one-off sounds. */
  private updateAudio(deltaSeconds: number): void {
    const camera = this.scene.activeCamera;
    const { state, spec } = this.aircraft;
    const ear = camera?.globalPosition ?? this.aircraft.renderPosition;
    if (camera) {
      camera.getDirectionToRef(Axis.Z, this.listenerForward);
      camera.getDirectionToRef(Axis.Y, this.listenerUp);
    }
    const sinking = -state.velocity.y;
    const height = state.position.y - this.ground.heightAt(state.position.x, state.position.z) - groundClearance(spec);
    this.audio.update(deltaSeconds, {
      listenerPosition: ear,
      listenerForward: this.listenerForward,
      listenerUp: this.listenerUp,
      airframe: spec.airframe.id,
      engineSpeed: state.shotDown ? this.aircraft.visual.propellerSpeed * 0.3 : this.aircraft.visual.propellerSpeed,
      throttle: state.throttle,
      airspeed: state.telemetry.airspeed,
      stallWarning: state.telemetry.stallWarning,
      pullUp: !state.onGround && !state.crashed && sinking > 5 && height / sinking < PULL_UP_SECONDS,
      silent: state.crashed,
    });

    const fired = this.playerGuns.roundsFired - this.lastRoundsFired;
    this.lastRoundsFired = this.playerGuns.roundsFired;
    if (fired > 0) this.audio.gunfire(fired);
    else if (this.flightInput.controls.fire && this.playerGuns.ammo === 0 && !state.crashed) this.audio.dryFire();

    if (state.touchdownCount > this.lastTouchdowns && !state.crashed) {
      const firmness = Math.min(1, state.lastTouchdownSinkRate / 4);
      this.audio.play('thud', AUDIO_CONFIG.touchdownVolume * (0.4 + 0.6 * firmness));
      this.audio.play('chirp', AUDIO_CONFIG.touchdownVolume * 0.6);
    }
    this.lastTouchdowns = state.touchdownCount;
    if (state.hookEngaged && !this.lastHookEngaged) this.audio.play('cable', 0.6);
    this.lastHookEngaged = state.hookEngaged;
    if (state.barrierEngaged && !this.lastBarrier) {
      this.audio.play('cable', 0.7, 0.8);
      this.audio.play('clank', 0.6, 0.7);
      this.hud.showMessage('MISSED THE WIRES · caught by the crash barrier (some damage)', 'ok', 4);
    }
    this.lastBarrier = state.barrierEngaged;
    if (state.catapult === 'launching' && this.lastCatapult === 'held') this.audio.play('whoosh', 0.7);
    this.lastCatapult = state.catapult;
    if (state.crashed && !this.wasCrashedForAudio) this.audio.play('explosion', AUDIO_CONFIG.explosionVolume, state.crashReason?.includes('sea') ? 1.4 : 1);
    this.wasCrashedForAudio = state.crashed;
  }

  /** While strafing the carrier, report its hull every couple of seconds. */
  private reportCarrierHull(targetId: number): void {
    if (this.clock - this.lastCarrierReport < 2) return;
    const carrier = this.combat.targets[targetId];
    if (!carrier || carrier.health <= 0) return;
    this.lastCarrierReport = this.clock;
    this.hud.showMessage(`RED CARRIER HULL ${Math.ceil((100 * carrier.health) / carrier.maxHealth)}%`, 'ok', 1.8);
  }

  /**
   * The player's aircraft: a smoke trail when damaged (grey, then black with
   * flames), burning as it falls when shot down, and an explosion and a fire
   * where it crashes.
   */
  private updateAircraftFire(deltaSeconds: number): void {
    const { state, spec, renderPosition: p } = this.aircraft;
    if (state.crashed && !this.wasCrashed) {
      const scale = state.shotDown || state.crashReason !== 'ditched in the sea' ? 2.5 : 1;
      this.fireAndSmoke.explosion(p.x, p.y, p.z, scale);
      this.crashFire = state.crashReason?.includes('sea') ? null : { x: p.x, y: p.y, z: p.z, seconds: 25 };
    }
    this.wasCrashed = state.crashed;
    if (this.crashFire) {
      const fire = this.crashFire;
      fire.seconds -= deltaSeconds;
      if (fire.seconds <= 0 || !state.crashed) this.crashFire = null;
      else this.emitTrail(fire.x, fire.y, fire.z, 1, true, deltaSeconds, 1.6);
    }
    if (state.crashed) return;
    const hull = state.hullHealth / spec.combat.maxHullHealth;
    if (!state.shotDown && hull >= BURN_CONFIG.aircraftSmokeBelow) return;
    const burning = state.shotDown || hull < BURN_CONFIG.aircraftFireBelow;
    this.emitTrail(p.x, p.y, p.z, burning ? 1 : 0.15, burning, deltaSeconds, 0.6);
  }

  private emitTrail(x: number, y: number, z: number, darkness: number, flames: boolean, deltaSeconds: number, scale: number): void {
    this.smokeCarry += BURN_CONFIG.aircraftSmokePerSecond * deltaSeconds;
    while (this.smokeCarry >= 1) {
      this.smokeCarry -= 1;
      this.fireAndSmoke.smokePuff(x, y, z, darkness, scale, 4);
      if (flames) this.fireAndSmoke.flame(x, y, z, scale);
    }
  }

  /** Tells the player when the ground crew starts, gives up, or finishes. */
  private handleServiceEvent(): void {
    const event = this.serviceEvent;
    this.serviceEvent = null;
    if (event === 'completed') this.hud.showMessage(`REARMED & REPAIRED · ${fullAmmo(this.aircraft.spec)} rounds`, 'good', 4);
    else if (event === 'interrupted') this.hud.showMessage('SERVICE INTERRUPTED · stop and idle on a friendly base to rearm', 'ok', 3);
  }

  /** Distance and compass bearing from the aircraft to the nearest friendly base. */
  private nearestBase(): HudFrame['nearestBase'] {
    const p = this.aircraft.state.position;
    const here = friendlyBaseAt(PLAYER_TEAM, p.x, p.z);
    if (here) return { kind: here.kind, distance: 0, bearingDeg: 0 };
    let best: HudFrame['nearestBase'] = null;
    for (const base of BASES) {
      if (base.team !== PLAYER_TEAM) continue;
      const dx = base.runway.center.x - p.x;
      const dz = base.runway.center.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (best && distance >= best.distance) continue;
      best = { kind: base.kind, distance, bearingDeg: ((Math.atan2(dx, dz) * RAD_TO_DEG) % 360 + 360) % 360 };
    }
    return best;
  }

  /**
   * Final-approach guidance to the friendly base the aircraft is lined up
   * on: shown with landing flaps down, in the air, from 4 km to the aim
   * point, within 25 degrees of the centreline. The aim point and glide
   * slope are the same as landing practice's, which the approach lights mark.
   */
  private approachGuide(): ApproachGuide | null {
    const { state, spec } = this.aircraft;
    if (state.onGround || state.crashed || state.shotDown || state.flapPosition < 0.6) return null;
    const wheelsY = state.position.y - groundClearance(spec);
    let best: ApproachGuide | null = null;
    for (const base of BASES) {
      if (base.team !== PLAYER_TEAM) continue;
      const runway = base.runway;
      const aimPast = base.kind === 'carrier' ? LANDING_PRACTICE.carrier.aimPointPastThreshold : LANDING_PRACTICE.airfield.aimPointPastThreshold;
      const h = (runway.headingDegrees * Math.PI) / 180;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const fromCentre = -runway.length / 2 + aimPast;
      const ax = runway.center.x + fx * fromCentre;
      const az = runway.center.z + fz * fromCentre;
      const dx = state.position.x - ax;
      const dz = state.position.z - az;
      const toGo = -(dx * fx + dz * fz); // distance before the aim point, along the approach
      const across = dx * fz - dz * fx; // right of the centreline
      if (toGo < 20 || toGo > 4_000) continue;
      const lineupDeg = (Math.atan2(across, toGo) * 180) / Math.PI;
      if (Math.abs(lineupDeg) > 25 || (best && best.distance < toGo)) continue;
      const glideDeg = (Math.atan2(wheelsY - runway.center.y, toGo) * 180) / Math.PI;
      best = { kind: base.kind, distance: toGo, glideDeviationDeg: glideDeg - LANDING_PRACTICE.glideSlopeDeg, lineupDeg };
    }
    return best;
  }

  /** One line on how to get going from where the aircraft has just spawned. */
  private briefSpawn(): void {
    const { state, spec } = this.aircraft;
    this.catapultBriefing = state.catapult === 'held';
    if (this.catapultBriefing) this.hud.showMessage(`${spec.displayName.toUpperCase()} ON THE CATAPULT · full throttle (↑) to launch`, 'good', 8);
    else this.hud.showMessage(`${spec.displayName.toUpperCase()} · ${this.aircraft.homeBase.name.toUpperCase()} · throttle up (↑) to take off`, 'good', 4);
  }

  /** Where the aircraft is flying: 1 km along its velocity, on screen. */
  private projectFlightPath(): ScreenPoint | null {
    const velocity = this.aircraft.state.velocity;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < FLIGHT_PATH_MARKER_MIN_SPEED) return null;
    this.worldPoint.set(velocity.x, velocity.y, velocity.z).scaleInPlace(1000 / speed).addInPlace(this.aircraft.renderPosition);
    return this.projectToScreen(this.worldPoint);
  }

  /** Where the mouse is aiming, on screen. */
  private projectAim(): ScreenPoint | null {
    this.aimDirection.scaleToRef(MOUSE_FLIGHT_CONFIG.aimDistance, this.worldPoint).addInPlace(this.aircraft.renderPosition);
    return this.projectToScreen(this.worldPoint);
  }

  private isMouseFlying(): boolean {
    return this.mouseFlight.active && this.cameras.mode !== 'orbit';
  }

  /** Mouse flight starting or stopping: start aiming along the nose, so nothing lurches; tell the player. */
  private readonly handleMouseFlightChange = (active: boolean): void => {
    if (active) this.aimAlongNose();
    this.hud.showMessage(
      active ? 'MOUSE FLIGHT · aim with the mouse · Esc releases' : 'MOUSE RELEASED · keyboard flight · click the view to fly with the mouse',
      'good',
      3,
    );
  };

  private aimAlongNose(): void {
    Vector3.Forward().rotateByQuaternionToRef(this.aircraft.renderOrientation, this.worldPoint);
    this.mouseFlight.aimAlong(this.worldPoint);
    this.mouseFlight.aimDirection(this.aimDirection);
    this.cameras.snapToTarget(this.aircraft.renderPosition, this.aircraft.renderOrientation, this.aimDirection);
  }

  /** Where the gun streams converge: the convergence distance straight ahead of the nose, on screen. */
  private projectGunsight(): ScreenPoint | null {
    const distance = GUN_SPECS[this.aircraft.spec.id].convergenceDistance;
    Vector3.Forward().rotateByQuaternionToRef(this.aircraft.renderOrientation, this.worldPoint);
    this.worldPoint.scaleInPlace(distance).addInPlace(this.aircraft.renderPosition);
    return this.projectToScreen(this.worldPoint);
  }

  /**
   * Screen position (CSS pixels) of a world point, using this frame's camera
   * view-projection, so call it after scene.render(). Null in orbit view, when
   * crashed, or when the point is behind the camera.
   */
  private projectToScreen(point: Vector3): ScreenPoint | null {
    const camera = this.scene.activeCamera;
    if (!camera || this.cameras.mode === 'orbit' || this.aircraft.state.crashed) return null;
    camera.getDirectionToRef(Axis.Z, this.cameraForward);
    point.subtractToRef(camera.globalPosition, this.toPoint);
    if (Vector3.Dot(this.toPoint, this.cameraForward) <= 0) return null;

    const renderWidth = this.engine.getRenderWidth();
    const viewport = camera.viewport.toGlobal(renderWidth, this.engine.getRenderHeight());
    Vector3.ProjectToRef(point, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), viewport, this.projected);
    // Render pixels to CSS pixels (they differ on high-DPI screens).
    const cssWidth = this.engine.getRenderingCanvasClientRect()?.width ?? renderWidth;
    const scale = cssWidth / renderWidth;
    return { x: this.projected.x * scale, y: this.projected.y * scale };
  }

  private handleActions(): void {
    const input = this.input;
    if (input.wasPressed('cycleCamera')) {
      this.cameras.cycleMode();
      this.aircraft.visual.setVisible(this.cameras.mode !== 'cockpit');
      // The orbit camera needs the mouse to drag; give the mouse back while orbiting.
      this.mouseFlight.captureAllowed = this.cameras.mode !== 'orbit';
      if (this.cameras.mode === 'orbit') this.mouseFlight.release();
    }
    if (input.wasPressed('toggleDebugOverlay')) this.debugOverlay.toggle();
    if (input.wasPressed('toggleMute')) this.hud.showMessage(this.audio.toggleMute() ? 'SOUND OFF (M)' : 'SOUND ON (M)', 'good', 1.5);
    if (input.wasPressed('toggleControlsHelp')) this.controlsHint.hidden = !this.controlsHint.hidden;
    for (const [action, factor] of [['mouseSensitivityUp', MOUSE_FLIGHT_CONFIG.sensitivityStep], ['mouseSensitivityDown', 1 / MOUSE_FLIGHT_CONFIG.sensitivityStep]] as const) {
      if (!input.wasPressed(action)) continue;
      const value = this.mouseFlight.adjustSensitivity(factor);
      this.hud.showMessage(`MOUSE SENSITIVITY ${value.toFixed(2)}°/px  ([ lower · ] higher)`, 'good', 2);
    }
    if (input.wasPressed('flapsDown')) this.flightInput.stepFlaps(1);
    if (input.wasPressed('flapsUp')) this.flightInput.stepFlaps(-1);

    if (input.wasPressed('toggleDiveBrakes')) {
      if (this.aircraft.spec.airbrake) this.hud.showMessage(this.flightInput.toggleAirbrake() ? 'DIVE BRAKES OUT' : 'DIVE BRAKES IN', 'good', 2);
      else this.hud.showMessage(`The ${this.aircraft.spec.displayName} has no dive brakes (the Dive Bomber does: 5)`, 'ok', 3);
    }

    const selected = CLASS_KEYS.find(([action]) => input.wasPressed(action))?.[1] ?? null;
    if (selected || input.wasPressed('respawn')) {
      this.aircraft.respawnAtBase(selected ?? undefined);
      this.afterTeleport(0);
      this.briefSpawn();
    } else if (input.wasPressed('airStart')) {
      this.aircraft.airStart(AIR_START_HEIGHT);
      this.afterTeleport(0.7);
    } else if (input.wasPressed('landingPractice')) {
      this.aircraft.approachStart();
      const { approachThrottle, handsOffApproachSpeed } = this.aircraft.performance;
      this.afterTeleport(approachThrottle, 1);
      const onCarrier = this.aircraft.homeBase.kind === 'carrier';
      this.hud.showMessage(
        onCarrier
          ? `CARRIER LANDING · ${(approachThrottle * 100).toFixed(0)}% throttle · ${(handsOffApproachSpeed * 3.6).toFixed(0)} km/h · hook down: touch down early, among the wires`
          : `LANDING PRACTICE · ${(approachThrottle * 100).toFixed(0)}% throttle · ${(handsOffApproachSpeed * 3.6).toFixed(0)} km/h · PAPI: 2 red, 2 white = on slope`,
        'good',
        LANDING_PRACTICE.briefingSeconds,
      );
    }
  }

  /** After the aircraft jumps somewhere new: reset controls and loop, and snap the cameras instead of sweeping across the map. */
  private afterTeleport(throttle: number, flaps = this.aircraft.state.flapPosition): void {
    this.flightInput.reset(throttle, flaps);
    // A fresh aircraft has cold guns and a full load of ammunition.
    Object.assign(this.playerGuns, createGunState(this.aircraft.spec));
    Object.assign(this.service, createServiceStatus());
    this.wasCrashed = this.aircraft.state.crashed;
    this.wasCrashedForAudio = this.aircraft.state.crashed;
    this.lastRoundsFired = this.playerGuns.roundsFired;
    this.lastTouchdowns = this.aircraft.state.touchdownCount;
    this.lastHookEngaged = this.aircraft.state.hookEngaged;
    this.lastBarrier = this.aircraft.state.barrierEngaged;
    this.lastCatapult = this.aircraft.state.catapult;
    this.loop.reset();
    this.cameras.setAircraft(this.aircraft.spec);
    this.cameras.snapToTarget(this.aircraft.renderPosition, this.aircraft.renderOrientation);
    if (this.mouseFlight.active) this.aimAlongNose();
  }

  private readonly debugLines = (): readonly DebugLine[] => {
    const t = this.aircraft.state.telemetry;
    return [
      ['Physics', `${this.loop.measuredStepsPerSecond.toFixed(0)} steps/s, ${this.loop.droppedFrames} dropped`],
      ['Camera', this.cameras.mode],
      ['AoA / slip', `${(t.angleOfAttack * RAD_TO_DEG).toFixed(1)}° / ${(t.sideslip * RAD_TO_DEG).toFixed(1)}°`],
      ['CL / CD', `${t.liftCoefficient.toFixed(2)} / ${t.dragCoefficient.toFixed(3)}`],
      ['Lift / weight', (t.lift / (this.aircraft.spec.mass * 9.81)).toFixed(2)],
      ['Thrust / drag', `${(t.thrust / 1000).toFixed(1)} / ${(t.drag / 1000).toFixed(1)} kN`],
      ['Separation', this.aircraft.state.flowSeparation.toFixed(2)],
      ['Rounds', `${this.combat.projectiles.activeCount} in flight, ${this.playerGuns.roundsFired} fired, ${this.playerGuns.ammo} left`],
      ['Sound', this.audio.started ? `${this.audio.isMuted ? 'muted' : 'on'}, level ${this.audio.level().toFixed(3)}` : 'waiting for a key press or click'],
      ['Stall speed', `${(this.aircraft.performance.stallSpeed * 3.6).toFixed(0)} km/h (1 g, sea level)`],
    ];
  };

  private readonly handleResize = (): void => {
    applyPixelRatio(this.engine);
    this.engine.resize();
  };
}

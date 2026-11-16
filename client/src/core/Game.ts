import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Axis } from '@babylonjs/core/Maths/math.axis';
import {
  CombatWorld,
  GUN_SPECS,
  HOME_RUNWAY,
  PRIMITIVE_GROUND_CLEARANCE,
  SIMULATION_CONFIG,
  createTerrain,
  createGunState,
  getRunwaySpawnPoint,
  steerTowards,
  type AircraftClassId,
  type Terrain,
  type GunState,
  type StickInputs,
} from '@dogfight/shared';
import { PlayerAircraft } from '../aircraft/PlayerAircraft';
import { CameraManager } from '../camera/CameraManager';
import { ImpactEffects } from '../combat/ImpactEffects';
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
import { FlightHud, type ScreenPoint } from '../ui/FlightHud';
import { Environment } from '../world/Environment';
import { FixedTimestepLoop } from './FixedTimestepLoop';

/** Distance from the start of the runway to the spawn point (m). */
const SPAWN_DISTANCE_FROM_THRESHOLD = 60;
const DEFAULT_AIRCRAFT: AircraftClassId = 'fighterBomber';
/** Height of the air start above the runway (m). */
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
  private readonly ground: Terrain;
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
  private readonly playerGuns: GunState = createGunState();
  private readonly tracers: TracerRenderer;
  private readonly effects: ImpactEffects;
  private readonly balloons: TargetBalloons;
  private targetsDestroyed = 0;
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

    // The same terrain the flight model collides with; the environment draws it.
    this.ground = createTerrain();
    this.environment = new Environment(this.scene, this.ground);

    const spawn = getRunwaySpawnPoint(HOME_RUNWAY, SPAWN_DISTANCE_FROM_THRESHOLD);
    this.aircraft = new PlayerAircraft(this.scene, this.ground, spawn, DEFAULT_AIRCRAFT);
    this.environment.addShadowCasters(this.aircraft.visual.meshes);

    this.combat = new CombatWorld(this.ground);
    this.tracers = new TracerRenderer(this.scene, this.combat.projectiles);
    this.effects = new ImpactEffects(this.scene);
    this.balloons = new TargetBalloons(this.scene, this.combat.targets);

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
    this.afterTeleport(0);
  }

  start(): void {
    window.addEventListener('resize', this.handleResize);
    this.engine.runRenderLoop(this.frame);
  }

  dispose(): void {
    this.engine.stopRenderLoop(this.frame);
    window.removeEventListener('resize', this.handleResize);
    this.input.dispose();
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
      this.combat.step(dt, [{ id: PLAYER_ID, state, spec, guns: this.playerGuns, trigger: controls.fire }]);
    });
    this.handleCombatEvents();
    this.aircraft.updateVisual(alpha, deltaSeconds, this.flightInput.controls);

    const { renderPosition, renderOrientation } = this.aircraft;
    if (mouseFlying) this.mouseFlight.aimDirection(this.aimDirection);
    const t = this.aircraft.state.telemetry;
    this.cameras.update(deltaSeconds, renderPosition, renderOrientation, mouseFlying ? this.aimDirection : null, {
      speed: t.airspeed,
      buffet: this.aircraft.state.flowSeparation,
      firing: this.playerGuns.firing,
      loadFactor: t.loadFactor,
    });
    // The glide slope (and so the PAPI) is defined for the wheels, not the centre of mass.
    this.wheelHeightPoint.copyFrom(renderPosition).y -= PRIMITIVE_GROUND_CLEARANCE * this.aircraft.spec.airframeScale;
    this.environment.update(renderPosition, this.wheelHeightPoint, this.scene.activeCamera?.globalPosition ?? renderPosition);
    if (this.scene.activeCamera) this.tracers.update(this.scene.activeCamera.globalPosition);
    this.effects.update(deltaSeconds);
    this.balloons.update(deltaSeconds);

    this.scene.render();

    const state = this.aircraft.state;
    const heightAboveGround = state.position.y - this.ground.heightAt(state.position.x, state.position.z) - PRIMITIVE_GROUND_CLEARANCE * this.aircraft.spec.airframeScale;
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
      targetsDestroyed: this.targetsDestroyed,
    });
    this.debugOverlay.update(deltaSeconds, this.debugLines);
    this.input.endFrame();
  };

  /** Turns this frame's combat events into effects and HUD feedback. */
  private handleCombatEvents(): void {
    for (const event of this.combat.drainEvents()) {
      if (event.type === 'groundImpact') {
        this.effects.spawn('dust', event.x, event.y, event.z);
        continue;
      }
      this.effects.spawn('spark', event.x, event.y, event.z);
      this.balloons.flash(event.targetId);
      if (event.owner === PLAYER_ID) this.hud.registerHit();
      if (event.type === 'targetDestroyed') {
        this.effects.spawn('burst', event.x, event.y, event.z);
        this.effects.spawn('shreds', event.x, event.y, event.z);
        if (event.owner === PLAYER_ID) this.targetsDestroyed++;
      }
    }
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
    if (input.wasPressed('toggleControlsHelp')) this.controlsHint.hidden = !this.controlsHint.hidden;
    for (const [action, factor] of [['mouseSensitivityUp', MOUSE_FLIGHT_CONFIG.sensitivityStep], ['mouseSensitivityDown', 1 / MOUSE_FLIGHT_CONFIG.sensitivityStep]] as const) {
      if (!input.wasPressed(action)) continue;
      const value = this.mouseFlight.adjustSensitivity(factor);
      this.hud.showMessage(`MOUSE SENSITIVITY ${value.toFixed(2)}°/px  ([ lower · ] higher)`, 'good', 2);
    }
    if (input.wasPressed('flapsDown')) this.flightInput.stepFlaps(1);
    if (input.wasPressed('flapsUp')) this.flightInput.stepFlaps(-1);

    const selected: AircraftClassId | null = input.wasPressed('selectInterceptor')
      ? 'interceptor'
      : input.wasPressed('selectFighterBomber')
        ? 'fighterBomber'
        : input.wasPressed('selectHeavyBomber')
          ? 'heavyBomber'
          : null;
    if (selected || input.wasPressed('respawn')) {
      this.aircraft.respawnOnRunway(selected ?? undefined);
      this.afterTeleport(0);
    } else if (input.wasPressed('airStart')) {
      this.aircraft.airStart(AIR_START_HEIGHT);
      this.afterTeleport(0.7);
    } else if (input.wasPressed('landingPractice')) {
      this.aircraft.approachStart();
      const { approachThrottle, handsOffApproachSpeed } = this.aircraft.performance;
      this.afterTeleport(approachThrottle, 1);
      this.hud.showMessage(
        `LANDING PRACTICE · ${(approachThrottle * 100).toFixed(0)}% throttle · ${(handsOffApproachSpeed * 3.6).toFixed(0)} km/h · PAPI: 2 red, 2 white = on slope`,
        'good',
        LANDING_PRACTICE.briefingSeconds,
      );
    }
  }

  /** After the aircraft jumps somewhere new: reset controls and loop, and snap the cameras instead of sweeping across the map. */
  private afterTeleport(throttle: number, flaps = 0): void {
    this.flightInput.reset(throttle, flaps);
    // A fresh aircraft has cold guns.
    Object.assign(this.playerGuns, createGunState());
    this.loop.reset();
    this.cameras.setTargetScale(this.aircraft.spec.airframeScale);
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
      ['Rounds', `${this.combat.projectiles.activeCount} in flight, ${this.playerGuns.roundsFired} fired`],
      ['Stall speed', `${(this.aircraft.performance.stallSpeed * 3.6).toFixed(0)} km/h (1 g, sea level)`],
    ];
  };

  private readonly handleResize = (): void => {
    applyPixelRatio(this.engine);
    this.engine.resize();
  };
}

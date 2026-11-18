import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Axis } from '@babylonjs/core/Maths/math.axis';
import {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_IDS,
  AUTO_LAND_CONFIG,
  BASES,
  BASE_DEFENCE_KINDS,
  CARRIERS,
  CombatWorld,
  PAVED_AREAS,
  AiForce,
  type AiPilot,
  createSquadron,
  createMatch,
  remainingSeconds,
  stepMatch,
  airStartBases,
  basesHeld,
  homeBase as teamHome,
  MATCH_CONFIG,
  type AiContact,
  type AiWorld,
  type MatchResult,
  type MatchState,
  createCarrierStatuses,
  createTargets,
  friendlyBaseAt,
  GUN_SPECS,
  SIMULATION_CONFIG,
  createGunState,
  createServiceStatus,
  createTerrain,
  createSteeringAssistMemory,
  createWorldGround,
  fullAmmo,
  steerWithTurnInput,
  groundClearance,
  stepService,
  steerTowards,
  startingBases,
  computePerformance,
  hasTailhook,
  autoLandCost,
  chooseAutoLandBase,
  leadDirection,
  roundsWouldHit,
  enlargeBlend,
  HIT_ASSIST_CONFIG,
  type AutoLandPreferences,
  neutralControls,
  planAutoLand,
  stepAutoLand,
  type AircraftClassId,
  type AutoLand,
  type BaseDefinition,
  type FlightControls,
  type CarrierStatusMap,
  type CombatEvent,
  type GroundQuery,
  type GunState,
  type ServiceEvent,
  type Shooter,
  type StickInputs,
  type Team,
} from '@dogfight/shared';
import { PlayerAircraft } from '../aircraft/PlayerAircraft';
import { AiAircraftViews } from '../aircraft/AiAircraftViews';
import { CameraManager } from '../camera/CameraManager';
import { AudioSystem } from '../audio/AudioSystem';
import { AUDIO_CONFIG } from '../config/audio';
import { BaseStructures } from '../combat/BaseStructures';
import { EnemyTargets } from '../combat/EnemyTargets';
import { ImpactEffects } from '../combat/ImpactEffects';
import { BURN_CONFIG, DEFENCE_VISUAL_CONFIG } from '../config/combatVisuals';
import { FireAndSmoke } from '../effects/FireAndSmoke';
import { TargetBalloons } from '../combat/TargetBalloons';
import { TracerRenderer } from '../combat/TracerRenderer';
import { MOUSE_FLIGHT_CONFIG, STEERING_CONFIG, type InputAction, type KeyBindings } from '../config/controls';
import { MouseFlight } from '../input/MouseFlight';
import { RENDER_CONFIG } from '../config/graphics';
import { AUTO_LAND_HUD, FLIGHT_PATH_MARKER_MIN_SPEED, LANDING_PRACTICE } from '../config/landing';
import { FlightInputController } from '../input/FlightInputController';
import { InputManager } from '../input/InputManager';
import { applyPixelRatio, createEngine } from '../rendering/createEngine';
import { createPostProcessing } from '../rendering/postProcessing';
import { formatKeyCode } from '../ui/ControlsHint';
import { Hangar, type HangarAircraft, type HangarEvents, type HangarMode, type HangarSelection, type RespawnReport, type StartMode, type SteeringMode } from '../ui/Hangar';
import { AIRCRAFT_CLASS_TAGS, AIRCRAFT_ROLES, HANGAR_STORAGE_KEY } from '../config/hangar';
import { UI_CONFIG } from '../config/ui';
import { MainMenu, cleanCallsign, type MainMenuEvents } from '../ui/MainMenu';
import { PauseMenu, type PauseMenuEvents } from '../ui/PauseMenu';
import { SettingsScreen, type SettingsEvents, type SettingsTab } from '../ui/SettingsScreen';
import { LobbyScreen } from '../ui/LobbyScreen';
import { ResultsScreen, formatDuration } from '../ui/ResultsScreen';
import { SessionStats } from './SessionStats';
import { TEXT_SCALES, effectiveBindings, loadSettings, saveSettings, type GameSettings } from './Settings';
import { GamepadInput } from '../input/GamepadInput';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { PAINT_SCHEMES } from '../config/aircraftVisuals';
import { DebugOverlay, type DebugLine } from '../ui/DebugOverlay';
import { FlightHud, PULL_UP_SECONDS, type ApproachGuide, type BaseLabel, type BaseStatus, type EnemyMarker, type HudFrame, type OffscreenMarker, type ScreenPoint } from '../ui/FlightHud';
import { MiniMap, reducedMotion, renderMapBackground, type MapFrame } from '../ui/MiniMap';
import type { BaseChoice } from '../ui/BaseMap';
import { describeBases, type BaseView } from '../combat/baseViews';
import { BEACON_CONFIG, baseColor } from '../config/map';
import { BaseBeacons } from '../world/BaseBeacons';
import { Environment } from '../world/Environment';
import { FixedTimestepLoop } from './FixedTimestepLoop';
import { FRAME_BUDGET_MS, FrameTimings } from './FrameTimings';
import { FEEDBACK_CONFIG, FEEDBACK_TIERS, type FeedbackTier } from '../config/feedback';

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
  ['selectTriplane', 'triplane'],
  ['selectBiplane', 'biplane'],
] as const;
/** Mouse aim is corrected for the rounds' drop out to this range (m). */
const DROP_COMPENSATION_RANGE = 1_500;
/** Height of the air start above the home base (m). */
const AIR_START_HEIGHT = 800;
const RAD_TO_DEG = 180 / Math.PI;
/** Identifies the local player's rounds in combat events. Phase 5 uses the server's player ids. */
const PLAYER_ID = 1;

/** The nose direction in the aircraft's frame (shared and never changed: Vector3.Forward() builds a new one each call). */
const FORWARD: Readonly<Vector3> = Vector3.Forward();
/** The AI pilots' ids in combat events (the player is 1; AA guns 10 000 and up). */
const AI_FIRST_ID = 100;
/** Auto-land keeps offering the same base until another is better by this much (m of its choice cost). */
const AUTO_LAND_OFFER_HYSTERESIS = 600;
/** The lead marker and on-target cue look for enemy aircraft out to this range (m). */
const GUNNERY_AID_RANGE = 1_200;
/** The lead dot moves to another enemy only when that one is this much nearer the nose (deg): it doesn't hop between two. */
const LEAD_SWITCH_MARGIN_DEG = 6;
/**
 * Off-screen arrows sit on an ellipse this fraction of the view's width and
 * height from its centre: lower below the centre, to clear the instruments and the prompt above them.
 */
const OFFSCREEN_ELLIPSE = { x: 0.42, up: 0.34, down: 0.24 } as const;
const NO_AIDS = { lead: null, onTarget: false } as const;

/** The screens over the game. Any of them pauses it (single player). */
type Screen = 'menu' | 'hangar' | 'pause' | 'settings' | 'lobby' | 'results';

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
  /** A gamepad, if one is plugged in: flies (alongside the keys and mouse) and drives the menus. */
  private readonly gamepad: GamepadInput;
  private readonly loop: FixedTimestepLoop;
  private readonly hud: FlightHud;
  private readonly debugOverlay: DebugOverlay;
  /** CPU time per subsystem, for the debug overlay (measure before optimising). */
  private readonly timings = new FrameTimings();
  /** This step's aircraft in the combat world: the player, then the AI (reused). */
  private readonly shooters: Shooter[] = [];
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
  private readonly baseStructures: BaseStructures;
  /** A column of light over every base, in its owner's colour. */
  private readonly beacons: BaseBeacons;
  /** The map (N). */
  private readonly miniMap: MiniMap;
  /** The screens. The hangar is aircraft selection and the respawn screen. */
  private readonly mainMenu: MainMenu;
  private readonly hangar: Hangar;
  private readonly pauseMenu: PauseMenu;
  private readonly settingsScreen: SettingsScreen;
  private readonly lobby: LobbyScreen;
  private readonly results: ResultsScreen;
  /** The screen showing, or null while flying. */
  private screen: Screen | null = null;
  private screenOpenedAt = -Infinity;
  /** Where the hangar's Back and the settings' Done go. */
  private hangarReturn: 'menu' | 'pause' | 'lobby' = 'menu';
  private settingsReturn: 'menu' | 'pause' = 'menu';
  /** What's chosen in the hangar (remembered between sessions). */
  private hangarSelection: HangarSelection = readHangarSelection();
  /** The hangar was opened from the pause menu during a flight: FLY starts a new one, Back returns to it. */
  private hangarResumable = false;
  /** The player's settings (Settings screen), remembered in this browser. */
  private settings: GameSettings = loadSettings();
  /** The keys in force: the defaults with the player's changes. */
  private bindings: KeyBindings = effectiveBindings(this.settings);
  private readonly pipeline: DefaultRenderingPipeline | null;
  private callsign = readCallsign();
  /** This session's figures, for the after-action report. */
  private stats = new SessionStats(PLAYER_ID, PLAYER_TEAM);
  /** Seconds in the air and targets destroyed at the start of this sortie, for the respawn screen. */
  private sortieSeconds = 0;
  private sortieKillsAtStart = 0;
  /** The Red AI pilots (shared behaviour trees) and their aircraft as drawn. A new match brings a new squadron. */
  private aiForce: AiForce;
  private readonly aiViews: AiAircraftViews;
  /** Every aircraft in the fight this step, as the AI sees them. */
  private readonly aiContacts: AiContact[] = [];
  /** Seconds of play this match: the AI's clock (cooldowns, aim wander). */
  private aiClock = 0;
  /** The match being played (null at the main menu), and how it ended once it has. */
  private match: MatchState | null = null;
  private matchResult: MatchResult | null = null;
  /** Match length chosen in the hangar (minutes), remembered. */
  private matchMinutes = readMatchMinutes();
  /** The aircraft type is fixed for the match once it starts; only the base can change. */
  private lockedClassId: AircraftClassId | null = null;
  /** Which hangar screen is open: FLY from 'select' starts a new match. */
  private hangarKind: HangarMode['kind'] = 'select';
  /** The aircraft just lost: when, and what to say on the respawn screen. Cleared by the next flight. */
  private lostAt: number | null = null;
  private lostReport: RespawnReport | null = null;
  /** The respawn screen has parked a fresh aircraft: Resume in the pause menu goes back to it. */
  private awaitingRespawn = false;
  /** Hit-stop: real seconds left of the world running slow (game feel, on your kills). */
  private hitStopLeft = 0;
  /** Recent damage you've done to each enemy aircraft, for the number beside its marker, and when it fades. */
  private readonly recentDamage = new Map<number, { amount: number; seconds: number }>();
  /** Where your last kill went down (its pilot id), for the kill marker, and for how much longer. */
  private killMarker: { pilotId: number; seconds: number; x: number; y: number; z: number } | null = null;
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
  /** Keyboard steering: "easy" (A/D turn, like a car) or "direct" (A/D roll). */
  private steering = readSteeringMode();
  private readonly steeringMemory = createSteeringAssistMemory();
  private readonly steeringSticks: StickInputs = { pitch: 0, roll: 0, yaw: 0 };
  private readonly aimDirection = new Vector3(0, 0, 1);
  // Scratch vectors for screen projections.
  private readonly worldPoint = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly cameraRight = new Vector3();
  /** The enemy the lead dot is for (kept while it stays ahead and in range). */
  private leadTargetId: number | null = null;
  private readonly cameraUp = new Vector3();
  /** Enemy aircraft off the screen this frame (filled with the markers). */
  private offscreen: OffscreenMarker[] = [];
  private readonly toPoint = new Vector3();
  private readonly projected = new Vector3();
  private readonly wheelHeightPoint = new Vector3();
  private readonly markerPoint = new Vector3();
  private readonly leadScratch = { x: 0, y: 0, z: 0 };
  /** The mouse aim, raised to allow for the rounds' drop: what the nose is actually pointed at. */
  private readonly gunAim = new Vector3();
  /** Auto-land (P): the autopilot flying a landing at `autoLandBase`, or null. */
  private autoLand: AutoLand | null = null;
  private autoLandBase: BaseDefinition | null = null;
  private readonly autoLandControls: FlightControls = neutralControls();
  /** Set during the physics steps, acted on after them: why auto-land should stop this frame. */
  private autoLandEnd: 'landed' | 'takenOver' | 'crashed' | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.engine = createEngine(canvas);
    this.scene = new Scene(this.engine);
    // Nothing uses mouse picking yet; skip the raycast Babylon would otherwise do on every mouse move.
    this.scene.skipPointerMovePicking = true;

    // The same terrain, sea and carriers the flight model collides with; the environment draws them.
    const terrain = createTerrain();
    this.carrierStatuses = createCarrierStatuses();
    this.ground = createWorldGround(terrain, CARRIERS, PAVED_AREAS, this.carrierStatuses);
    this.environment = new Environment(this.scene, terrain, this.carrierStatuses);

    this.aircraft = new PlayerAircraft(this.scene, this.ground, PLAYER_TEAM, this.hangarSelection.classId);
    this.environment.addShadowCasters(this.aircraft.allMeshes);
    this.playerGuns = createGunState(this.aircraft.spec);

    this.combat = new CombatWorld(this.ground, createTargets(), this.carrierStatuses);
    this.tracers = new TracerRenderer(this.scene, this.combat.projectiles);
    this.effects = new ImpactEffects(this.scene);
    this.balloons = new TargetBalloons(this.scene, this.combat.targets);
    this.fireAndSmoke = new FireAndSmoke(this.scene);
    this.enemyTargets = new EnemyTargets(this.scene, this.combat, this.fireAndSmoke, this.carrierStatuses);
    this.environment.addShadowCasters(this.enemyTargets.shadowCasters);
    this.baseStructures = new BaseStructures(this.scene, this.combat, this.fireAndSmoke);
    this.environment.addShadowCasters(this.baseStructures.shadowCasters);

    this.cameras = new CameraManager(this.scene, this.ground);
    this.pipeline = createPostProcessing(this.scene, this.cameras.allCameras());
    this.input = new InputManager(window, this.bindings);
    this.flightInput = new FlightInputController(this.input);
    this.gamepad = new GamepadInput(window, () => {
      if (this.screen === null) this.hud.showMessage('CONTROLLER CONNECTED · LEFT STICK FLIES · TRIGGERS THROTTLE · A FIRES', 'good', 4);
    });
    this.input.addSource(this.gamepad);
    this.flightInput.setAnalog(this.gamepad.analog);
    this.mouseFlight = new MouseFlight(canvas);
    this.mouseFlight.onChange = this.handleMouseFlightChange;
    // Esc while flying with the mouse lets go of it (the browser's rule): that opens the pause menu too.
    this.mouseFlight.onUserRelease = () => {
      if (this.screen === null) this.escapeFromFlight();
    };
    this.loop = new FixedTimestepLoop(1 / SIMULATION_CONFIG.physicsHz, SIMULATION_CONFIG.maxStepsPerFrame);

    this.hud = new FlightHud(uiRoot);
    this.debugOverlay = new DebugOverlay(uiRoot, this.engine, this.scene, import.meta.env.DEV);
    const mapBackground = renderMapBackground(terrain);
    this.miniMap = new MiniMap(uiRoot, mapBackground);
    this.hangar = new Hangar(uiRoot, mapBackground, this.hangarAircraftList(), PAINT_SCHEMES, this.hangarEvents);
    this.mainMenu = new MainMenu(uiRoot, this.mainMenuEvents);
    this.pauseMenu = new PauseMenu(uiRoot, this.pauseEvents);
    this.settingsScreen = new SettingsScreen(
      uiRoot,
      {
        minMouseSensitivity: MOUSE_FLIGHT_CONFIG.minSensitivity,
        maxMouseSensitivity: MOUSE_FLIGHT_CONFIG.maxSensitivity,
        defaultMouseSensitivity: MOUSE_FLIGHT_CONFIG.sensitivityDegPerPixel,
        defaultSteering: STEERING_CONFIG.defaultMode,
      },
      this.settingsEvents,
    );
    this.lobby = new LobbyScreen(uiRoot, { playOffline: () => this.openHangar('select', 'lobby'), back: () => this.openMainMenu() });
    this.results = new ResultsScreen(uiRoot, () => this.continueFromResults());
    this.beacons = new BaseBeacons(this.scene);
    this.aiViews = new AiAircraftViews(this.scene, this.fireAndSmoke, (meshes) => this.environment.addShadowCasters(meshes), (x, y, z) => {
      const ear = this.scene.activeCamera?.globalPosition ?? this.aircraft.renderPosition;
      this.audio.playAt('explosion', { x, y, z }, ear, AUDIO_CONFIG.explosionVolume, 1);
    }, this.ground);
    this.aiForce = this.newSquadron();
    this.applySettings();
    // Start at the main menu, the aircraft parked at the remembered base if it's still yours.
    const savedBase = BASES.find((b) => b.id === this.hangarSelection.baseId) ?? null;
    this.aircraft.setStartBase(savedBase);
    this.forgetLostStartBase();
    this.aircraft.respawnAtBase();
    this.afterTeleport(0);
    this.openMainMenu();
  }

  start(): void {
    window.addEventListener('resize', this.handleResize);
    this.engine.runRenderLoop(this.frame);
  }

  dispose(): void {
    this.engine.stopRenderLoop(this.frame);
    window.removeEventListener('resize', this.handleResize);
    this.input.dispose();
    this.gamepad.dispose();
    this.audio.dispose();
    this.mouseFlight.dispose();
    this.hud.dispose();
    this.debugOverlay.dispose();
    this.miniMap.dispose();
    this.hangar.dispose();
    this.settingsScreen.dispose();
    this.beacons.dispose();
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

    // The gamepad is polled (it has no events for its buttons): in flight it flies, with a screen open it drives the menu.
    this.gamepad.poll(deltaSeconds, this.screen !== null);
    this.handleActions();

    const mouseFlying = this.isMouseFlying();
    this.timings.begin();
    // Hit-stop: for a moment after a kill the world runs slow (the steps themselves are unchanged).
    const worldDelta = this.hitStopLeft > 0 ? deltaSeconds * FEEDBACK_CONFIG.hitStopTimeScale : deltaSeconds;
    this.hitStopLeft = Math.max(0, this.hitStopLeft - deltaSeconds);
    // Any screen pauses the game (single player; Phase 5's shared world won't stop).
    const alpha = this.screen !== null ? 1 : this.loop.advance(worldDelta, (dt) => {
      let controls: Readonly<FlightControls>;
      if (this.autoLand && this.autoLandEnd === null && !this.flightInput.flyingByHand()) {
        // Auto-land flies; touching any flight key takes over (handled after the steps).
        const phase = stepAutoLand(this.autoLand, this.aircraft.state, this.aircraft.spec, this.ground, this.autoLandControls, dt);
        controls = this.flightInput.autopilot(this.autoLandControls);
        if (phase === 'done') this.autoLandEnd = this.aircraft.state.crashed ? 'crashed' : 'landed';
      } else {
        if (this.autoLand) this.autoLandEnd ??= 'takenOver';
        controls = this.pilotControls(dt, mouseFlying);
      }
      this.aircraft.step(controls, dt);
      const { state, spec } = this.aircraft;
      // The AI pilots decide and fly with the same flight model, then everyone fights.
      this.aiViews.beforeStep();
      this.aiClock += dt;
      this.aiForce.fly(this.aiWorldFor(this.aiClock), dt);
      this.shooters.length = 0;
      // Your rounds count from a few metres off an enemy aircraft, and hit it at the size it's drawn (aim assists; the AI has neither).
      this.shooters.push({ id: PLAYER_ID, team: PLAYER_TEAM, state, spec, guns: this.playerGuns, trigger: controls.fire, nearMiss: HIT_ASSIST_CONFIG.nearMissMetres, enlargedTargets: true }, ...this.aiForce.shooters());
      this.combat.step(dt, this.shooters);
      this.serviceEvent = stepService(this.service, state, spec, this.playerGuns, PLAYER_TEAM, dt, this.combat.ownerOf) ?? this.serviceEvent;
      this.aiForce.service(this.combat.ownerOf, dt);
      if (this.match) this.matchResult ??= stepMatch(this.match, this.combat.bases, dt);
    });
    this.handleCombatEvents();
    this.handleServiceEvent();
    this.updateAutoLand();
    this.updateSortie(deltaSeconds);
    if (this.matchResult && this.screen === null) this.endMatch(this.matchResult);
    if (this.catapultBriefing && this.aircraft.state.catapult !== 'held') {
      this.catapultBriefing = false;
      this.hud.clearMessage();
    }
    this.timings.end('simulation');
    this.timings.begin();
    // World visuals run on world time, so a hit-stop freezes the explosion with the aircraft; the camera, HUD and sound stay real-time.
    this.aircraft.updateVisual(alpha, worldDelta, this.flightInput.controls);

    const { renderPosition, renderOrientation } = this.aircraft;
    if (mouseFlying) this.mouseFlight.aimDirection(this.aimDirection);
    const t = this.aircraft.state.telemetry;
    // Camera shake, scaled by the Accessibility setting: buffet, recoil, high g, and impact trauma.
    this.cameras.update(deltaSeconds, renderPosition, renderOrientation, mouseFlying ? this.aimDirection : null, {
      speed: t.airspeed,
      buffet: this.aircraft.state.flowSeparation,
      firing: this.playerGuns.firing,
      loadFactor: t.loadFactor,
      shakeScale: this.settings.accessibility.cameraShake,
    });
    this.updateFeedback(deltaSeconds);
    // The glide slope (and so the PAPI) is defined for the wheels, not the centre of mass.
    this.wheelHeightPoint.copyFrom(renderPosition).y -= groundClearance(this.aircraft.spec);
    this.environment.update(deltaSeconds, renderPosition, this.wheelHeightPoint, this.scene.activeCamera?.globalPosition ?? renderPosition);
    const baseViews = describeBases(this.combat, this.carrierStatuses, PLAYER_TEAM);
    this.beacons.update(baseViews, this.scene.activeCamera?.globalPosition ?? renderPosition, this.clock);
    const mapFrame = this.mapFrame(baseViews);
    this.miniMap.update(deltaSeconds, mapFrame);
    this.hangar.update(deltaSeconds, mapFrame);
    if (this.scene.activeCamera) this.tracers.update(this.scene.activeCamera.globalPosition);
    this.effects.update(worldDelta);
    this.balloons.update(worldDelta);
    this.enemyTargets.update(worldDelta);
    this.aiViews.update(alpha, worldDelta, this.aircraft.renderPosition);
    this.environment.showCarrierOwners(this.combat.ownerOf);
    this.baseStructures.update(worldDelta);
    this.updateAircraftFire(worldDelta);
    this.fireAndSmoke.update(worldDelta, this.scene.activeCamera?.globalPosition ?? renderPosition);
    this.updateAudio(deltaSeconds);

    this.timings.end('visuals');
    this.timings.begin();
    this.scene.render();
    this.timings.end('render');
    this.timings.begin();

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
      ...(({ lead, onTarget }) => ({ leadPoint: lead, onTarget }))(this.gunneryAids()),
      killMarker: this.projectKillMarker(),
      guns: this.playerGuns,
      fullAmmo: fullAmmo(this.aircraft.spec),
      serviceProgress: this.service.base ? this.service.progress : null,
      nearestBase: this.nearestBase(),
      approach: this.approachGuide(),
      baseStatus: this.enemyBaseStatus(),
      enemyMarkers: this.enemyMarkers(),
      // Filled by enemyMarkers() just above.
      offscreen: this.offscreen,
      baseLabels: this.baseLabels(baseViews),
      impactPoint: this.projectImpactPoint(),
      match: this.match ? { secondsLeft: remainingSeconds(this.match), blue: basesHeld(this.combat.bases, 'blue'), red: basesHeld(this.combat.bases, 'red'), open: this.combat.bases.filter((b) => b.owner === null).length } : null,
      kills: this.stats.kills,
      prompt: this.promptLine(),
    });
    this.timings.end('hud');
    this.timings.endFrame(deltaSeconds);
    this.debugOverlay.update(deltaSeconds, this.debugLines);
    this.input.endFrame();
  };

  /** Turns this frame's combat events into effects and HUD feedback. */
  private handleCombatEvents(): void {
    for (const event of this.combat.drainEvents()) {
      this.stats.record(event);
      this.handleCombatEvent(event);
    }
  }

  private handleCombatEvent(event: CombatEvent): void {
    this.soundFor(event);
    switch (event.type) {
      case 'groundImpact':
        this.effects.spawn(this.ground.surfaceAt(event.x, event.z) === 'water' ? 'splash' : 'dust', event.x, event.y, event.z);
        return;
      case 'aaFired':
        // Muzzle flash and a puff of smoke at the gun: shows where the fire is coming from.
        this.fireAndSmoke.flame(event.x, event.y + 0.5, event.z, 1.4);
        this.fireAndSmoke.smokePuff(event.x, event.y + 1, event.z, 0.4, 0.6, 2);
        return;
      case 'targetRespawned':
        return;
      case 'aircraftHit':
        this.effects.spawn('spark', event.x, event.y, event.z);
        // Your rounds on an enemy aircraft: the gunsight flashes, as on any target.
        if (event.owner === PLAYER_ID && event.victim !== PLAYER_ID) this.hud.registerHit();
        if (event.owner === PLAYER_ID && event.victim !== PLAYER_ID) {
          // The aircraft you hit flashes, and the damage you're doing to it counts up beside its marker.
          if (this.settings.accessibility.damageFlash) this.aiViews.flash(event.victim, FEEDBACK_CONFIG.hitFlashSeconds);
          const recent = this.recentDamage.get(event.victim) ?? { amount: 0, seconds: 0 };
          recent.amount += event.damage;
          recent.seconds = FEEDBACK_CONFIG.damagePopSeconds;
          this.recentDamage.set(event.victim, recent);
        }
        if (event.victim === PLAYER_ID) {
          if (this.settings.accessibility.damageFlash) this.hud.registerDamage(DEFENCE_VISUAL_CONFIG.hitFlashSeconds);
          this.feel('medium');
        }
        return;
      case 'aircraftShotDown': {
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 1);
        if (event.victim === PLAYER_ID) {
          this.hud.showMessage(`SHOT DOWN by ${this.describeShooter(event.owner)} · you are going down`, 'bad', 4);
          return;
        }
        const victim = this.aiForce.pilots.find((p) => p.id === event.victim);
        if (victim && event.owner === PLAYER_ID) {
          this.hud.showMessage(`ENEMY DOWN · ${victim.spec.displayName.toUpperCase()}`, 'good', 3);
          // Your kill: the big one (a punch, a moment's freeze, a marker where it went down).
          this.feel('large');
          this.killMarker = { pilotId: victim.id, seconds: FEEDBACK_CONFIG.killMarkerSeconds, x: event.x, y: event.y, z: event.z };
          this.recentDamage.delete(victim.id);
        } else {
          this.feel('medium', this.distanceTo(event));
        }
        return;
      }
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
        return;
      case 'baseNeutralized':
        if (event.owner !== PLAYER_TEAM) this.hud.showMessage(`${this.baseName(event.baseId).toUpperCase()} DEFENCELESS · land and stop on it to capture it (Red will come to defend it)`, 'good', 6);
        else this.hud.showMessage(`${this.baseName(event.baseId).toUpperCase()} HAS LOST ITS DEFENCES · Red can land and take it`, 'bad', 6);
        return;
      case 'baseDefended':
        // Only a capture repairs a base: this is the new owner's crews finishing.
        if (event.owner === PLAYER_TEAM) this.hud.showMessage(`${this.baseName(event.baseId).toUpperCase()} DEFENDED · its two AA guns now fire for you`, 'good', 5);
        else this.hud.showMessage(`${this.baseName(event.baseId)}'s defences have been rebuilt`, 'ok', 4);
        return;
      case 'baseCaptured':
        if (event.owner === PLAYER_TEAM) {
          this.hud.showMessage(`${this.baseName(event.baseId).toUpperCase()} TAKEN · it's yours: start and rearm here; your crews are building its two AA guns`, 'good', 7);
          this.audio.play('cable', 0.4, 1.6);
        } else {
          this.hud.showMessage(`RED HAS TAKEN ${this.baseName(event.baseId).toUpperCase()}${event.previousOwner === PLAYER_TEAM ? ' from you' : ''}`, 'bad', 6);
        }
    }
  }

  private baseName(baseId: string): string {
    return BASES.find((b) => b.id === baseId)?.name ?? 'Base';
  }

  /**
   * One call per juicy event (game-skills/GameFeel): its tier sets how hard
   * it's felt, fading with `distance` from you (0: it happened to you).
   * Shake goes through the camera's trauma; hit-stop only for the large tier,
   * only when it's yours, and never with reduced motion.
   */
  private feel(tier: FeedbackTier, distance = 0, falloff: number = FEEDBACK_CONFIG.falloffDistance, allowHitStop = true): void {
    const preset = FEEDBACK_TIERS[tier];
    const near = distance <= 0 ? 1 : Math.max(0, 1 - distance / falloff);
    if (near <= 0) return;
    this.cameras.addTrauma(preset.trauma * near);
    if (allowHitStop && distance <= 0 && preset.hitStopSeconds > 0 && !reducedMotion()) this.hitStopLeft = Math.max(this.hitStopLeft, preset.hitStopSeconds);
  }

  private distanceTo(point: { readonly x: number; readonly y: number; readonly z: number }): number {
    const p = this.aircraft.renderPosition;
    const dx = point.x - p.x;
    const dy = point.y - p.y;
    const dz = point.z - p.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Recent-damage numbers fade after the last hit; the kill marker follows the wreck down, then goes. */
  private updateFeedback(deltaSeconds: number): void {
    for (const [id, recent] of this.recentDamage) {
      recent.seconds -= deltaSeconds;
      if (recent.seconds <= 0) this.recentDamage.delete(id);
    }
    const kill = this.killMarker;
    if (kill) {
      kill.seconds -= deltaSeconds;
      const pilot = this.aiForce.pilots.find((p) => p.id === kill.pilotId);
      if (pilot && pilot.spawned && !pilot.state.crashed) {
        kill.x = pilot.state.position.x;
        kill.y = pilot.state.position.y;
        kill.z = pilot.state.position.z;
      }
      if (kill.seconds <= 0) this.killMarker = null;
    }
  }

  /** Where the kill marker is on screen, or null. */
  private projectKillMarker(): ScreenPoint | null {
    const kill = this.killMarker;
    if (!kill) return null;
    this.markerPoint.set(kill.x, kill.y, kill.z);
    return this.projectToScreen(this.markerPoint);
  }

  /** Who fired a round: an AI pilot's aircraft type, or a base's AA gun. */
  private describeShooter(owner: number): string {
    const pilot = this.aiForce.pilots.find((p) => p.id === owner);
    if (pilot) return `a Red ${pilot.spec.displayName}`;
    return this.combat.teamOfOwner(owner) === 'red' ? 'Red AA fire' : 'AA fire';
  }

  /** A fresh Red squadron (shared AI pilots), shown by the AI aircraft views. */
  private newSquadron(): AiForce {
    const force = new AiForce(createSquadron('red', AI_FIRST_ID, AIRCRAFT_CLASSES));
    this.aiViews.setPilots(force.pilots);
    return force;
  }

  /** What the AI pilots see this step: every aircraft, the targets and bases. */
  private aiWorldFor(time: number): AiWorld {
    this.aiContacts.length = 0;
    this.aiContacts.push({ id: PLAYER_ID, team: PLAYER_TEAM, state: this.aircraft.state });
    this.aiForce.contacts(this.aiContacts);
    return { time, ground: this.ground, aircraft: this.aiContacts, targets: this.combat.targets, bases: this.combat.bases, ownerOf: this.combat.ownerOf, carrierStatuses: this.carrierStatuses, pilots: this.aiForce.pilots };
  }

  /**
   * The enemy airfield you're nearest, within 6 km: its defences left, and
   * capture progress. A base you've captured shows as yours while you're on it.
   */
  private enemyBaseStatus(): BaseStatus | null {
    const p = this.aircraft.state.position;
    let best: BaseStatus | null = null;
    for (const control of this.combat.bases) {
      const r = control.base.runway.center;
      const distance = Math.hypot(r.x - p.x, r.z - p.z);
      const defences = this.combat.targets.filter((t) => t.baseId === control.base.id && BASE_DEFENCE_KINDS.includes(t.kind));
      const defencesLeft = defences.filter((t) => t.health > 0).length;
      const ours = control.owner === PLAYER_TEAM;
      // Ours: only while close, and while its crews are still building its defences (just taken).
      if (ours && (distance > 1_500 || defencesLeft === defences.length)) continue;
      if (distance > 6_000 || (best && best.distance < distance)) continue;
      best = {
        name: control.base.name,
        distance,
        holder: ours ? 'yours' : control.owner === null ? 'nobody' : 'enemy',
        defencesLeft,
        defencesTotal: defences.length,
        capturing: control.capturingTeam === PLAYER_TEAM ? control.captureProgress : null,
      };
    }
    return best;
  }

  private targetDestroyed(event: Extract<CombatEvent, { type: 'targetDestroyed' }>): void {
    const byPlayer = event.owner === PLAYER_ID;
    // Felt by how big it is and how near you are.
    const tier: FeedbackTier = event.kind === 'balloon' ? 'small' : event.kind === 'fuelDepot' || event.kind === 'hangar' || event.kind === 'carrier' ? 'large' : 'medium';
    this.feel(tier, Math.max(1, this.distanceTo(event)), tier === 'large' ? FEEDBACK_CONFIG.falloffDistance * 1.5 : FEEDBACK_CONFIG.falloffDistance, false);
    switch (event.kind) {
      case 'balloon':
        this.effects.spawn('burst', event.x, event.y, event.z);
        this.effects.spawn('shreds', event.x, event.y, event.z);
        return;
      case 'aaGun':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 1.2);
        if (byPlayer) this.hud.showMessage('AA GUN DESTROYED · it stays down', 'good', 2.5);
        return;
      case 'parkedAircraft':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 2);
        if (byPlayer) this.hud.showMessage('PARKED AIRCRAFT DESTROYED', 'good', 2.5);
        return;
      case 'hangar':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 3.5);
        if (byPlayer) this.hud.showMessage('HANGAR DESTROYED', 'good', 2.5);
        return;
      case 'fuelDepot':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 5);
        this.fireAndSmoke.explosion(event.x + 8, event.y + 4, event.z - 6, 3);
        if (byPlayer) this.hud.showMessage('FUEL DEPOT DESTROYED', 'good', 2.5);
        return;
      case 'radar':
        this.fireAndSmoke.explosion(event.x, event.y, event.z, 2);
        if (byPlayer) this.hud.showMessage('RADAR DESTROYED', 'good', 2.5);
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
        const size = { balloon: 0, aaGun: 1.3, parkedAircraft: 1.4, carrier: 2.5, hangar: 2, fuelDepot: 3, radar: 1.2 }[event.kind];
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
    if (fired > 0) this.stats.roundsFired += fired;
    if (fired > 0) this.audio.gunfire(fired);
    else if (this.flightInput.controls.fire && this.playerGuns.ammo === 0 && !state.crashed) this.audio.dryFire();

    if (state.touchdownCount > this.lastTouchdowns && !state.crashed) {
      const firmness = Math.min(1, state.lastTouchdownSinkRate / 4);
      // A firm arrival thumps; a greaser hardly moves the view.
      this.cameras.addTrauma(FEEDBACK_TIERS.small.trauma * firmness * 1.5);
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
    if (state.catapult === 'launching' && this.lastCatapult === 'held') {
      this.audio.play('whoosh', 0.7);
      this.feel('small');
    }
    this.lastCatapult = state.catapult;
    if (state.crashed && !this.wasCrashedForAudio) {
      this.audio.play('explosion', AUDIO_CONFIG.explosionVolume, state.crashReason?.includes('sea') ? 1.4 : 1);
      this.feel('large', 0, FEEDBACK_CONFIG.falloffDistance, false);
    }
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

  /**
   * The pilot's controls for one physics step. Mouse flight: the direction
   * pilot turns the aim into stick positions; easy steering: A/D turn like a
   * car. Either way, any flight key held overrides the assist on its axis.
   */
  private pilotControls(dt: number, mouseFlying: boolean): Readonly<FlightControls> {
    let assist: StickInputs | null = null;
    let steering = false;
    let assistAirbrake = 0;
    if (mouseFlying) {
      this.mouseFlight.aimDirection(this.aimDirection);
      this.compensateForDrop(this.aimDirection, this.gunAim);
      assist = steerTowards(this.aircraft.state, this.aircraft.spec, this.gunAim, this.mouseSticks);
    } else if (this.steering === 'easy') {
      // Car-like: A/D turn, the assist banks and pulls, and levels the aircraft when they're let go.
      const { turn, pitchByHand } = this.flightInput.steeringInputs(dt);
      assist = steerWithTurnInput(this.aircraft.state, this.aircraft.spec, turn, pitchByHand, this.steeringMemory, this.steeringSticks);
      steering = true;
      // Turning hard above the best turning speed: ease the air brakes out to tighten the turn.
      const over = this.aircraft.state.telemetry.airspeed / this.aircraft.performance.cornerSpeed - STEERING_CONFIG.brakeAboveCornerSpeed;
      if (Math.abs(turn) > 0.6 && over > 0) assistAirbrake = Math.min(1, over * STEERING_CONFIG.brakePerSpeedRatio);
    }
    return this.flightInput.update(dt, assist, steering, assistAirbrake);
  }

  /** P: start auto-land at the nearest base in range (friendly or enemy), or hand control back. */
  private toggleAutoLand(): void {
    if (this.autoLand) {
      this.stopAutoLand('YOU HAVE CONTROL · auto-land off', 'ok');
      return;
    }
    const { state, spec } = this.aircraft;
    if (state.crashed || state.shotDown) return;
    if (state.onGround) {
      this.hud.showMessage('AUTO-LAND is for landing: take off first', 'ok', 2.5);
      return;
    }
    const base = this.autoLandTarget();
    if (!base) {
      this.hud.showMessage(`AUTO-LAND · no base within ${AUTO_LAND_CONFIG.offerRange / 1000} km${spec.airframe.tailhook ? '' : ` (the ${spec.displayName} is too big for a carrier)`}`, 'ok', 3);
      return;
    }
    this.autoLand = planAutoLand(base, state);
    this.autoLandBase = base;
    this.autoLandEnd = null;
    const owner = this.combat.ownerOf(base);
    const note = owner === PLAYER_TEAM ? '' : owner === null ? " · NOBODY'S: stop there to take it" : ' · ENEMY BASE: no rearming there';
    this.hud.showMessage(`AUTO-LAND · ${base.name.toUpperCase()}${note} · ${this.keyName('autoLand')} or any flight key takes over`, owner === PLAYER_TEAM || owner === null ? 'good' : 'ok', 4);
  }

  /** After the physics steps: hand control back if auto-land finished, was overridden, or can't go on. */
  private updateAutoLand(): void {
    if (!this.autoLand || !this.autoLandBase) return;
    const base = this.autoLandBase;
    const { state } = this.aircraft;
    if (state.crashed || state.shotDown) this.autoLandEnd = 'crashed';
    else if (base.kind === 'carrier' && (this.carrierStatuses.get(base.id)?.sink ?? 0) > 0) {
      this.stopAutoLand(`AUTO-LAND OFF · ${base.name} is sinking`, 'bad');
      return;
    }
    const end = this.autoLandEnd;
    if (end === 'takenOver') this.stopAutoLand('YOU HAVE CONTROL · auto-land off', 'ok');
    else if (end === 'crashed') this.stopAutoLand(null, 'ok');
    else if (end === 'landed') {
      const owner = this.combat.ownerOf(base);
      const control = this.combat.bases.find((b) => b.base.id === base.id);
      const message =
        owner === PLAYER_TEAM
          ? `LANDED · ${base.name.toUpperCase()} · stay stopped at idle: the ground crew rearms and repairs you`
          : owner === null
            ? `LANDED · ${base.name.toUpperCase()} · nobody's: stay stopped to take it`
            : control?.neutralized
            ? `LANDED · ${base.name.toUpperCase()} · it's defenceless: stay stopped to capture it`
            : `LANDED · ${base.name.toUpperCase()} · enemy base: no rearming here, and it can't be captured while defended`;
      this.stopAutoLand(message, owner === PLAYER_TEAM || owner === null || control?.neutralized ? 'good' : 'ok');
    }
  }

  private stopAutoLand(message: string | null, tone: 'good' | 'ok' | 'bad'): void {
    this.autoLand = null;
    this.autoLandBase = null;
    this.autoLandEnd = null;
    // Carry on smoothly by hand: the steering assist starts afresh, and the mouse aims where the aircraft is going.
    Object.assign(this.steeringMemory, createSteeringAssistMemory());
    if (this.mouseFlight.active) this.mouseFlight.aimAlong(this.aircraft.state.velocity);
    if (message) this.hud.showMessage(message, tone, 5);
  }

  /** The auto-land line on the HUD: what it's doing, or the offer when near a base. */
  private autoLandLine(): HudFrame['prompt'] {
    const { state, spec } = this.aircraft;
    if (state.crashed || state.shotDown) return null;
    const auto = this.autoLand;
    if (auto && this.autoLandBase) {
      const step =
        auto.phase === 'intercept'
          ? auto.goArounds > 0 && auto.leg === 'outside'
            ? 'GOING AROUND'
            : auto.leg === 'outside'
              ? 'FLYING OUT TO TURN IN'
              : 'JOINING THE APPROACH'
          : auto.phase === 'final'
            ? 'ON FINAL'
            : auto.phase === 'flare'
              ? 'FLARE'
              : state.hookEngaged
                ? 'WIRE CAUGHT'
                : 'BRAKING';
      return { active: true, text: `AUTO-LAND · ${this.autoLandBase.name.toUpperCase()} · ${step} · ${this.keyName('autoLand')}: take over` };
    }
    if (state.onGround || !this.settings.gameplay.autoLandOffers) return null;
    const base = this.autoLandTarget();
    // An aircraft with no hook (the Heavy Bomber) near a carrier: say why it isn't offered, and offer the nearest airfield.
    const p = state.position;
    const carrierNearby = !spec.airframe.tailhook && CARRIERS.some((c) => Math.hypot(c.center.x - p.x, c.center.z - p.z) < AUTO_LAND_HUD.promptDistance);
    const tooBig = carrierNearby ? ` (the ${spec.displayName} is too big for the carrier)` : '';
    if (!base) return carrierNearby ? { active: false, text: `The ${spec.displayName} is too big to land on a carrier` } : null;
    const distance = Math.hypot(base.runway.center.x - p.x, base.runway.center.z - p.z);
    if (distance > AUTO_LAND_HUD.promptDistance && !carrierNearby) return null;
    const owner = this.combat.ownerOf(base);
    const whose = owner === PLAYER_TEAM ? '' : owner === null ? " (nobody's)" : ' (enemy)';
    return { active: false, text: `${this.keyName('autoLand')} · AUTO-LAND at ${base.name}${whose} · ${(distance / 1000).toFixed(1)} km${tooBig}` };
  }

  /** What auto-land's choice of base knows: who holds what, and which enemy bases are defenceless. */
  private readonly autoLandPreferences: AutoLandPreferences = {
    team: PLAYER_TEAM,
    ownerOf: (base) => this.combat.ownerOf(base),
    isOpen: (base) => this.combat.bases.find((c) => c.base.id === base.id)?.neutralized ?? false,
  };
  /** The base auto-land last offered: kept unless another is clearly the better choice, so the offer doesn't flicker. */
  private offeredBase: BaseDefinition | null = null;

  /** The base you're heading for (shared rule: near, ahead, and one you can use), steady from frame to frame. */
  private autoLandTarget(): BaseDefinition | null {
    const { state, spec } = this.aircraft;
    const prefs = this.autoLandPreferences;
    const best = chooseAutoLandBase(spec, state, this.carrierStatuses, prefs);
    const previous = this.offeredBase;
    if (previous && best && previous !== best && autoLandCost(previous, spec, state, this.carrierStatuses, prefs) < autoLandCost(best, spec, state, this.carrierStatuses, prefs) + AUTO_LAND_OFFER_HYSTERESIS) return previous;
    this.offeredBase = best;
    return best;
  }

  /**
   * Gunnery aids: the lead marker on the nearest enemy aircraft ahead (where
   * to put the gunsight), and whether rounds fired now would hit any enemy
   * aircraft (the gunsight turns red), counting the near-miss allowance.
   */
  private gunneryAids(): { lead: ScreenPoint | null; onTarget: boolean } {
    const me = this.aircraft.state;
    const spec = this.aircraft.spec;
    if (me.crashed || me.onGround || this.cameras.mode === 'orbit') return NO_AIDS;
    FORWARD.rotateByQuaternionToRef(this.aircraft.renderOrientation, this.cameraForward);
    let onTarget = false;
    // The lead is for the enemy nearest the nose (the one you're pointing at), not the nearest by distance.
    let best: AiPilot | null = null;
    let bestCos = -1;
    let currentCos = -2;
    for (const pilot of this.aiForce.pilots) {
      const s = pilot.state;
      if (!pilot.spawned || s.crashed || pilot.team === PLAYER_TEAM) continue;
      const dx = s.position.x - me.position.x;
      const dy = s.position.y - me.position.y;
      const dz = s.position.z - me.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > GUNNERY_AID_RANGE) continue;
      // Ahead of the nose (within about 50 degrees).
      const cos = (dx * this.cameraForward.x + dy * this.cameraForward.y + dz * this.cameraForward.z) / distance;
      if (cos < 0.64) continue;
      if (!onTarget && roundsWouldHit(me, spec, s, pilot.spec, HIT_ASSIST_CONFIG.nearMissMetres, enlargeBlend(s, pilot.spec, this.ground.heightAt(s.position.x, s.position.z)))) onTarget = true;
      if (cos > bestCos) {
        best = pilot;
        bestCos = cos;
      }
      if (pilot.id === this.leadTargetId) currentCos = cos;
    }
    // Keep the one it's on while it's still ahead and in range, unless another is clearly nearer the nose.
    const keep = currentCos > -2 && Math.acos(Math.min(1, currentCos)) - Math.acos(Math.min(1, bestCos)) < LEAD_SWITCH_MARGIN_DEG / RAD_TO_DEG;
    const nearest = keep ? (this.aiForce.pilots.find((p) => p.id === this.leadTargetId) ?? best) : best;
    this.leadTargetId = nearest?.id ?? null;
    if (!nearest || !this.settings.gameplay.targetMarkers) return { lead: null, onTarget };
    leadDirection(me, spec, nearest.state, this.leadScratch);
    const length = Math.hypot(this.leadScratch.x, this.leadScratch.y, this.leadScratch.z) || 1;
    // At the gunsight's distance, so the two line up on screen when the nose is on the solution.
    const reach = GUN_SPECS[spec.id].convergenceDistance / length;
    this.worldPoint.set(this.aircraft.renderPosition.x + this.leadScratch.x * reach, this.aircraft.renderPosition.y + this.leadScratch.y * reach, this.aircraft.renderPosition.z + this.leadScratch.z * reach);
    return { lead: this.projectToScreen(this.worldPoint), onTarget };
  }

  /** Distance and compass bearing from the aircraft to the nearest friendly base. */
  private nearestBase(): HudFrame['nearestBase'] {
    const p = this.aircraft.state.position;
    const here = friendlyBaseAt(PLAYER_TEAM, p.x, p.z, this.combat.ownerOf);
    if (here) return { kind: here.kind, distance: 0, bearingDeg: 0 };
    let best: HudFrame['nearestBase'] = null;
    for (const base of BASES) {
      if (this.combat.ownerOf(base) !== PLAYER_TEAM) continue;
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
      if (this.combat.ownerOf(base) !== PLAYER_TEAM) continue;
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

  /**
   * Mouse flight points the nose (the guns) at the aim. Rounds fall under
   * gravity, though: at 600 m nearly 2 m, which in a shallow strafing dive
   * lands them 15 m short of a gun. So when the aim meets the ground within
   * gun range, the nose is raised by exactly the drop at that range, and the
   * rounds land where the aim circle is.
   */
  private compensateForDrop(aim: Vector3, out: Vector3): void {
    out.copyFrom(aim);
    const { state, spec, renderPosition: p } = this.aircraft;
    let range = 0;
    for (let d = 40; d <= DROP_COMPENSATION_RANGE; d += 20) {
      const x = p.x + aim.x * d;
      const y = p.y + aim.y * d;
      const z = p.z + aim.z * d;
      if (y < this.ground.heightAt(x, z)) {
        range = d;
        break;
      }
    }
    if (range === 0) return;
    const roundSpeed = GUN_SPECS[spec.id].muzzleVelocity + (state.velocity.x * aim.x + state.velocity.y * aim.y + state.velocity.z * aim.z);
    const time = range / Math.max(100, roundSpeed);
    out.scaleInPlace(range);
    out.y += 0.5 * 9.81 * time * time;
    out.normalize();
  }

  /**
   * Red brackets over the enemy targets you could attack: alive, on screen,
   * within 3.5 km (8 km for the carrier). Nearest first.
   */
  private enemyMarkers(): EnemyMarker[] {
    const markers: EnemyMarker[] = [];
    this.offscreen = [];
    if (!this.settings.gameplay.targetMarkers) return markers;
    const view = this.engine.getRenderingCanvasClientRect();
    const viewWidth = view?.width ?? window.innerWidth;
    const viewHeight = view?.height ?? window.innerHeight;
    const p = this.aircraft.state.position;
    // Enemy aircraft first: they matter most, out to 5 km.
    for (const pilot of this.aiForce.pilots) {
      const s = pilot.state;
      if (!pilot.spawned || s.crashed || pilot.team === PLAYER_TEAM) continue;
      const distance = Math.hypot(s.position.x - p.x, s.position.y - p.y, s.position.z - p.z);
      if (distance > 5_000) continue;
      this.markerPoint.set(s.position.x, s.position.y, s.position.z);
      const screen = this.projectToScreen(this.markerPoint);
      // Its hull, once you've damaged it.
      const hull = s.hullHealth / pilot.spec.combat.maxHullHealth;
      const label = `${pilot.spec.displayName.toUpperCase()}${hull < 0.995 ? ` ${Math.round(hull * 100)}%` : ''}`;
      const recent = this.recentDamage.get(pilot.id);
      const onScreen = screen !== null && screen.x >= 0 && screen.x <= viewWidth && screen.y >= 0 && screen.y <= viewHeight;
      if (onScreen) markers.push({ x: screen.x, y: screen.y, kind: 'aircraft', distance, label, recentDamage: recent ? Math.round(recent.amount) : 0 });
      else {
        const edge = this.projectToEdge(this.markerPoint, viewWidth, viewHeight);
        if (edge) this.offscreen.push({ ...edge, distance });
      }
    }
    // Nearest first; one arrow where several would sit on top of each other (dead behind, say).
    this.offscreen.sort((a, b) => a.distance - b.distance);
    this.offscreen = this.offscreen.filter((m, i) => !this.offscreen.slice(0, i).some((n) => Math.hypot(m.x - n.x, m.y - n.y) < 28));
    for (const target of this.combat.targets) {
      if (target.team === null || target.team === PLAYER_TEAM || target.health <= 0) continue;
      const sink = target.carrierId ? (this.carrierStatuses.get(target.carrierId)?.sink ?? 0) : 0;
      const lift = target.kind === 'carrier' ? 14 : target.kind === 'hangar' ? 10 : target.kind === 'radar' ? 12 : 3;
      this.markerPoint.set(target.position.x, target.position.y - sink + lift, target.position.z);
      const distance = Math.hypot(this.markerPoint.x - p.x, this.markerPoint.y - p.y, this.markerPoint.z - p.z);
      if (distance > (target.kind === 'carrier' ? 8_000 : 3_500)) continue;
      const screen = this.projectToScreen(this.markerPoint);
      if (screen) markers.push({ x: screen.x, y: screen.y, kind: target.kind, distance });
    }
    // Nearest first; drop markers that would sit on top of a nearer one (the parked aircraft stand close together).
    // Aircraft first, then nearest first.
    markers.sort((a, b) => (a.kind === 'aircraft' ? 0 : 1) - (b.kind === 'aircraft' ? 0 : 1) || a.distance - b.distance);
    return markers.filter((m, i) => !markers.slice(0, i).some((n) => Math.hypot(m.x - n.x, m.y - n.y) < 26));
  }

  /**
   * Where a round fired now would hit the ground: follows its path (nose
   * direction at muzzle velocity, plus the aircraft's velocity, falling
   * under gravity) until it meets the terrain, sea or a deck. Shown within
   * 1.6 km. Put it on a ground target and fire.
   */
  private projectImpactPoint(): ScreenPoint | null {
    const { state, spec, renderPosition, renderOrientation } = this.aircraft;
    if (state.crashed || state.onGround) return null;
    const gun = GUN_SPECS[spec.id];
    FORWARD.rotateByQuaternionToRef(renderOrientation, this.toPoint);
    let x = renderPosition.x;
    let y = renderPosition.y;
    let z = renderPosition.z;
    let vx = state.velocity.x + this.toPoint.x * gun.muzzleVelocity;
    let vy = state.velocity.y + this.toPoint.y * gun.muzzleVelocity;
    const vz = state.velocity.z + this.toPoint.z * gun.muzzleVelocity;
    const dt = 0.02;
    let above = y - this.ground.heightAt(x, z);
    for (let t = 0; t < gun.projectileLifetime; t += dt) {
      vy -= 9.81 * dt;
      const nx = x + vx * dt;
      const ny = y + vy * dt;
      const nz = z + vz * dt;
      const nextAbove = ny - this.ground.heightAt(nx, nz);
      if (nextAbove <= 0) {
        // Interpolate to where the path crosses the ground within this step.
        const f = above / Math.max(1e-6, above - nextAbove);
        this.worldPoint.set(x + (nx - x) * f, y + (ny - y) * f, z + (nz - z) * f);
        if (Vector3.Distance(this.worldPoint, renderPosition) > 1_600) return null;
        return this.projectToScreen(this.worldPoint);
      }
      x = nx;
      y = ny;
      z = nz;
      above = nextAbove;
    }
    return null;
  }

  /** One line on how to get going from where the aircraft has just spawned. */
  private briefSpawn(): void {
    const { state, spec } = this.aircraft;
    this.catapultBriefing = state.catapult === 'held';
    if (this.catapultBriefing) this.hud.showMessage(`${spec.displayName.toUpperCase()} ON THE CATAPULT · full throttle (${this.keyName('throttleUp')}) to launch`, 'good', 8);
    else this.hud.showMessage(`${spec.displayName.toUpperCase()} · ${this.aircraft.homeBase.name.toUpperCase()} · throttle up (${this.keyName('throttleUp')}) to take off`, 'good', 4);
  }

  /** What the maps show: the bases, and you (heading from your velocity, or your nose when stopped). */
  private mapFrame(baseViews: readonly BaseView[]): MapFrame {
    const state = this.aircraft.state;
    const p = this.aircraft.renderPosition;
    const moving = Math.hypot(state.velocity.x, state.velocity.z) > 1;
    const heading = moving ? Math.atan2(state.velocity.x, state.velocity.z) : this.aircraftHeading();
    const aircraft = this.aiForce.pilots
      .filter((pilot) => pilot.spawned && !pilot.state.crashed)
      .map((pilot) => ({ x: pilot.state.position.x, z: pilot.state.position.z, headingDeg: (((Math.atan2(pilot.state.velocity.x, pilot.state.velocity.z) * RAD_TO_DEG) % 360) + 360) % 360, team: pilot.team }));
    return { player: state.crashed ? null : { x: p.x, z: p.z, headingDeg: ((heading * RAD_TO_DEG) % 360 + 360) % 360 }, bases: baseViews, playerTeam: PLAYER_TEAM, aircraft };
  }

  /** Which way the nose points, clockwise from north (rad). */
  private aircraftHeading(): number {
    FORWARD.rotateByQuaternionToRef(this.aircraft.renderOrientation, this.toPoint);
    return Math.atan2(this.toPoint.x, this.toPoint.z);
  }

  // ── The hangar ──────────────────────────────────────────────────────────

  /** The bases an aircraft type could start from now (your own and any you've captured; carriers need a hook), as the hangar's map lists them. */
  private baseChoices(classId: AircraftClassId): BaseChoice[] {
    const p = this.aircraft.state.position;
    const spec = AIRCRAFT_CLASSES[classId];
    const decks = startingBases(PLAYER_TEAM, spec, this.combat.ownerOf, this.carrierStatuses);
    // Too big for a deck: it can still be launched into the air over a carrier.
    const overCarriers = hasTailhook(spec) ? [] : airStartBases(PLAYER_TEAM, this.combat.ownerOf, this.carrierStatuses).filter((b) => b.kind === 'carrier');
    return [...overCarriers, ...decks].map((base) => {
      const owner = this.combat.ownerOf(base);
      const distance = Math.hypot(base.runway.center.x - p.x, base.runway.center.z - p.z);
      const how = base.kind === 'carrier' ? (hasTailhook(spec) ? 'carrier · catapult launch' : 'carrier · air start (too big for the deck)') : 'airfield';
      const parts = [how, owner !== base.team ? 'captured' : '', distance < 1_500 ? 'here' : `${(distance / 1000).toFixed(1)} km`].filter(Boolean);
      return { base, name: base.name, detail: parts.join(' · '), color: baseColor(owner) };
    });
  }

  /** Flying (or rolling): the pause menu's "Change aircraft" keeps that flight to go back to. Stopped or crashed, the hangar's choices take effect at once. */
  private isFlightInProgress(): boolean {
    const state = this.aircraft.state;
    if (state.crashed) return false;
    return !(state.onGround && state.catapult !== 'launching' && Math.hypot(state.velocity.x, state.velocity.z) < 3);
  }

  // ── Screens ─────────────────────────────────────────────────────────────

  /**
   * Switches screen (null: back to flying). The first screen over a flight
   * pauses it: the mouse is let go, the HUD and map hidden, sound paused.
   * The main menu, hangar, lobby and report show the aircraft in the
   * showcase camera; the pause menu (and settings from it) the frozen flight.
   */
  private enter(next: Screen | null): void {
    const previous = this.screen;
    if (previous) this.screenView(previous).close();
    if (previous === 'hangar') {
      this.aircraft.setPreview(null);
      writeHangarSelection(this.hangarSelection);
    }
    this.screen = next;
    this.screenOpenedAt = this.clock;
    if (next) this.uiRoot.dataset['screen'] = next;
    else delete this.uiRoot.dataset['screen'];
    if (next === null) {
      this.cameras.setShowcase(false);
      this.aircraft.visual.setVisible(this.cameras.mode !== 'cockpit');
      this.mouseFlight.captureAllowed = this.cameras.mode !== 'orbit';
      this.audio.setPaused(false);
      this.hud.setVisible(true);
      this.miniMap.setSuppressed(false);
      this.loop.reset();
      // Nothing keeps focus while flying, so Space and the arrows fly the aircraft.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    if (previous === null) {
      if (this.mouseFlight.active) this.mouseFlight.release();
      // Clicks and drags now belong to the screen (and the hangar's view).
      this.mouseFlight.captureAllowed = false;
      this.audio.setPaused(true);
      this.hud.setVisible(false);
      this.miniMap.setSuppressed(true);
    }
    const showcase = next === 'menu' || next === 'hangar' || next === 'lobby' || next === 'results' || (next === 'settings' && this.settingsReturn === 'menu');
    if (showcase) {
      this.cameras.setShowcase(true, this.aircraft.spec);
      this.aircraft.visual.setVisible(true);
    } else {
      this.cameras.setShowcase(false);
      this.aircraft.visual.setVisible(this.cameras.mode !== 'cockpit');
    }
  }

  private screenView(screen: Screen): { close(): void } {
    return { menu: this.mainMenu, hangar: this.hangar, pause: this.pauseMenu, settings: this.settingsScreen, lobby: this.lobby, results: this.results }[screen];
  }

  private openMainMenu(): void {
    this.enter('menu');
    this.mainMenu.open({ callsign: this.callsign, aircraft: this.aircraft.spec.displayName, base: this.aircraft.homeBase.name });
  }

  private readonly mainMenuEvents: MainMenuEvents = {
    play: () => this.openHangar('select', 'menu'),
    multiplayer: () => this.openLobby(),
    settings: () => this.openSettings('graphics', 'menu'),
    controls: () => this.openSettings('controls', 'menu'),
    callsign: (name) => {
      this.callsign = name;
      writeCallsign(name);
    },
  };

  private openLobby(): void {
    this.enter('lobby');
    this.lobby.open({ callsign: this.callsign, aircraft: this.aircraft.spec.displayName, redPilots: this.aiForce.pilots.map((p) => p.spec.displayName) });
  }

  /**
   * The hangar. "select": choosing before a flight. "change": from the pause
   * menu. "respawn": after a crash; the wreck is cleared and a fresh aircraft
   * parked at the chosen base, so the view shows what you'll fly next.
   */
  private openHangar(kind: HangarMode['kind'], returnTo: 'menu' | 'pause' | 'lobby'): void {
    this.forgetLostStartBase();
    this.noticeLoss();
    this.hangarResumable = kind === 'change' && this.isFlightInProgress();
    this.hangarReturn = returnTo;
    this.hangarKind = kind;
    const spec = this.aircraft.spec;
    this.hangarSelection = { ...this.hangarSelection, classId: spec.id, paintId: this.aircraft.paint.schemeFor(spec.id).id, baseId: this.aircraft.homeBase.id };
    if (kind === 'respawn') {
      this.awaitingRespawn = true;
      this.parkForHangar();
    }
    this.enter('hangar');
    const report: RespawnReport = this.lostReport ?? { title: 'Aircraft lost', cause: '', lines: [] };
    const mode: HangarMode = kind === 'respawn' ? { kind, report } : kind === 'change' ? { kind, resumable: this.hangarResumable } : { kind };
    this.hangar.open(mode, this.hangarSelection, this.baseChoices(this.hangarSelection.classId), this.mapFrame(describeBases(this.combat, this.carrierStatuses, PLAYER_TEAM)), {
      lockedClassId: this.lockedClassId,
      matchMinutes: this.matchMinutes,
      matchLengths: MATCH_CONFIG.lengthsMinutes,
    });
  }

  private openPause(): void {
    this.enter('pause');
    const { spec, homeBase } = this.aircraft;
    this.pauseMenu.open({
      aircraft: spec.displayName,
      base: homeBase.name,
      status: this.awaitingRespawn ? 'aircraft lost' : this.isFlightInProgress() ? 'in flight' : 'parked',
      afterCrash: this.awaitingRespawn,
    });
  }

  private readonly pauseEvents: PauseMenuEvents = {
    resume: () => {
      if (this.awaitingRespawn) this.openHangar('respawn', 'pause');
      else this.enter(null);
    },
    changeAircraft: () => this.openHangar(this.awaitingRespawn ? 'respawn' : 'change', 'pause'),
    settings: (tab) => this.openSettings(tab, 'pause'),
    exit: () => this.exitToMainMenu(),
  };

  private openSettings(tab: SettingsTab, returnTo: 'menu' | 'pause'): void {
    this.settingsReturn = returnTo;
    this.enter('settings');
    this.settingsScreen.open(tab, {
      settings: this.settings,
      steering: this.steering,
      mouseSensitivity: this.mouseFlight.sensitivity,
      soundOn: !this.audio.isMuted,
      postProcessing: this.pipeline !== null,
    });
  }

  private readonly settingsEvents: SettingsEvents = {
    change: (settings) => {
      this.settings = settings;
      saveSettings(settings);
      this.applySettings();
    },
    steering: (mode: SteeringMode) => {
      this.steering = mode;
      writeSteeringMode(mode);
    },
    mouseSensitivity: (value) => this.mouseFlight.setSensitivity(value),
    sound: (on) => this.audio.setMuted(!on),
    done: () => {
      if (this.settingsReturn === 'pause') this.openPause();
      else this.openMainMenu();
    },
  };

  /** Exit to main menu mid-match: the match is abandoned; the report shows how it stood. */
  private exitToMainMenu(): void {
    this.noticeLoss();
    this.clearLoss();
    this.showReport(null);
  }

  /** The clock ran out, or a side lost its last base: the match is over. */
  private endMatch(result: MatchResult): void {
    this.noticeLoss();
    this.clearLoss();
    this.showReport(result);
  }

  private showReport(result: MatchResult | null): void {
    const match = this.match;
    this.enter('results');
    this.results.open({
      stats: this.stats,
      callsign: this.callsign,
      clock: this.clock,
      result,
      bases: { blue: basesHeld(this.combat.bases, 'blue'), red: basesHeld(this.combat.bases, 'red') },
      matchSeconds: match?.elapsed ?? 0,
      playerTeam: PLAYER_TEAM,
    });
  }

  /** After the report: everything resets (world, squadron, scores) and the aircraft is parked at its base for the menu. */
  private continueFromResults(): void {
    this.resetWorld();
    this.parkForHangar();
    this.openMainMenu();
  }

  /**
   * A new match: every base, gun and building as at the start, a fresh Red
   * squadron, the clock and scores at zero, and the aircraft locked in.
   */
  private startMatch(): void {
    this.resetWorld();
    this.match = createMatch(this.matchMinutes);
    this.lockedClassId = this.hangarSelection.classId;
  }

  private resetWorld(): void {
    this.combat.reset();
    this.aiForce = this.newSquadron();
    this.aiClock = 0;
    this.match = null;
    this.matchResult = null;
    this.lockedClassId = null;
    this.stats = new SessionStats(PLAYER_ID, PLAYER_TEAM);
    this.crashFire = null;
    this.serviceEvent = null;
    this.clearLoss();
  }

  /** Esc in flight: the pause menu; with the aircraft lost, straight to the respawn screen. */
  private escapeFromFlight(): void {
    if (this.aircraft.state.crashed) this.openHangar('respawn', 'pause');
    else this.openPause();
  }

  /** Keys while a screen is open (the game is paused). Each screen's buttons also work by Tab and Enter. */
  private handleScreenKeys(): void {
    const input = this.input;
    // The same Esc can arrive twice when it also lets go of the mouse.
    const esc = input.wasPressed('openHangar') && this.clock - this.screenOpenedAt > UI_CONFIG.escDebounceSeconds;
    const enter = input.wasPressed('pickerConfirm');
    switch (this.screen) {
      case 'menu':
        if (enter && !this.mainMenu.editing) this.mainMenuEvents.play();
        return;
      case 'hangar':
        this.handleHangarKeys(esc, enter);
        return;
      case 'pause':
        if (esc) this.pauseEvents.resume();
        return;
      case 'settings':
        if (esc && !this.settingsScreen.capturingKey) this.settingsEvents.done();
        return;
      case 'lobby':
        if (esc) this.openMainMenu();
        else if (enter) this.openHangar('select', 'lobby');
        return;
      case 'results':
        if (esc || enter) this.continueFromResults();
        return;
      default:
    }
  }

  // ── The sortie ──────────────────────────────────────────────────────────

  /** Flight time, and the respawn screen a moment after the aircraft is lost. */
  private updateSortie(deltaSeconds: number): void {
    if (this.screen !== null) return;
    if (!this.aircraft.state.crashed) {
      this.stats.flightSeconds += deltaSeconds;
      this.sortieSeconds += deltaSeconds;
      return;
    }
    this.noticeLoss();
    if (this.lostAt !== null && this.clock - this.lostAt > UI_CONFIG.respawnScreenDelaySeconds) this.openHangar('respawn', 'pause');
  }

  /** Once per lost aircraft: count it, and keep what the respawn screen says about it. */
  private noticeLoss(): void {
    const { state, spec } = this.aircraft;
    if (this.lostReport || !state.crashed) return;
    this.lostAt = this.clock;
    this.stats.lost(state.crashReason);
    const shotDown = state.crashReason === 'shot down';
    this.lostReport = {
      title: shotDown ? 'Shot down' : 'Crashed',
      cause: shotDown ? 'Brought down by anti-aircraft fire.' : `Cause: ${state.crashReason ?? 'unknown'}.`,
      lines: [
        ['Aircraft', spec.displayName],
        ['Time in the air', formatDuration(this.sortieSeconds)],
        ['Destroyed this sortie', String(this.stats.targetsDestroyed - this.sortieKillsAtStart)],
        ['Rounds left', `${this.playerGuns.ammo} / ${fullAmmo(spec)}`],
      ],
    };
  }

  private clearLoss(): void {
    this.lostAt = null;
    this.lostReport = null;
    this.awaitingRespawn = false;
  }

  // ── The hangar ──────────────────────────────────────────────────────────

  /**
   * FLY: a new flight with the hangar's choices (also Enter on the crash
   * screen). From the hangar before a match (`newMatch`), it starts the match.
   */
  private flyFromHangar(newMatch = false): void {
    if (newMatch) this.startMatch();
    const selection = this.hangarSelection;
    this.noticeLoss();
    this.clearLoss();
    this.aircraft.setPreview(null);
    this.aircraft.setStartBase(BASES.find((b) => b.id === selection.baseId) ?? null);
    this.forgetLostStartBase();
    this.aircraft.respawnAtBase(selection.classId);
    this.stats.sortieStarted(this.clock);
    this.sortieSeconds = 0;
    this.sortieKillsAtStart = this.stats.targetsDestroyed;
    if (this.screen !== null) this.enter(null);
    // Too big for the deck: launched into the air over the carrier, whatever the start chosen.
    const base = this.aircraft.homeBase;
    this.startFlight(base.kind === 'carrier' && !hasTailhook(this.aircraft.spec) ? 'air' : selection.start);
    if (newMatch && this.match) {
      this.hud.showMessage(`MATCH ON · ${this.matchMinutes}:00 · take the islands' airfields: the side holding more bases when time runs out wins`, 'good', 7);
    }
  }

  /** Puts the aircraft where the chosen start says, with the right levers, and briefs the player. */
  private startFlight(start: StartMode): void {
    const { spec, homeBase } = this.aircraft;
    if (start === 'air') {
      this.aircraft.airStart(AIR_START_HEIGHT);
      this.afterTeleport(0.7);
      this.hud.showMessage(`${spec.displayName.toUpperCase()} · IN THE AIR over ${homeBase.name}`, 'good', 3);
      return;
    }
    if (start === 'approach') {
      this.aircraft.approachStart();
      const { approachThrottle, handsOffApproachSpeed } = this.aircraft.performance;
      this.afterTeleport(approachThrottle, 1);
      this.hud.showMessage(
        homeBase.kind === 'carrier'
          ? `CARRIER LANDING · ${(approachThrottle * 100).toFixed(0)}% throttle · ${(handsOffApproachSpeed * 3.6).toFixed(0)} km/h · hook down: touch down early, among the wires`
          : `LANDING PRACTICE · ${(approachThrottle * 100).toFixed(0)}% throttle · ${(handsOffApproachSpeed * 3.6).toFixed(0)} km/h · PAPI: 2 red, 2 white = on slope`,
        'good',
        LANDING_PRACTICE.briefingSeconds,
      );
      return;
    }
    this.afterTeleport(0);
    this.briefSpawn();
  }

  /** Stopped (no flight to keep): the hangar's aircraft and base choices put the parked aircraft there at once, to look at. */
  private parkForHangar(): void {
    this.aircraft.setStartBase(BASES.find((b) => b.id === this.hangarSelection.baseId) ?? null);
    this.aircraft.respawnAtBase(this.hangarSelection.classId);
    this.afterTeleport(0);
  }

  /** Every type with its figures, as the hangar compares them. */
  private hangarAircraftList(): HangarAircraft[] {
    return AIRCRAFT_CLASS_IDS.map((id, i) => {
      const spec = AIRCRAFT_CLASSES[id];
      const perf = computePerformance(spec);
      const gun = GUN_SPECS[id];
      const kmh = (v: number) => `${(v * 3.6).toFixed(0)} km/h`;
      // Damage per second with every gun firing.
      const firepower = spec.combat.gunCount * gun.roundsPerSecondPerGun * gun.damagePerRound;
      const bombs = spec.combat.bombCapacity;
      return {
        id,
        key: String(i + 1),
        name: spec.displayName,
        classTag: AIRCRAFT_CLASS_TAGS[id],
        role: AIRCRAFT_ROLES[id],
        ratings: [
          { name: 'Speed', value: perf.topSpeed, text: kmh(perf.topSpeed) },
          { name: 'Climb', value: perf.bestClimbRate, text: `${perf.bestClimbRate.toFixed(0)} m/s` },
          { name: 'Turn rate', value: perf.maxTurnRateDeg, text: `${perf.maxTurnRateDeg.toFixed(0)}°/s` },
          { name: 'Armour', value: spec.combat.maxHullHealth, text: `${spec.combat.maxHullHealth} hp` },
          { name: 'Firepower', value: firepower, text: `${firepower.toFixed(0)} dmg/s` },
          { name: 'Bombs', value: bombs, text: bombs > 0 ? String(bombs) : 'none' },
        ],
        loadout: [
          ['Guns', `${spec.combat.gunCount} × ${gun.roundsPerGun} rounds`],
          ['Bombs', bombs > 0 ? `${bombs}, armed later in Phase 4` : 'none'],
          ['Stall speed', kmh(perf.stallSpeed)],
          ['Gear', spec.airframe.fixedGear ? 'fixed' : 'retractable'],
          ['Carriers', hasTailhook(spec) ? (spec.homeBase === 'carrier' ? 'home: starts on the catapult' : 'can land on them') : 'no: too big'],
        ],
      };
    });
  }

  private readonly hangarEvents: HangarEvents = {
    aircraft: (id) => {
      // In a match the aircraft is fixed: only the base can change.
      if (this.lockedClassId && id !== this.lockedClassId) {
        this.hangar.flashLocked();
        return;
      }
      const choices = this.baseChoices(id);
      let baseId = this.hangarSelection.baseId;
      if (!choices.some((c) => c.base.id === baseId)) baseId = choices.find((c) => c.base.id === teamHome(PLAYER_TEAM).id)?.base.id ?? choices[0]?.base.id ?? baseId;
      this.hangarSelection = { ...this.hangarSelection, classId: id, paintId: this.aircraft.paint.schemeFor(id).id, baseId };
      if (this.hangarResumable) this.aircraft.setPreview(id);
      else this.parkForHangar();
      this.cameras.setShowcase(true, AIRCRAFT_CLASSES[id]);
      this.hangar.setBases(choices, baseId, this.mapFrame(describeBases(this.combat, this.carrierStatuses, PLAYER_TEAM)));
      this.hangar.setSelection(this.hangarSelection);
    },
    paint: (paintId) => {
      this.aircraft.paint.set(this.hangarSelection.classId, paintId);
      this.aircraft.refreshPaint();
      this.hangarSelection = { ...this.hangarSelection, paintId };
      this.hangar.setSelection(this.hangarSelection);
    },
    base: (base) => {
      this.hangarSelection = { ...this.hangarSelection, baseId: base.id };
      if (!this.hangarResumable) this.parkForHangar();
    },
    start: (start) => {
      this.hangarSelection = { ...this.hangarSelection, start };
      this.hangar.setSelection(this.hangarSelection);
    },
    matchLength: (minutes) => {
      this.matchMinutes = minutes;
      writeMatchMinutes(minutes);
    },
    fly: () => this.flyFromHangar(this.hangarKind === 'select'),
    back: () => {
      if (this.hangarReturn === 'pause') this.openPause();
      else if (this.hangarReturn === 'lobby') this.openLobby();
      else this.openMainMenu();
    },
  };

  /** Keys in the hangar: its shortcuts (aircraft 1-7, ← → base, Enter fly, Esc back). */
  private handleHangarKeys(esc: boolean, enter: boolean): void {
    const input = this.input;
    const type = CLASS_KEYS.find(([action]) => input.wasPressed(action))?.[1];
    if (type) this.hangarEvents.aircraft(type);
    for (const [action, direction] of [['pickerPrevious', -1], ['pickerNext', 1]] as const) {
      if (!input.wasPressed(action)) continue;
      const base = this.hangar.moveBase(direction);
      if (base) this.hangarEvents.base(base);
    }
    if (enter) this.flyFromHangar(this.hangarKind === 'select');
    else if (esc) this.hangarEvents.back();
  }

  // ── Settings ────────────────────────────────────────────────────────────

  /** Puts the settings into effect: every one changes something real. */
  private applySettings(): void {
    const { graphics, audio, controls, gameplay, accessibility } = this.settings;
    applyPixelRatio(this.engine, graphics.renderScale);
    this.engine.resize();
    if (this.pipeline) {
      // The pipeline renders off-screen, so its samples are the antialiasing (1 = none).
      this.pipeline.samples = Math.max(1, graphics.antialiasing);
      this.pipeline.bloomEnabled = graphics.bloom;
    }
    this.environment.setShadowQuality(graphics.shadows);
    this.audio.setVolume(audio.volume);
    this.cameras.setOrbitSensitivity(controls.cameraSensitivity);
    this.bindings = effectiveBindings(this.settings);
    this.input.setBindings(this.bindings);
    this.hud.setBindings(this.bindings);
    this.gamepad.invertPitch = controls.gamepadInvertPitch;
    this.beacons.visible = gameplay.baseLabels;
    const root = document.documentElement;
    if (accessibility.reducedMotion === 'system') delete root.dataset['reducedMotion'];
    else root.dataset['reducedMotion'] = String(accessibility.reducedMotion === 'on');
    root.style.setProperty('--text-scale', String(TEXT_SCALES[accessibility.textSize]));
    this.applyHudScale();
  }

  /** The HUD scale setting, capped so the bottom row of panels still fits the window. */
  private applyHudScale(): void {
    const fit = window.innerWidth / UI_CONFIG.hudRowWidth;
    document.documentElement.style.setProperty('--hud-scale', Math.min(this.settings.accessibility.hudScale, fit).toFixed(3));
  }

  /** An action's key(s) as the player has them, for messages: "P", "↑". */
  private keyName(action: InputAction): string {
    return this.bindings[action].map(formatKeyCode).join('/') || 'unbound';
  }

  /** A chosen base that is no longer yours (or is sinking) stops being where you start. */
  private forgetLostStartBase(): void {
    const chosen = this.aircraft.startBase;
    if (!chosen) return;
    const sinking = chosen.kind === 'carrier' && (this.carrierStatuses.get(chosen.id)?.sink ?? 0) > 0;
    if (this.combat.ownerOf(chosen) !== PLAYER_TEAM || sinking) this.aircraft.setStartBase(null);
  }

  /** The assist line: auto-land in the air; stopped on the ground, a pointer to the hangar. */
  private promptLine(): HudFrame['prompt'] {
    const state = this.aircraft.state;
    if (state.crashed || state.shotDown) return null;
    if (!this.autoLand && state.onGround) return this.isFlightInProgress() ? null : { active: false, text: 'Esc · pause menu: change base or paint' };
    return this.autoLandLine();
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
    FORWARD.rotateByQuaternionToRef(this.aircraft.renderOrientation, this.worldPoint);
    this.mouseFlight.aimAlong(this.worldPoint);
    this.mouseFlight.aimDirection(this.aimDirection);
    this.cameras.snapToTarget(this.aircraft.renderPosition, this.aircraft.renderOrientation, this.aimDirection);
  }

  /** Where the gun streams converge: the convergence distance straight ahead of the nose, on screen. */
  private projectGunsight(): ScreenPoint | null {
    const distance = GUN_SPECS[this.aircraft.spec.id].convergenceDistance;
    FORWARD.rotateByQuaternionToRef(this.aircraft.renderOrientation, this.worldPoint);
    this.worldPoint.scaleInPlace(distance).addInPlace(this.aircraft.renderPosition);
    return this.projectToScreen(this.worldPoint);
  }

  /**
   * Screen position (CSS pixels) of a world point, using this frame's camera
   * view-projection, so call it after scene.render(). Null in orbit view, when
   * crashed, or when the point is behind the camera.
   */
  /**
   * A label over each base far enough away to need finding: its name and
   * distance in its owner's colour (amber: defenceless, land to capture).
   * It sits just above the base, under its beacon's light.
   */
  private baseLabels(views: readonly BaseView[]): BaseLabel[] {
    const labels: BaseLabel[] = [];
    const p = this.aircraft.renderPosition;
    if (this.aircraft.state.crashed || !this.settings.gameplay.baseLabels) return labels;
    for (const view of views) {
      if (view.state === 'gone') continue;
      const distance = Math.hypot(view.x - p.x, view.z - p.z);
      if (distance < BEACON_CONFIG.labelMinDistance) continue;
      // An enemy carrier within 8 km already has its red bracket.
      if (view.base.kind === 'carrier' && view.owner !== PLAYER_TEAM && distance < 8_000) continue;
      this.markerPoint.set(view.x, view.y + BEACON_CONFIG.labelHeight, view.z);
      const screen = this.projectToScreen(this.markerPoint);
      if (!screen) continue;
      // Whose it is in words as well as colour.
      const status = view.state === 'open' ? ' · DEFENCELESS' : view.owner === null ? " · NOBODY'S" : view.owner === PLAYER_TEAM ? ' · YOURS' : ' · ENEMY';
      labels.push({
        x: screen.x,
        y: screen.y - 26,
        text: `${view.base.name.toUpperCase()}${status} ${(distance / 1000).toFixed(1)} km`,
        color: baseColor(view.owner, view.state === 'open'),
      });
    }
    return labels;
  }

  /**
   * Off the screen: where on an ellipse inside the screen's edges (clear of
   * the corner panels) an arrow should sit to point at `point`, and its
   * angle. Dead behind you, it points down.
   */
  private projectToEdge(point: Vector3, width: number, height: number): { x: number; y: number; angleDeg: number } | null {
    const camera = this.scene.activeCamera;
    if (!camera || this.cameras.mode === 'orbit' || this.aircraft.state.crashed) return null;
    camera.getDirectionToRef(Axis.X, this.cameraRight);
    camera.getDirectionToRef(Axis.Y, this.cameraUp);
    point.subtractToRef(camera.globalPosition, this.toPoint);
    let sx = Vector3.Dot(this.toPoint, this.cameraRight);
    let sy = -Vector3.Dot(this.toPoint, this.cameraUp);
    const length = Math.sqrt(sx * sx + sy * sy);
    if (length < 1e-3) {
      sx = 0;
      sy = 1;
    } else {
      sx /= length;
      sy /= length;
    }
    const rx = width * OFFSCREEN_ELLIPSE.x;
    const ry = height * (sy > 0 ? OFFSCREEN_ELLIPSE.down : OFFSCREEN_ELLIPSE.up);
    const t = 1 / Math.sqrt((sx / rx) ** 2 + (sy / ry) ** 2);
    return { x: width / 2 + sx * t, y: height / 2 + sy * t, angleDeg: (Math.atan2(sy, sx) * 180) / Math.PI };
  }

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
    if (input.wasPressed('toggleDebugOverlay')) this.debugOverlay.toggle();
    if (this.screen !== null) {
      this.handleScreenKeys();
      return;
    }
    if (input.wasPressed('openHangar')) {
      this.escapeFromFlight();
      return;
    }
    // Crashed: Enter flies again straight away, with the same choices.
    if (this.aircraft.state.crashed && input.wasPressed('pickerConfirm')) {
      this.flyFromHangar();
      return;
    }
    if (input.wasPressed('cycleCamera')) {
      this.cameras.cycleMode();
      this.aircraft.visual.setVisible(this.cameras.mode !== 'cockpit');
      // The orbit camera needs the mouse to drag; give the mouse back while orbiting.
      this.mouseFlight.captureAllowed = this.cameras.mode !== 'orbit';
      if (this.cameras.mode === 'orbit') this.mouseFlight.release();
    }
    if (input.wasPressed('autoLand')) this.toggleAutoLand();
    if (input.wasPressed('toggleMap')) this.miniMap.cycle();
    this.forgetLostStartBase();
    if (input.wasPressed('flapsDown')) this.flightInput.stepFlaps(1);
    if (input.wasPressed('flapsUp')) this.flightInput.stepFlaps(-1);
    if (input.wasPressed('toggleDiveBrakes')) {
      if (this.aircraft.spec.id === 'diveBomber') this.hud.showMessage(this.flightInput.toggleAirbrake() ? 'DIVE BRAKES OUT' : 'DIVE BRAKES IN', 'good', 2);
      else this.hud.showMessage(`The ${this.aircraft.spec.displayName} has no dive brakes to lock open: hold ${this.keyName('brake')} for air brakes`, 'ok', 3);
    }
  }

  /** After the aircraft jumps somewhere new: reset controls and loop, and snap the cameras instead of sweeping across the map. */
  private afterTeleport(throttle: number, flaps = this.aircraft.state.flapPosition): void {
    this.autoLand = null;
    this.autoLandBase = null;
    this.autoLandEnd = null;
    this.flightInput.reset(throttle, flaps);
    // A fresh aircraft has cold guns and a full load of ammunition.
    Object.assign(this.playerGuns, createGunState(this.aircraft.spec));
    Object.assign(this.service, createServiceStatus());
    this.wasCrashed = this.aircraft.state.crashed;
    Object.assign(this.steeringMemory, createSteeringAssistMemory());
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
      // CPU per subsystem against the 16.7 ms budget (render = submitting the frame; the GPU runs in parallel).
      ['CPU / frame', `${this.timings.total.toFixed(2)} of ${FRAME_BUDGET_MS.toFixed(1)} ms (worst ${this.timings.worstFrame.toFixed(1)})`],
      ['  sim + AI', `${this.timings.average('simulation').toFixed(2)} ms`],
      ['  visuals', `${this.timings.average('visuals').toFixed(2)} ms`],
      ['  render', `${this.timings.average('render').toFixed(2)} ms`],
      ['  HUD', `${this.timings.average('hud').toFixed(2)} ms`],
      ['Camera', this.cameras.mode],
      ['Mouse spikes', `${this.mouseFlight.spikesDropped} dropped`],
      ['AoA / slip', `${(t.angleOfAttack * RAD_TO_DEG).toFixed(1)}° / ${(t.sideslip * RAD_TO_DEG).toFixed(1)}°`],
      ['CL / CD', `${t.liftCoefficient.toFixed(2)} / ${t.dragCoefficient.toFixed(3)}`],
      ['Lift / weight', (t.lift / (this.aircraft.spec.mass * 9.81)).toFixed(2)],
      ['Thrust / drag', `${(t.thrust / 1000).toFixed(1)} / ${(t.drag / 1000).toFixed(1)} kN`],
      ['Separation', this.aircraft.state.flowSeparation.toFixed(2)],
      ['Rounds', `${this.combat.projectiles.activeCount} in flight, ${this.playerGuns.roundsFired} fired, ${this.playerGuns.ammo} left`],
      ['Sound', this.audio.started ? `${this.audio.isMuted ? 'muted' : 'on'}, level ${this.audio.level().toFixed(3)}` : 'waiting for a key press or click'],
      ['Stall speed', `${(this.aircraft.performance.stallSpeed * 3.6).toFixed(0)} km/h (1 g, sea level)`],
      ...this.aiForce.pilots.map((p): DebugLine => [`AI ${p.id - AI_FIRST_ID + 1}`, `${p.spec.id}: ${p.activity}${p.spawned ? ` · ${(p.state.position.y).toFixed(0)} m` : ''}`]),
    ];
  };

  private readonly handleResize = (): void => {
    applyPixelRatio(this.engine, this.settings.graphics.renderScale);
    this.engine.resize();
    this.applyHudScale();
  };
}

/** The hangar's choices from last time (the aircraft type, base and how to start); anything unknown falls back to the defaults. */
function readHangarSelection(): HangarSelection {
  const fallback: HangarSelection = { classId: DEFAULT_AIRCRAFT, paintId: 'olive', baseId: 'blue-carrier', start: 'runway' };
  try {
    const saved = JSON.parse(localStorage.getItem(HANGAR_STORAGE_KEY) ?? '{}') as Partial<HangarSelection>;
    const classId = saved.classId && saved.classId in AIRCRAFT_CLASSES ? saved.classId : fallback.classId;
    const start = saved.start === 'air' || saved.start === 'approach' || saved.start === 'runway' ? saved.start : fallback.start;
    const baseId = typeof saved.baseId === 'string' && BASES.some((b) => b.id === saved.baseId) ? saved.baseId : fallback.baseId;
    return { classId, paintId: fallback.paintId, baseId, start };
  } catch {
    return fallback;
  }
}

function writeHangarSelection(selection: HangarSelection): void {
  try {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ classId: selection.classId, baseId: selection.baseId, start: selection.start }));
  } catch {
    // Blocked storage: the choices just aren't remembered.
  }
}

const MATCH_LENGTH_KEY = 'dogfight.matchMinutes';

function readMatchMinutes(): number {
  try {
    const saved = Number(localStorage.getItem(MATCH_LENGTH_KEY));
    return (MATCH_CONFIG.lengthsMinutes as readonly number[]).includes(saved) ? saved : MATCH_CONFIG.defaultMinutes;
  } catch {
    return MATCH_CONFIG.defaultMinutes;
  }
}

function writeMatchMinutes(minutes: number): void {
  try {
    localStorage.setItem(MATCH_LENGTH_KEY, String(minutes));
  } catch {
    // Blocked storage: the choice lasts this visit only.
  }
}

function readCallsign(): string {
  try {
    return cleanCallsign(localStorage.getItem(UI_CONFIG.callsign.storageKey) ?? '') || UI_CONFIG.callsign.fallback;
  } catch {
    return UI_CONFIG.callsign.fallback;
  }
}

function writeCallsign(name: string): void {
  try {
    localStorage.setItem(UI_CONFIG.callsign.storageKey, name);
  } catch {
    // Blocked storage: the callsign lasts this visit only.
  }
}

const STEERING_KEY = 'dogfight.steering';

function readSteeringMode(): 'easy' | 'direct' {
  try {
    const saved = localStorage.getItem(STEERING_KEY);
    return saved === 'easy' || saved === 'direct' ? saved : STEERING_CONFIG.defaultMode;
  } catch {
    return STEERING_CONFIG.defaultMode;
  }
}

function writeSteeringMode(mode: 'easy' | 'direct'): void {
  try {
    localStorage.setItem(STEERING_KEY, mode);
  } catch {
    // Blocked storage: the choice just isn't remembered.
  }
}

import { getAttitude, stallAngles, type AircraftClassSpec, type AircraftState, type Attitude, type FlightControls } from '@dogfight/shared';
import type { TargetKind } from '@dogfight/shared';
import { formatKeyCode } from './ControlsHint';
import { KEY_BINDINGS, type KeyBindings } from '../config/controls';
import { TOUCHDOWN_GRADES, TOUCHDOWN_MESSAGE_SECONDS } from '../config/landing';
import { h, kbd, label, progress, setText, show, tag, type ProgressBar, type Tone } from './components';

/** Numbers refresh this often (s): readable, and cheap on the DOM. Warnings update every frame. */
const READOUT_INTERVAL = 0.05;
/** "PULL UP" when the ground is less than this many seconds away at the current sink rate. */
export const PULL_UP_SECONDS = 4;
/** Heading tape: pixels per degree, and its window width (px). */
const TAPE_PX_PER_DEG = 2;
const TAPE_WIDTH = 168;

/** Everything the HUD shows for one frame. */
export interface HudFrame {
  readonly state: Readonly<AircraftState>;
  readonly controls: Readonly<FlightControls>;
  readonly spec: AircraftClassSpec;
  /** Metres from the aircraft's wheels down to the terrain below. */
  readonly heightAboveGround: number;
  readonly flapNotchName: string;
  /** Where the aircraft is heading, in CSS pixels from the top-left of the view; null hides the marker. */
  readonly flightPathMarker: ScreenPoint | null;
  /** Where the gun streams converge, in CSS pixels; null hides the gunsight. */
  readonly gunsight: ScreenPoint | null;
  /** Mouse-flight aim point (where the aircraft is being steered), or null when not mouse flying. */
  readonly aimReticle: ScreenPoint | null;
  /** Where to put the gunsight to hit the nearest enemy aircraft ahead (the gun solution), or null. */
  readonly leadPoint: ScreenPoint | null;
  /** Rounds fired now would hit an enemy aircraft: the gunsight and aim circle turn red. */
  readonly onTarget: boolean;
  readonly guns: { readonly heat: number; readonly overheated: boolean; readonly ammo: number };
  /** A full load of ammunition for this aircraft (rounds). */
  readonly fullAmmo: number;
  /** Rearm-and-repair progress 0-1 while the ground crew works, else null. */
  readonly serviceProgress: number | null;
  /** The nearest friendly base: where to go to rearm. */
  readonly nearestBase: { readonly kind: 'airfield' | 'carrier'; readonly distance: number; readonly bearingDeg: number } | null;
  /** Enemy targets on screen within range, nearest first. */
  readonly enemyMarkers: readonly EnemyMarker[];
  /** Where your rounds would hit the ground if you fired now (strafing aim), or null. */
  readonly impactPoint: ScreenPoint | null;
  /** Approach guidance to a friendly base while on final with landing flaps, else null. */
  readonly approach: ApproachGuide | null;
  /** The nearest base you don't hold (to take or attack), or one you've just taken; or null. */
  readonly baseStatus: BaseStatus | null;
  /** The match: time left, and the bases each side holds (open: nobody's); null outside a match. */
  readonly match: { readonly secondsLeft: number; readonly blue: number; readonly red: number; readonly open: number } | null;
  /** Enemy aircraft you've shot down this match. */
  readonly kills: number;
  /** Bases on screen and far enough away to need finding, with their labels. */
  readonly baseLabels: readonly BaseLabel[];
  /** The assist line: auto-land flying a landing (`active`) or on offer (P); on the ground, a pointer to the hangar. Null: nothing to say. */
  readonly prompt: { readonly active: boolean; readonly text: string } | null;
}

/**
 * Where the aircraft is on its final approach: like a carrier's Landing
 * Signal Officer calling corrections, or an approach controller for a runway.
 */
export interface ApproachGuide {
  readonly kind: 'airfield' | 'carrier';
  /** Distance to go to the aim point (m). */
  readonly distance: number;
  /** Above (+) or below (-) the 3-degree glide slope (deg). */
  readonly glideDeviationDeg: number;
  /** Right (+) or left (-) of the extended centreline, seen from the aim point (deg). */
  readonly lineupDeg: number;
}

/** A base seen from far off: a diamond in its owner's colour with its name and distance, just above it. */
export interface BaseLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** CSS colour: the owner's, or amber for a defenceless enemy base. */
  readonly color: string;
}

/** A red bracket over an enemy target or aircraft, with what it is and how far. */
export interface EnemyMarker {
  readonly x: number;
  readonly y: number;
  readonly kind: TargetKind | 'aircraft';
  readonly distance: number;
  /** For an aircraft: its type ("INTERCEPTOR"). */
  readonly label?: string;
}

const MARKER_LABELS: Readonly<Record<TargetKind | 'aircraft', string>> = { aaGun: 'AA', parkedAircraft: 'AIRCRAFT', carrier: 'CARRIER', balloon: '', hangar: 'HANGAR', fuelDepot: 'FUEL', radar: 'RADAR', aircraft: 'AIRCRAFT' };

/** The base you're after (or have just taken), for the objective. */
export interface BaseStatus {
  readonly name: string;
  readonly distance: number;
  /** 'nobody': nobody holds it (land to take it); 'enemy': the other side's; 'yours': just captured. */
  readonly holder: 'nobody' | 'enemy' | 'yours';
  readonly defencesLeft: number;
  readonly defencesTotal: number;
  /** Capture progress 0-1 while you're capturing it, else null. */
  readonly capturing: number | null;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

const MAX_MARKERS = 16;
/** At most this many base labels at once (there are four bases). */
const MAX_BASE_LABELS = 6;
/** How long the gunsight glows red after a hit (s). */
const HIT_MARKER_SECONDS = 0.15;

/** A labelled readout: LABEL, a big value, a unit. */
interface Readout {
  readonly element: HTMLElement;
  readonly value: HTMLElement;
}

function readout(name: string, unit: string, className = ''): Readout {
  const value = h('span', 'ui-value hud-readout__value');
  const element = h('div', `hud-readout ${className}`, label(name), h('div', 'hud-readout__line', value, unit ? h('span', 'ui-unit', unit) : null));
  return { element, value };
}

/** A label-value row in a HUD panel. */
/** 75 -> "1:15". */
function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function row(name: string): { element: HTMLElement; value: HTMLElement } {
  const value = h('span', 'ui-value hud-row__value');
  return { element: h('div', 'hud-row', label(name), value), value };
}

/**
 * The flight HUD, drawn in HTML/CSS over the 3D view and organised in zones
 * that keep the middle of the screen clear:
 *
 *   top-left      STATUS: match time left, bases held by each side, kills, home base, objective
 *   top-centre    the radar map (MiniMap), approach calls under it
 *   bottom-left   AIRFRAME: hull integrity, damage, gear, flaps, what the aircraft is doing
 *   bottom-centre instruments: airspeed, altitude, heading tape, vertical speed, throttle
 *   bottom-right  WEAPONS: ammunition, gun heat, bombs, rearming
 *   centre        gunsight, flight-path marker, aim circle, target brackets, alerts
 *
 * Cyan instruments, amber for caution, red only for critical alerts. Numbers
 * refresh 20 times a second; only text that changes is rewritten, and bars
 * and markers move by transform.
 */
export class FlightHud {
  private readonly root: HTMLElement;
  // Status (top-left)
  private readonly timeLeft: HTMLElement;
  private readonly basesBlue: HTMLElement;
  private readonly basesRed: HTMLElement;
  private readonly basesOpen: HTMLElement;
  private readonly kills: HTMLElement;
  private readonly home: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveName: HTMLElement;
  private readonly objectiveState: HTMLElement;
  private readonly objectiveBar: ProgressBar;
  // Airframe (bottom-left)
  private readonly aircraftName: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hullValue: HTMLElement;
  private readonly hullBar: ProgressBar;
  private readonly damageTag: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly flaps: HTMLElement;
  // Instruments (bottom-centre)
  private readonly speed: Readout;
  private readonly altitude: Readout;
  private readonly vertical: Readout;
  private readonly throttle: Readout;
  private readonly throttleBar: ProgressBar;
  private readonly headingValue: HTMLElement;
  private readonly tapeStrip: HTMLElement;
  private readonly aoa: HTMLElement;
  private readonly load: HTMLElement;
  // Weapons (bottom-right)
  private readonly ammoValue: HTMLElement;
  private readonly ammoFull: HTMLElement;
  private readonly ammoBar: ProgressBar;
  private readonly heatValue: HTMLElement;
  private readonly heatBar: ProgressBar;
  private readonly bombsRow: HTMLElement;
  private readonly bombsValue: HTMLElement;
  private readonly rearm: HTMLElement;
  private readonly rearmBar: ProgressBar;
  private readonly weaponNote: HTMLElement;
  // Centre
  private readonly stallAlert: HTMLElement;
  private readonly pullUpAlert: HTMLElement;
  private readonly overheatAlert: HTMLElement;
  private readonly ammoAlert: HTMLElement;
  private readonly approach: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly message: HTMLElement;
  private readonly crashPanel: HTMLElement;
  private readonly crashTitle: HTMLElement;
  private readonly crashReason: HTMLElement;
  private readonly damageFlash: HTMLElement;
  private readonly gunsight: HTMLElement;
  private readonly aimReticle: HTMLElement;
  private readonly leadPoint: HTMLElement;
  private readonly flightPathMarker: HTMLElement;
  private readonly impactPoint: HTMLElement;
  private readonly markers: Array<{ box: HTMLElement; label: HTMLElement; text: string }> = [];
  private readonly baseLabelPool: Array<{ box: HTMLElement; text: string; color: string }> = [];

  private damageFlashTimer = 0;
  private bindings: KeyBindings = KEY_BINDINGS;
  private hitMarkerTimer = 0;
  private messageTimer = 0;
  private readonly attitude: Attitude = { headingDeg: 0, pitchDeg: 0, bankDeg: 0 };
  private sinceRefresh = READOUT_INTERVAL;
  private lastSeenTouchdown = 0;
  /** Gear position at the last readout refresh, to show which way it is moving. */
  private lastGear = 1;
  private gearWasLowering = false;
  private lastClass = '';

  constructor(parent: HTMLElement) {
    this.root = h('div', 'flight-hud');

    // ── Top-left: status ──
    const time = row('Time left');
    this.timeLeft = time.value;
    // Bases held: Blue's, Red's, and how many nobody holds.
    this.basesBlue = h('span', 'hud-score__blue');
    this.basesRed = h('span', 'hud-score__red');
    this.basesOpen = h('span', 'hud-score__open');
    const bases = h('div', 'hud-row', label('Bases'), h('span', 'ui-value hud-row__value hud-score', this.basesBlue, h('span', 'hud-score__dash', '–'), this.basesRed, this.basesOpen));
    const kills = row('Kills');
    const home = row('Home base');
    this.kills = kills.value;
    this.home = home.value;
    this.objectiveName = h('div', 'hud-objective__name');
    this.objectiveState = h('div', 'hud-objective__state');
    this.objectiveBar = progress();
    this.objective = h('div', 'hud-objective', label('Objective'), this.objectiveName, this.objectiveState, this.objectiveBar.element);
    const menuKey = KEY_BINDINGS.openHangar.map(formatKeyCode).join('/');
    const status = h(
      'section',
      'panel panel--hud hud-panel hud-zone hud-zone--tl',
      h('header', 'panel__header', label('Status'), tag('Blue · you', 'friendly')),
      h('div', 'panel__body', time.element, bases, kills.element, home.element, this.objective, h('div', 'hud-hint', kbd(menuKey), h('span', '', 'pause menu'))),
    );
    status.setAttribute('aria-label', 'Status');

    // ── Bottom-left: airframe ──
    this.aircraftName = h('span', 'ui-heading hud-aircraft-name');
    this.status = h('div', 'hud-status-line');
    this.hullValue = h('span', 'ui-value hud-hull__value');
    this.hullBar = progress(true);
    this.damageTag = tag('', 'caution');
    this.damageTag.hidden = true;
    const gear = row('Gear');
    const flaps = row('Flaps');
    this.gear = gear.value;
    this.flaps = flaps.value;
    const airframe = h(
      'section',
      'panel panel--hud hud-panel hud-zone hud-zone--bl',
      h('header', 'panel__header', this.aircraftName),
      h(
        'div',
        'panel__body',
        h('div', 'hud-hull', h('div', 'hud-hull__head', label('Hull integrity'), h('span', 'hud-hull__readout', this.hullValue, h('span', 'ui-unit', '%'))), this.hullBar.element, this.damageTag),
        gear.element,
        flaps.element,
        this.status,
      ),
    );
    airframe.setAttribute('aria-label', 'Airframe');

    // ── Bottom-centre: instruments ──
    this.speed = readout('Airspeed', 'km/h', 'hud-readout--primary');
    this.altitude = readout('Altitude', 'm', 'hud-readout--primary');
    this.vertical = readout('Vert speed', 'm/s');
    this.throttle = readout('Throttle', '%');
    this.throttleBar = progress();
    this.throttle.element.append(this.throttleBar.element);
    this.headingValue = h('span', 'ui-value hud-heading__value');
    this.tapeStrip = buildTapeStrip();
    const tape = h('div', 'hud-tape', this.tapeStrip, h('div', 'hud-tape__pointer'));
    const heading = h('div', 'hud-readout hud-heading', label('Heading'), this.headingValue, tape);
    this.aoa = h('span', 'ui-value');
    this.load = h('span', 'ui-value');
    const instruments = h(
      'section',
      'hud-zone hud-zone--bc hud-instruments',
      h('div', 'hud-instruments__row', this.speed.element, this.vertical.element, heading, this.throttle.element, this.altitude.element),
      h('div', 'hud-instruments__minor', label('AoA'), this.aoa, label('G'), this.load),
    );
    instruments.setAttribute('aria-label', 'Flight instruments');

    // ── Bottom-right: weapons ──
    this.ammoValue = h('span', 'ui-value hud-ammo__value');
    this.ammoFull = h('span', 'ui-unit');
    this.ammoBar = progress(true);
    this.heatValue = h('span', 'ui-value hud-row__value');
    this.heatBar = progress();
    this.bombsValue = h('span', 'ui-value hud-row__value');
    this.bombsRow = h('div', 'hud-row', label('Bombs'), this.bombsValue);
    this.rearmBar = progress();
    this.rearm = h('div', 'hud-rearm', h('div', 'hud-row', label('Rearming'), h('span', 'ui-value hud-row__value', '')), this.rearmBar.element);
    this.rearm.hidden = true;
    this.weaponNote = h('div', 'hud-weapon-note');
    const weapons = h(
      'section',
      'panel panel--hud hud-panel hud-zone hud-zone--br',
      h('header', 'panel__header', label('Weapons'), h('span', 'ui-label hud-weapon-select', 'Guns')),
      h(
        'div',
        'panel__body',
        h('div', 'hud-ammo', h('div', 'hud-hull__head', label('Ammunition'), h('span', 'hud-hull__readout', this.ammoValue, this.ammoFull)), this.ammoBar.element),
        h('div', 'hud-heat', h('div', 'hud-row', label('Gun heat'), this.heatValue), this.heatBar.element),
        this.bombsRow,
        this.rearm,
        this.weaponNote,
      ),
    );
    weapons.setAttribute('aria-label', 'Weapons');

    // ── Centre: alerts, approach calls, prompt and messages ──
    this.stallAlert = h('div', 'hud-alert', 'Stall');
    this.stallAlert.dataset['tone'] = 'danger';
    this.pullUpAlert = h('div', 'hud-alert', 'Pull up');
    this.pullUpAlert.dataset['tone'] = 'danger';
    this.overheatAlert = h('div', 'hud-alert hud-alert--steady', 'Guns overheated');
    this.overheatAlert.dataset['tone'] = 'caution';
    this.ammoAlert = h('div', 'hud-alert hud-alert--steady', 'Out of ammo · land at a base to rearm');
    this.ammoAlert.dataset['tone'] = 'caution';
    for (const alert of [this.stallAlert, this.pullUpAlert, this.overheatAlert, this.ammoAlert]) {
      alert.hidden = true;
      alert.setAttribute('role', 'alert');
    }
    const alerts = h('div', 'hud-alerts', this.stallAlert, this.pullUpAlert, this.overheatAlert, this.ammoAlert);
    this.approach = h('div', 'hud-approach');
    this.approach.hidden = true;
    this.prompt = h('div', 'hud-prompt');
    this.prompt.hidden = true;
    this.message = h('div', 'toast hud-message');
    this.message.hidden = true;
    this.message.setAttribute('role', 'status');
    const feed = h('div', 'hud-feed', this.prompt, this.message);

    // Crash card.
    this.crashTitle = h('div', 'ui-heading hud-crash__title', 'Crashed');
    this.crashReason = h('div', 'hud-crash__reason');
    this.crashPanel = h(
      'div',
      'hud-crash',
      this.crashTitle,
      this.crashReason,
      h('div', 'hud-crash__keys', kbd('Enter'), h('span', '', 'fly again'), kbd(menuKey), h('span', '', 'respawn options')),
    );
    this.crashPanel.hidden = true;
    this.crashPanel.setAttribute('role', 'alert');

    this.damageFlash = h('div', 'hud-damage-flash');
    this.damageFlash.hidden = true;

    // Symbols on the 3D view.
    this.gunsight = h('div', 'hud-gunsight');
    this.flightPathMarker = h('div', 'hud-fpm');
    this.aimReticle = h('div', 'hud-aim');
    this.impactPoint = h('div', 'hud-impact');
    this.leadPoint = h('div', 'hud-lead');
    for (const symbol of [this.gunsight, this.flightPathMarker, this.aimReticle, this.impactPoint, this.leadPoint]) symbol.hidden = true;
    const markerLayer = h('div', 'hud-markers');
    for (let i = 0; i < MAX_MARKERS; i++) {
      const markerLabel = h('div', 'hud-enemy__label');
      const box = h('div', 'hud-enemy', markerLabel);
      box.hidden = true;
      markerLayer.append(box);
      this.markers.push({ box, label: markerLabel, text: '' });
    }
    for (let i = 0; i < MAX_BASE_LABELS; i++) {
      const box = h('div', 'hud-base-label');
      box.hidden = true;
      markerLayer.append(box);
      this.baseLabelPool.push({ box, text: '', color: '' });
    }

    this.root.append(this.damageFlash, markerLayer, this.impactPoint, this.leadPoint, this.flightPathMarker, this.gunsight, this.aimReticle, status, airframe, instruments, weapons, this.approach, alerts, feed, this.crashPanel);
    parent.append(this.root);
  }

  /** Flash the screen edge red: you've been hit. */
  /** The keys in force (the player may have rebound them), for the hints the HUD shows. */
  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
  }

  registerDamage(seconds: number): void {
    this.damageFlashTimer = seconds;
  }

  /** Flash the gunsight: a round just hit something. */
  registerHit(): void {
    this.hitMarkerTimer = HIT_MARKER_SECONDS;
  }

  /** Removes the current message early (e.g. a briefing that no longer applies). */
  clearMessage(): void {
    this.messageTimer = 0;
  }

  /** Hidden while a menu or the hangar is open. */
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** A short notification above the instruments, e.g. a briefing or a touchdown grade. */
  showMessage(text: string, tone: 'good' | 'ok' | 'bad', seconds: number): void {
    setText(this.message, text);
    this.message.dataset['tone'] = tone === 'good' ? 'accent' : tone === 'bad' ? 'danger' : 'caution';
    this.messageTimer = seconds;
    // Restart the entrance animation.
    this.message.style.animation = 'none';
    void this.message.offsetWidth;
    this.message.style.animation = '';
  }

  update(deltaSeconds: number, frame: HudFrame): void {
    const { state, controls, spec, heightAboveGround } = frame;
    const t = state.telemetry;
    const sinking = -state.velocity.y;
    const airborne = !state.onGround && !state.crashed;

    // Alerts and symbols react every frame.
    show(this.stallAlert, airborne && t.stallWarning);
    show(this.pullUpAlert, airborne && sinking > 5 && heightAboveGround / sinking < PULL_UP_SECONDS);
    show(this.overheatAlert, frame.guns.overheated && !state.crashed);
    show(this.ammoAlert, frame.guns.ammo === 0 && !state.crashed && frame.serviceProgress === null);
    show(this.crashPanel, state.crashed);
    if (state.crashed) {
      setText(this.crashTitle, state.crashReason === 'shot down' ? 'Shot down' : 'Crashed');
      setText(this.crashReason, state.crashReason === 'shot down' ? 'Brought down by anti-aircraft fire' : `Cause: ${state.crashReason ?? 'unknown'}`);
    }
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - deltaSeconds);
    show(this.damageFlash, this.damageFlashTimer > 0);
    if (this.damageFlashTimer > 0) this.damageFlash.style.opacity = Math.min(1, this.damageFlashTimer * 4).toFixed(2);
    show(this.prompt, frame.prompt !== null && !state.crashed);
    if (frame.prompt) {
      setText(this.prompt, frame.prompt.text);
      this.prompt.dataset['state'] = frame.prompt.active ? 'active' : 'offer';
    }
    this.updateApproach(frame.approach);
    placeMarker(this.impactPoint, frame.impactPoint);
    this.markers.forEach((marker, i) => {
      const enemy = frame.enemyMarkers[i];
      placeMarker(marker.box, enemy ?? null);
      if (!enemy) return;
      marker.box.dataset['kind'] = enemy.kind;
      const text = `${enemy.label ?? MARKER_LABELS[enemy.kind]} ${formatDistance(enemy.distance)}`;
      if (text !== marker.text) {
        marker.text = text;
        marker.label.textContent = text;
      }
    });
    this.baseLabelPool.forEach((slot, i) => {
      const baseLabel = frame.baseLabels[i];
      placeMarker(slot.box, baseLabel ?? null);
      if (!baseLabel) return;
      if (baseLabel.text !== slot.text) {
        slot.text = baseLabel.text;
        slot.box.textContent = baseLabel.text;
      }
      if (baseLabel.color !== slot.color) {
        slot.color = baseLabel.color;
        slot.box.style.setProperty('--base-color', baseLabel.color);
      }
    });
    placeMarker(this.flightPathMarker, frame.flightPathMarker);
    placeMarker(this.gunsight, frame.gunsight);
    placeMarker(this.aimReticle, frame.aimReticle);
    placeMarker(this.leadPoint, frame.leadPoint);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - deltaSeconds);
    this.gunsight.classList.toggle('hud-gunsight--hit', this.hitMarkerTimer > 0);
    // On target: fire now and the rounds hit an enemy aircraft.
    this.gunsight.classList.toggle('hud-gunsight--on-target', frame.onTarget);
    this.aimReticle.classList.toggle('hud-aim--on-target', frame.onTarget);
    this.leadPoint.classList.toggle('hud-lead--on-target', frame.onTarget);
    this.updateTouchdownMessage(deltaSeconds, state);

    this.sinceRefresh += deltaSeconds;
    if (this.sinceRefresh < READOUT_INTERVAL) return;
    this.sinceRefresh = 0;
    this.refreshReadouts(frame, spec, controls, t, heightAboveGround);
  }

  dispose(): void {
    this.root.remove();
  }

  private refreshReadouts(frame: HudFrame, spec: AircraftClassSpec, controls: Readonly<FlightControls>, t: AircraftState['telemetry'], heightAboveGround: number): void {
    const state = frame.state;
    getAttitude(state.orientation, this.attitude);

    // Instruments.
    setText(this.speed.value, (t.airspeed * 3.6).toFixed(0));
    setText(this.altitude.value, Math.max(0, heightAboveGround).toFixed(0));
    setText(this.vertical.value, (state.velocity.y >= 0 ? '+' : '') + state.velocity.y.toFixed(1));
    setText(this.throttle.value, (controls.throttle * 100).toFixed(0));
    this.throttleBar.set(controls.throttle);
    const heading = (this.attitude.headingDeg + 360) % 360;
    setText(this.headingValue, `${heading.toFixed(0).padStart(3, '0')}°`);
    this.tapeStrip.style.transform = `translateX(${(TAPE_WIDTH / 2 - (heading + 180) * TAPE_PX_PER_DEG).toFixed(1)}px)`;
    const critical = (stallAngles(spec.aero).positive * 180) / Math.PI;
    const aoaDeg = (t.angleOfAttack * 180) / Math.PI;
    setText(this.aoa, `${aoaDeg.toFixed(1)}° / ${critical.toFixed(0)}°`);
    this.aoa.dataset['tone'] = aoaDeg > critical - 2 ? 'caution' : '';
    setText(this.load, t.loadFactor.toFixed(1));

    // Airframe.
    if (spec.id !== this.lastClass) {
      this.lastClass = spec.id;
      setText(this.aircraftName, spec.displayName);
    }
    const hullPercent = (100 * state.hullHealth) / spec.combat.maxHullHealth;
    setText(this.hullValue, hullPercent.toFixed(0));
    const hullTone: Tone = hullPercent < 30 ? 'danger' : hullPercent < 60 ? 'caution' : 'accent';
    this.hullBar.set(hullPercent / 100, hullTone);
    this.hullValue.dataset['tone'] = hullTone;
    const damage = state.shotDown ? 'Out of control' : hullPercent < 30 ? 'Critical damage' : hullPercent < 60 ? 'Damaged' : '';
    show(this.damageTag, damage !== '');
    if (damage) {
      setText(this.damageTag, damage);
      this.damageTag.dataset['tone'] = hullPercent < 30 || state.shotDown ? 'danger' : 'caution';
      this.damageTag.classList.toggle('tag--pulse', hullPercent < 30 || state.shotDown);
    }
    const gear = state.gearPosition;
    const lowering = gear > this.lastGear || (gear === this.lastGear && this.gearWasLowering);
    this.gearWasLowering = lowering;
    this.lastGear = gear;
    setText(this.gear, spec.airframe.fixedGear ? 'FIXED' : gear >= 0.999 ? 'DOWN' : gear <= 0.001 ? 'UP' : `${lowering ? '▼' : '▲'} ${Math.round(gear * 100)}%`);
    this.gear.dataset['tone'] = gear > 0.001 && gear < 0.999 ? 'caution' : '';
    setText(this.flaps, `${frame.flapNotchName} ${Math.round(state.flapPosition * 100)}%`);
    // Amber when the airflow is holding the flaps up.
    this.flaps.dataset['tone'] = controls.flaps > 0 && state.flapPosition < controls.flaps - 0.05 && t.airspeed > spec.flaps.maxExtensionSpeed ? 'caution' : '';
    setText(this.status, statusLine(state, controls));

    // Weapons.
    const ammoFraction = frame.fullAmmo > 0 ? frame.guns.ammo / frame.fullAmmo : 0;
    setText(this.ammoValue, String(frame.guns.ammo));
    setText(this.ammoFull, `/ ${frame.fullAmmo} rds`);
    const ammoTone: Tone = frame.guns.ammo === 0 ? 'danger' : ammoFraction < 0.2 ? 'caution' : 'accent';
    this.ammoBar.set(ammoFraction, ammoTone);
    this.ammoValue.dataset['tone'] = ammoTone;
    const heat = frame.guns.heat;
    setText(this.heatValue, frame.guns.overheated ? 'OVERHEAT' : `${Math.round(heat * 100)}%`);
    const heatTone: Tone = frame.guns.overheated ? 'danger' : heat > 0.7 ? 'caution' : 'accent';
    this.heatBar.set(heat, heatTone);
    this.heatValue.dataset['tone'] = heatTone === 'accent' ? '' : heatTone;
    show(this.bombsRow, spec.combat.bombCapacity > 0);
    if (spec.combat.bombCapacity > 0) setText(this.bombsValue, `${spec.combat.bombCapacity} racks · not armed yet`);
    show(this.rearm, frame.serviceProgress !== null);
    if (frame.serviceProgress !== null) {
      this.rearmBar.set(frame.serviceProgress, 'ok');
      const value = this.rearm.querySelector<HTMLElement>('.hud-row__value');
      if (value) setText(value, `${Math.round(frame.serviceProgress * 100)}%`);
    }
    setText(this.weaponNote, frame.guns.ammo === 0 && frame.serviceProgress === null ? 'Land and stop at a friendly base to rearm' : '');

    // Status.
    const match = frame.match;
    setText(this.timeLeft, match ? formatClock(match.secondsLeft) : '—');
    if (match && match.secondsLeft < 60) this.timeLeft.dataset['tone'] = 'caution';
    else delete this.timeLeft.dataset['tone'];
    setText(this.basesBlue, match ? String(match.blue) : '—');
    setText(this.basesRed, match ? String(match.red) : '—');
    setText(this.basesOpen, match && match.open > 0 ? ` · ${match.open} open` : '');
    setText(this.kills, String(frame.kills));
    const base = frame.nearestBase;
    setText(this.home, !base ? 'none' : base.distance === 0 ? 'ON BASE' : `${formatDistance(base.distance)} · ${base.bearingDeg.toFixed(0).padStart(3, '0')}°`);
    this.updateObjective(frame.baseStatus);
  }

  private updateObjective(status: BaseStatus | null): void {
    show(this.objective, status !== null);
    if (!status) return;
    let text: string;
    let fill: number;
    let tone: Tone;
    if (status.holder === 'yours') {
      const repairing = status.defencesLeft < status.defencesTotal;
      text = repairing ? 'Yours · crews building its defences' : 'Yours · its AA gun defends it for you';
      fill = status.defencesTotal > 0 ? status.defencesLeft / status.defencesTotal : 1;
      tone = 'friendly';
    } else if (status.capturing !== null) {
      text = `Capturing ${Math.round(status.capturing * 100)}% · stay stopped`;
      fill = status.capturing;
      tone = 'caution';
    } else if (status.holder === 'nobody') {
      text = `Nobody's · land and stop on it to take it · ${formatDistance(status.distance)}`;
      fill = 0;
      tone = 'accent';
    } else if (status.defencesLeft === 0) {
      text = 'Defenceless · land and stop on its runway';
      fill = 0;
      tone = 'caution';
    } else {
      text = `Defences ${status.defencesLeft}/${status.defencesTotal} · ${formatDistance(status.distance)}`;
      fill = 1 - status.defencesLeft / status.defencesTotal;
      tone = 'danger';
    }
    setText(this.objectiveName, status.name);
    setText(this.objectiveState, text);
    this.objectiveBar.set(fill, tone);
    this.objective.dataset['state'] = status.holder === 'yours' ? 'captured' : status.holder === 'nobody' || status.defencesLeft === 0 ? 'open' : 'defended';
  }

  /**
   * Corrections in plain words, as an LSO or approach controller would call
   * them. Glide slope: within 0.3 deg is on it; beyond 0.8 deg is high, or
   * low with a call for power. Line-up: within 1.2 deg is on the centreline.
   */
  private updateApproach(guide: ApproachGuide | null): void {
    show(this.approach, guide !== null);
    if (!guide) return;
    const d = guide.glideDeviationDeg;
    const glide: [string, string] =
      d > 0.8 ? ['High', 'caution'] : d > 0.3 ? ['A little high', ''] : d >= -0.3 ? ['On glide slope', 'ok'] : d >= -0.8 ? ['A little low', ''] : ['Low · power!', 'danger'];
    const l = guide.lineupDeg;
    const lineup: [string, string] = Math.abs(l) <= 1.2 ? ['On centreline', 'ok'] : l > 0 ? ['Come left', l > 4 ? 'caution' : ''] : ['Come right', l < -4 ? 'caution' : ''];
    const cut = guide.kind === 'carrier' && guide.distance < 70 && Math.abs(d) < 0.8 && Math.abs(l) < 2.5;
    const name = guide.kind === 'carrier' ? 'LSO' : 'Approach';
    const parts = cut
      ? `<span class="ui-label">${name}</span><span data-tone="ok">Cut · touch down</span>`
      : `<span class="ui-label">${name}</span><span class="ui-value">${formatDistance(guide.distance)}</span><span data-tone="${glide[1]}">${glide[0]}</span><span data-tone="${lineup[1]}">${lineup[0]}</span>`;
    if (this.approach.innerHTML !== parts) this.approach.innerHTML = parts;
  }

  /** Shows a grade for a few seconds after each touchdown: "Touchdown 1.2 m/s · smooth". */
  private updateTouchdownMessage(deltaSeconds: number, state: Readonly<AircraftState>): void {
    if (state.touchdownCount !== this.lastSeenTouchdown) {
      const isNewTouchdown = state.touchdownCount > this.lastSeenTouchdown;
      this.lastSeenTouchdown = state.touchdownCount;
      if (isNewTouchdown && !state.crashed) {
        const sink = state.lastTouchdownSinkRate;
        const grade = TOUCHDOWN_GRADES.find((g) => sink <= g.maxSinkRate) ?? TOUCHDOWN_GRADES[TOUCHDOWN_GRADES.length - 1];
        const damage = state.lastTouchdownDamage > 0 ? ` · hull −${state.lastTouchdownDamage.toFixed(0)}` : '';
        const brakeKey = this.bindings.brake.map(formatKeyCode).join('/') || 'the brake key';
        const stop = state.hookEngaged ? ' · caught a wire' : ` · hold ${brakeKey} to brake`;
        this.showMessage(`TOUCHDOWN ${sink.toFixed(1)} m/s · ${grade?.label ?? ''}${damage}${stop}`, grade?.tone ?? 'ok', TOUCHDOWN_MESSAGE_SECONDS);
      }
    }
    this.messageTimer = Math.max(0, this.messageTimer - deltaSeconds);
    show(this.message, this.messageTimer > 0 && !state.crashed);
  }
}

/** The heading tape's strip: ticks every 5 degrees (a CSS gradient), labels every 30, from -180 to 540 so it never runs out. */
function buildTapeStrip(): HTMLElement {
  const strip = h('div', 'hud-tape__strip');
  strip.style.width = `${720 * TAPE_PX_PER_DEG}px`;
  const cardinal: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let deg = -180; deg <= 540; deg += 30) {
    const wrapped = ((deg % 360) + 360) % 360;
    const mark = h('span', cardinal[wrapped] ? 'hud-tape__mark hud-tape__mark--cardinal' : 'hud-tape__mark', cardinal[wrapped] ?? String(wrapped / 10).padStart(2, '0'));
    mark.style.left = `${(deg + 180) * TAPE_PX_PER_DEG}px`;
    strip.append(mark);
  }
  return strip;
}

/** What the aircraft is doing, in a few words: on the catapult, held by a wire, braking, airborne... */
function statusLine(state: Readonly<AircraftState>, controls: Readonly<FlightControls>): string {
  if (state.crashed) return 'DESTROYED';
  if (state.shotDown) return 'SHOT DOWN · OUT OF CONTROL';
  const brakes = state.airbrakePosition > 0.05 ? ' · AIR BRAKES' : '';
  if (state.catapult === 'held') return 'ON CATAPULT · FULL THROTTLE TO LAUNCH';
  if (state.catapult === 'launching') return 'CATAPULT LAUNCH';
  if (state.hookEngaged) return Math.hypot(state.velocity.x, state.velocity.z) > 1 ? 'HOOK CAUGHT A WIRE' : 'ON THE WIRE · IDLE TO RELEASE';
  if (state.barrierEngaged) return Math.hypot(state.velocity.x, state.velocity.z) > 1 ? 'CAUGHT BY THE BARRIER' : 'IN THE BARRIER · IDLE TO RELEASE';
  if (state.onGround) return controls.brake > 0 ? 'ON GROUND · BRAKES' : 'ON GROUND';
  return `AIRBORNE${brakes}`;
}

/** "850 m" below a kilometre, "3.2 km" above. */
function formatDistance(metres: number): string {
  return metres < 1000 ? `${(metres / 10).toFixed(0)}0 m` : `${(metres / 1000).toFixed(1)} km`;
}

/** Centres a HUD symbol on a screen point, or hides it. */
function placeMarker(el: HTMLElement, position: ScreenPoint | null): void {
  show(el, position !== null);
  if (position) el.style.transform = `translate(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px) translate(-50%, -50%)`;
}

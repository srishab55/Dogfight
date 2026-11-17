import { getAttitude, stallAngles, type AircraftClassSpec, type AircraftState, type Attitude, type FlightControls } from '@dogfight/shared';
import { formatKeyCode } from './ControlsHint';
import { KEY_BINDINGS } from '../config/controls';
import { TOUCHDOWN_GRADES, TOUCHDOWN_MESSAGE_SECONDS } from '../config/landing';

/** Numbers refresh this often (s): readable, and cheap on the DOM. Warnings update every frame. */
const READOUT_INTERVAL = 0.05;
/** "PULL UP" when the ground is less than this many seconds away at the current sink rate. */
export const PULL_UP_SECONDS = 4;

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
  readonly guns: { readonly heat: number; readonly overheated: boolean; readonly ammo: number };
  /** A full load of ammunition for this aircraft (rounds). */
  readonly fullAmmo: number;
  /** Rearm-and-repair progress 0-1 while the ground crew works, else null. */
  readonly serviceProgress: number | null;
  /** The nearest friendly base: where to go to rearm. */
  readonly nearestBase: { readonly kind: 'airfield' | 'carrier'; readonly distance: number; readonly bearingDeg: number } | null;
  /** Approach guidance to a friendly base while on final with landing flaps, else null. */
  readonly approach: ApproachGuide | null;
  /** Practice balloons burst this session. */
  readonly targetsDestroyed: number;
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

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** How long the gunsight glows red after a hit (s). */
const HIT_MARKER_SECONDS = 0.15;

type Field = 'speed' | 'altitude' | 'vertical' | 'throttle' | 'flaps' | 'heading' | 'aoa' | 'g' | 'hull' | 'guns' | 'ammo' | 'base' | 'baseKind' | 'targets' | 'aircraft' | 'status';

/**
 * Flight instruments, drawn in HTML/CSS over the 3D view. Phase 4 adds gun
 * heat and bombs; Phase 6 adds scores, bases and the minimap.
 */
export class FlightHud {
  private readonly root: HTMLElement;
  private readonly fields: Record<Field, HTMLElement>;
  private readonly throttleBar: HTMLElement;
  private readonly stallWarning: HTMLElement;
  private readonly pullUpWarning: HTMLElement;
  private readonly crashPanel: HTMLElement;
  private readonly crashReason: HTMLElement;
  private readonly crashTitle: HTMLElement;
  /** Red flash around the screen edge when you're hit. */
  private readonly damageFlash: HTMLElement;
  private damageFlashTimer = 0;
  private readonly gunsight: HTMLElement;
  private readonly aimReticle: HTMLElement;
  private readonly gunHeatBar: HTMLElement;
  private readonly ammoBar: HTMLElement;
  private readonly overheatWarning: HTMLElement;
  private readonly outOfAmmoWarning: HTMLElement;
  private readonly service: HTMLElement;
  private readonly approach: HTMLElement;
  private readonly serviceBar: HTMLElement;
  private hitMarkerTimer = 0;
  private readonly flightPathMarker: HTMLElement;
  private readonly touchdownMessage: HTMLElement;
  private readonly attitude: Attitude = { headingDeg: 0, pitchDeg: 0, bankDeg: 0 };
  private sinceRefresh = READOUT_INTERVAL;
  private lastSeenTouchdown = 0;
  private touchdownMessageTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'flight-hud');
    const panel = element('div', 'hud-panel');
    const readout = (label: string, unit: string, unitElement?: HTMLElement) => {
      const row = element('div', 'hud-readout');
      const value = element('span', 'hud-value');
      row.append(element('span', 'hud-label', label), value, unitElement ?? element('span', 'hud-unit', unit));
      panel.append(row);
      return value;
    };
    const speed = readout('SPD', 'km/h');
    const altitude = readout('ALT', 'm');
    const vertical = readout('V/S', 'm/s');
    const throttle = readout('THR', '%');
    this.throttleBar = element('div', 'hud-throttle-fill');
    const throttleTrack = element('div', 'hud-throttle-track');
    throttleTrack.append(this.throttleBar);
    panel.append(throttleTrack);
    const flaps = readout('FLAP', '');
    const heading = readout('HDG', '°');
    const aoa = readout('AoA', '°');
    const g = readout('G', '');
    const hull = readout('HULL', '%');
    const guns = readout('GUN', 'heat');
    this.gunHeatBar = element('div', 'hud-throttle-fill hud-heat-fill');
    const gunHeatTrack = element('div', 'hud-throttle-track');
    gunHeatTrack.append(this.gunHeatBar);
    panel.append(gunHeatTrack);
    const ammo = readout('AMMO', 'rds');
    this.ammoBar = element('div', 'hud-throttle-fill hud-ammo-fill');
    const ammoTrack = element('div', 'hud-throttle-track');
    ammoTrack.append(this.ammoBar);
    panel.append(ammoTrack);
    const baseKind = element('span', 'hud-unit');
    const base = readout('BASE', '', baseKind);
    const targets = readout('TGT', 'burst');
    const aircraft = element('div', 'hud-aircraft');
    const status = element('div', 'hud-status');
    panel.append(aircraft, status);

    this.fields = { speed, altitude, vertical, throttle, flaps, heading, aoa, g, hull, guns, ammo, base, baseKind, targets, aircraft, status };
    this.stallWarning = element('div', 'hud-warning hud-warning-stall', 'STALL');
    this.pullUpWarning = element('div', 'hud-warning hud-warning-pullup', 'PULL UP');
    this.overheatWarning = element('div', 'hud-warning hud-warning-pullup', 'GUNS OVERHEATED');
    this.outOfAmmoWarning = element('div', 'hud-warning hud-warning-steady', 'OUT OF AMMO · LAND AT A BASE TO REARM');
    const warnings = element('div', 'hud-warnings');
    warnings.append(this.stallWarning, this.pullUpWarning, this.overheatWarning, this.outOfAmmoWarning);

    // Ground crew at work: rearming and repairing, with a progress bar.
    this.service = element('div', 'hud-service');
    this.serviceBar = element('div', 'hud-service-fill');
    const serviceTrack = element('div', 'hud-service-track');
    serviceTrack.append(this.serviceBar);
    this.service.append(element('div', 'hud-service-label', 'REARMING & REPAIRING'), serviceTrack);
    this.service.hidden = true;

    // Approach calls along the top: distance, glide slope, line-up.
    this.approach = element('div', 'hud-approach');
    this.approach.hidden = true;

    this.crashPanel = element('div', 'hud-crash');
    this.crashReason = element('div', 'hud-crash-reason');
    const respawnKey = KEY_BINDINGS.respawn.map(formatKeyCode).join(' / ');
    this.crashTitle = element('div', 'hud-crash-title', 'CRASHED');
    this.crashPanel.append(this.crashTitle, this.crashReason, element('div', 'hud-crash-hint', `Press ${respawnKey} to respawn`));
    this.damageFlash = element('div', 'hud-damage-flash');
    this.damageFlash.hidden = true;

    // Gunsight: where the gun streams converge. Put it on the target and fire.
    this.gunsight = element('div', 'hud-gunsight');
    this.gunsight.hidden = true;

    // Flight-path marker: where the aircraft is actually going, as opposed to where
    // the nose points. Put it on the runway touchdown zone and that's where you'll land.
    this.flightPathMarker = element('div', 'hud-fpm');
    this.flightPathMarker.hidden = true;

    this.touchdownMessage = element('div', 'hud-touchdown');
    this.touchdownMessage.hidden = true;

    // Mouse-flight aim circle: where the mouse is steering the aircraft. The gunsight chases it.
    this.aimReticle = element('div', 'hud-aim');
    this.aimReticle.hidden = true;

    this.root.append(this.damageFlash, warnings, panel, this.crashPanel, this.aimReticle, this.gunsight, this.flightPathMarker, this.touchdownMessage, this.service, this.approach);
    parent.append(this.root);
  }

  /** Flash the screen edge red: you've been hit. */
  registerDamage(seconds: number): void {
    this.damageFlashTimer = seconds;
  }

  /** Flash the gunsight: a round just hit something. */
  registerHit(): void {
    this.hitMarkerTimer = HIT_MARKER_SECONDS;
  }

  /** Removes the current message early (e.g. a briefing that no longer applies). */
  clearMessage(): void {
    this.touchdownMessageTimer = 0;
  }

  /** A short message in the centre-bottom of the screen, e.g. a briefing or a touchdown grade. */
  showMessage(text: string, tone: 'good' | 'ok' | 'bad', seconds: number): void {
    this.touchdownMessage.textContent = text;
    this.touchdownMessage.dataset['tone'] = tone;
    this.touchdownMessageTimer = seconds;
  }

  update(deltaSeconds: number, frame: HudFrame): void {
    const { state, controls, spec, heightAboveGround } = frame;
    const t = state.telemetry;
    const sinking = -state.velocity.y;
    const airborne = !state.onGround && !state.crashed;

    // Warnings and markers react every frame.
    toggle(this.stallWarning, airborne && t.stallWarning);
    toggle(this.pullUpWarning, airborne && sinking > 5 && heightAboveGround / sinking < PULL_UP_SECONDS);
    toggle(this.crashPanel, state.crashed);
    if (state.crashed) {
      this.crashTitle.textContent = state.crashReason === 'shot down' ? 'SHOT DOWN' : 'CRASHED';
      this.crashReason.textContent = state.crashReason === 'shot down' ? 'Brought down by anti-aircraft fire' : `Cause: ${state.crashReason ?? 'unknown'}`;
    }
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - deltaSeconds);
    toggle(this.damageFlash, this.damageFlashTimer > 0);
    if (this.damageFlashTimer > 0) this.damageFlash.style.opacity = Math.min(1, this.damageFlashTimer * 4).toFixed(2);
    toggle(this.overheatWarning, frame.guns.overheated && !state.crashed);
    toggle(this.outOfAmmoWarning, frame.guns.ammo === 0 && !state.crashed && frame.serviceProgress === null);
    toggle(this.service, frame.serviceProgress !== null);
    this.updateApproach(frame.approach);
    if (frame.serviceProgress !== null) this.serviceBar.style.width = `${(frame.serviceProgress * 100).toFixed(0)}%`;
    placeMarker(this.flightPathMarker, frame.flightPathMarker);
    placeMarker(this.gunsight, frame.gunsight);
    placeMarker(this.aimReticle, frame.aimReticle);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - deltaSeconds);
    this.gunsight.classList.toggle('hud-gunsight-hit', this.hitMarkerTimer > 0);
    this.updateTouchdownMessage(deltaSeconds, state);

    this.sinceRefresh += deltaSeconds;
    if (this.sinceRefresh < READOUT_INTERVAL) return;
    this.sinceRefresh = 0;

    getAttitude(state.orientation, this.attitude);
    const critical = (stallAngles(spec.aero).positive * 180) / Math.PI;
    const aoaDeg = (t.angleOfAttack * 180) / Math.PI;
    this.fields.speed.textContent = (t.airspeed * 3.6).toFixed(0);
    this.fields.altitude.textContent = Math.max(0, heightAboveGround).toFixed(0);
    this.fields.vertical.textContent = (state.velocity.y >= 0 ? '+' : '') + state.velocity.y.toFixed(1);
    this.fields.throttle.textContent = (controls.throttle * 100).toFixed(0);
    this.throttleBar.style.width = `${(controls.throttle * 100).toFixed(0)}%`;
    // Lever notch plus actual position; amber when the airflow is holding the flaps up.
    const flapPercent = Math.round(state.flapPosition * 100);
    this.fields.flaps.textContent = `${frame.flapNotchName} ${flapPercent}%`;
    this.fields.flaps.classList.toggle('hud-value-warn', controls.flaps > 0 && state.flapPosition < controls.flaps - 0.05 && t.airspeed > spec.flaps.maxExtensionSpeed);
    this.fields.heading.textContent = this.attitude.headingDeg.toFixed(0).padStart(3, '0');
    this.fields.aoa.textContent = `${aoaDeg.toFixed(1)} / ${critical.toFixed(0)}`;
    this.fields.g.textContent = t.loadFactor.toFixed(1);
    const hullPercent = (100 * state.hullHealth) / spec.combat.maxHullHealth;
    this.fields.hull.textContent = hullPercent.toFixed(0);
    this.fields.hull.classList.toggle('hud-value-warn', hullPercent < 60);
    const heatPercent = Math.round(frame.guns.heat * 100);
    this.fields.guns.textContent = frame.guns.overheated ? 'HOT' : `${heatPercent}%`;
    this.fields.guns.classList.toggle('hud-value-warn', frame.guns.overheated || heatPercent > 70);
    this.gunHeatBar.style.width = `${heatPercent}%`;
    this.gunHeatBar.classList.toggle('hud-heat-hot', frame.guns.overheated || heatPercent > 70);
    const ammoFraction = frame.fullAmmo > 0 ? frame.guns.ammo / frame.fullAmmo : 0;
    this.fields.ammo.textContent = `${frame.guns.ammo}`;
    this.fields.ammo.classList.toggle('hud-value-warn', ammoFraction < 0.2);
    this.ammoBar.style.width = `${(ammoFraction * 100).toFixed(0)}%`;
    this.ammoBar.classList.toggle('hud-heat-hot', ammoFraction < 0.2);
    const base = frame.nearestBase;
    this.fields.base.textContent = !base ? '—' : base.distance === 0 ? 'ON BASE' : `${formatDistance(base.distance)} ${base.bearingDeg.toFixed(0).padStart(3, '0')}°`;
    this.fields.baseKind.textContent = base ? (base.kind === 'carrier' ? 'CV' : 'AF') : '';
    this.fields.targets.textContent = `${frame.targetsDestroyed}`;
    this.fields.aircraft.textContent = spec.displayName;
    this.fields.status.textContent = statusLine(state, controls);
  }

  dispose(): void {
    this.root.remove();
  }

  /**
   * Corrections in plain words, as an LSO or approach controller would call
   * them. Glide slope: within 0.3 deg is on it; beyond 0.8 deg is high, or
   * low with a call for power. Line-up: within 1.2 deg is on the centreline.
   */
  private updateApproach(guide: ApproachGuide | null): void {
    toggle(this.approach, guide !== null);
    if (!guide) return;
    const d = guide.glideDeviationDeg;
    const glide: [string, string] =
      d > 0.8 ? ['HIGH', 'warn'] : d > 0.3 ? ['A LITTLE HIGH', 'ok'] : d >= -0.3 ? ['ON GLIDE SLOPE', 'good'] : d >= -0.8 ? ['A LITTLE LOW', 'ok'] : ['LOW · POWER!', 'bad'];
    const l = guide.lineupDeg;
    const lineup: [string, string] = Math.abs(l) <= 1.2 ? ['ON CENTRELINE', 'good'] : l > 0 ? ['COME LEFT', l > 4 ? 'warn' : 'ok'] : ['COME RIGHT', l < -4 ? 'warn' : 'ok'];
    const cut = guide.kind === 'carrier' && guide.distance < 70 && Math.abs(d) < 0.8 && Math.abs(l) < 2.5;
    const label = guide.kind === 'carrier' ? 'LSO' : 'APPROACH';
    const parts = cut
      ? `<span class="hud-approach-label">${label}</span><span data-tone="good">CUT · TOUCH DOWN</span>`
      : `<span class="hud-approach-label">${label}</span><span>${formatDistance(guide.distance)}</span><span data-tone="${glide[1]}">${glide[0]}</span><span data-tone="${lineup[1]}">${lineup[0]}</span>`;
    if (this.approach.innerHTML !== parts) this.approach.innerHTML = parts;
  }

  /** Shows a grade for a few seconds after each touchdown: "TOUCHDOWN 1.2 m/s · SMOOTH". */
  private updateTouchdownMessage(deltaSeconds: number, state: Readonly<AircraftState>): void {
    if (state.touchdownCount !== this.lastSeenTouchdown) {
      const isNewTouchdown = state.touchdownCount > this.lastSeenTouchdown;
      this.lastSeenTouchdown = state.touchdownCount;
      if (isNewTouchdown && !state.crashed) {
        const sink = state.lastTouchdownSinkRate;
        const grade = TOUCHDOWN_GRADES.find((g) => sink <= g.maxSinkRate) ?? TOUCHDOWN_GRADES[TOUCHDOWN_GRADES.length - 1];
        const damage = state.lastTouchdownDamage > 0 ? ` · hull −${state.lastTouchdownDamage.toFixed(0)}` : '';
        const brakeKey = KEY_BINDINGS.brake.map(formatKeyCode).join('/');
        const stop = state.hookEngaged ? ' · caught a wire' : ` · hold ${brakeKey} to brake`;
        this.showMessage(`TOUCHDOWN ${sink.toFixed(1)} m/s · ${grade?.label ?? ''}${damage}${stop}`, grade?.tone ?? 'ok', TOUCHDOWN_MESSAGE_SECONDS);
      }
    }
    this.touchdownMessageTimer = Math.max(0, this.touchdownMessageTimer - deltaSeconds);
    toggle(this.touchdownMessage, this.touchdownMessageTimer > 0 && !state.crashed);
  }
}

/** What the aircraft is doing, in a few words: on the catapult, held by a wire, braking, airborne... */
function statusLine(state: Readonly<AircraftState>, controls: Readonly<FlightControls>): string {
  if (state.crashed) return 'DESTROYED';
  if (state.shotDown) return 'SHOT DOWN · OUT OF CONTROL';
  const brakes = state.airbrakePosition > 0.05 ? ' · DIVE BRAKES' : '';
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

function element(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Centres a HUD symbol on a screen point, or hides it. */
function placeMarker(el: HTMLElement, position: ScreenPoint | null): void {
  toggle(el, position !== null);
  if (position) el.style.transform = `translate(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px) translate(-50%, -50%)`;
}

function toggle(el: HTMLElement, visible: boolean): void {
  if (el.hidden === !visible) return;
  el.hidden = !visible;
}

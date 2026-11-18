import type { AircraftClassId, BaseDefinition } from '@dogfight/shared';
import type { PaintId } from '../config/aircraftVisuals';
import { BaseMap, type BaseChoice } from './BaseMap';
import type { MapFrame } from './MiniMap';

/** An aircraft type as the hangar shows it. */
export interface HangarAircraft {
  readonly id: AircraftClassId;
  /** Its shortcut in the hangar ("1"-"7"). */
  readonly key: string;
  readonly name: string;
  /** One line: what it's for. */
  readonly role: string;
  /** Label, value pairs: top speed, stall speed, climb, guns... */
  readonly stats: ReadonlyArray<readonly [string, string]>;
}

export interface HangarPaint {
  readonly id: PaintId;
  readonly name: string;
  readonly body: string;
}

export type StartMode = 'runway' | 'air' | 'approach';
export type SteeringMode = 'easy' | 'direct';

/** What the player has chosen. */
export interface HangarSelection {
  readonly classId: AircraftClassId;
  readonly paintId: PaintId;
  readonly baseId: string;
  readonly start: StartMode;
}

export interface HangarSettings {
  readonly steering: SteeringMode;
  /** Mouse sensitivity (deg per pixel), and its range. */
  readonly sensitivity: number;
  readonly minSensitivity: number;
  readonly maxSensitivity: number;
  readonly soundOn: boolean;
}

/** Everything the hangar tells the game. */
export interface HangarEvents {
  aircraft(id: AircraftClassId): void;
  paint(id: PaintId): void;
  base(base: BaseDefinition): void;
  start(mode: StartMode): void;
  steering(mode: SteeringMode): void;
  sensitivity(value: number): void;
  sound(on: boolean): void;
  fly(): void;
  resume(): void;
}

const START_LABELS: Readonly<Record<StartMode, string>> = { runway: 'Runway', air: 'In the air', approach: 'Landing practice' };
const START_TITLES: Readonly<Record<StartMode, string>> = { runway: 'On the runway (or the catapult), ready to take off', air: '800 m up over the base', approach: 'On final approach, flaps down, to practise landing' };
const MAP_SIZE = 252;

/**
 * The hangar: everything you set up before flying, so the flight keys stay
 * few. Your aircraft (with its figures), its paint, the base to start from
 * (on a map), how to start, settings, and the controls. FLY (Enter) goes;
 * RESUME returns to a flight in progress. The 3D view behind it shows the
 * aircraft, the camera slowly circling it (drag to look around).
 */
export class Hangar {
  private readonly root: HTMLElement;
  private readonly aircraftButtons = new Map<AircraftClassId, HTMLElement>();
  private readonly paintButtons = new Map<PaintId, HTMLElement>();
  private readonly startButtons = new Map<StartMode, HTMLElement>();
  private readonly steeringButtons = new Map<SteeringMode, HTMLElement>();
  private readonly statsPanel: HTMLElement;
  private readonly baseInfo: HTMLElement;
  private readonly note: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityValue: HTMLElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly map: BaseMap;
  private soundOn = true;
  private sinceMapDraw = Infinity;

  constructor(
    parent: HTMLElement,
    background: HTMLCanvasElement,
    private readonly aircraft: readonly HangarAircraft[],
    paints: readonly HangarPaint[],
    controls: ReadonlyArray<{ readonly keys: readonly string[]; readonly label: string }>,
    private readonly events: HangarEvents,
  ) {
    this.root = el('div', 'hangar');
    this.root.hidden = true;

    // ── Left: the aircraft ──
    const left = el('div', 'hangar-panel hangar-left');
    left.append(el('div', 'hangar-title', 'HANGAR'), el('div', 'hangar-heading', 'AIRCRAFT'));
    const list = el('div', 'hangar-aircraft');
    for (const type of aircraft) {
      const button = el('button', 'hangar-aircraft-button');
      button.append(el('span', 'hangar-key', type.key), el('span', 'hangar-aircraft-name', type.name));
      button.addEventListener('click', () => this.events.aircraft(type.id));
      this.aircraftButtons.set(type.id, button);
      list.append(button);
    }
    this.statsPanel = el('div', 'hangar-stats');
    left.append(list, this.statsPanel);
    const controlsBox = document.createElement('details');
    controlsBox.className = 'hangar-controls';
    controlsBox.append(el('summary', '', 'CONTROLS IN FLIGHT'));
    for (const row of controls) {
      const line = el('div', 'hangar-control');
      for (const key of row.keys) line.append(el('kbd', '', key));
      line.append(` ${row.label}`);
      controlsBox.append(line);
    }
    left.append(controlsBox);

    // ── Right: paint, base, start, settings ──
    const right = el('div', 'hangar-panel hangar-right');
    right.append(el('div', 'hangar-heading', 'PAINT'));
    const swatches = el('div', 'hangar-swatches');
    for (const paint of paints) {
      const swatch = el('button', 'hangar-swatch');
      swatch.style.background = paint.body;
      swatch.title = paint.name;
      swatch.addEventListener('click', () => this.events.paint(paint.id));
      this.paintButtons.set(paint.id, swatch);
      swatches.append(swatch);
    }
    right.append(swatches);

    right.append(el('div', 'hangar-heading', 'START FROM'));
    this.map = new BaseMap(background, MAP_SIZE);
    this.map.onSelect = (base) => this.events.base(base);
    this.map.onConfirm = () => this.events.fly();
    this.baseInfo = el('div', 'hangar-base-info');
    right.append(this.map.canvas, this.baseInfo);

    right.append(el('div', 'hangar-heading', 'START'));
    const starts = el('div', 'hangar-options hangar-options-inline');
    for (const mode of ['runway', 'air', 'approach'] as const) {
      const button = el('button', 'hangar-option', START_LABELS[mode]);
      button.title = START_TITLES[mode];
      button.addEventListener('click', () => this.events.start(mode));
      this.startButtons.set(mode, button);
      starts.append(button);
    }
    right.append(starts);

    right.append(el('div', 'hangar-heading', 'SETTINGS'));
    const steering = el('div', 'hangar-setting');
    steering.append(el('span', 'hangar-setting-label', 'Steering'));
    const steeringOptions = el('div', 'hangar-options hangar-options-inline');
    for (const [mode, label] of [['easy', 'Easy turns'], ['direct', 'Direct roll']] as const) {
      const button = el('button', 'hangar-option', label);
      button.addEventListener('click', () => this.events.steering(mode));
      this.steeringButtons.set(mode, button);
      steeringOptions.append(button);
    }
    steering.append(steeringOptions);
    const mouse = el('div', 'hangar-setting');
    mouse.append(el('span', 'hangar-setting-label', 'Mouse'));
    this.sensitivityInput = document.createElement('input');
    this.sensitivityInput.type = 'range';
    this.sensitivityInput.className = 'hangar-slider';
    this.sensitivityInput.addEventListener('input', () => {
      const value = Number(this.sensitivityInput.value);
      this.sensitivityValue.textContent = `${value.toFixed(2)}°/px`;
      this.events.sensitivity(value);
    });
    this.sensitivityValue = el('span', 'hangar-setting-value');
    mouse.append(this.sensitivityInput, this.sensitivityValue);
    const sound = el('div', 'hangar-setting');
    sound.append(el('span', 'hangar-setting-label', 'Sound'));
    this.soundButton = el('button', 'hangar-option') as HTMLButtonElement;
    this.soundButton.addEventListener('click', () => this.events.sound(!this.soundOn));
    sound.append(this.soundButton);
    right.append(steering, mouse, sound);

    // ── Bottom: go ──
    const bottom = el('div', 'hangar-bottom');
    this.note = el('div', 'hangar-note');
    this.resumeButton = el('button', 'hangar-resume', 'RESUME (Esc)') as HTMLButtonElement;
    this.resumeButton.addEventListener('click', () => this.events.resume());
    const fly = el('button', 'hangar-fly', 'FLY  (Enter)');
    fly.addEventListener('click', () => this.events.fly());
    bottom.append(this.note, this.resumeButton, fly);

    this.root.append(left, right, bottom);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /**
   * @param canResume a flight is in progress, so RESUME is offered.
   * @param note shown above FLY, e.g. that FLY starts a new flight.
   */
  open(selection: HangarSelection, settings: HangarSettings, bases: readonly BaseChoice[], frame: MapFrame, canResume: boolean, note: string | null): void {
    this.root.hidden = false;
    this.resumeButton.hidden = !canResume;
    this.note.textContent = note ?? '';
    this.sensitivityInput.min = String(settings.minSensitivity);
    this.sensitivityInput.max = String(settings.maxSensitivity);
    this.sensitivityInput.step = '0.01';
    this.sensitivityInput.value = String(settings.sensitivity);
    this.sensitivityValue.textContent = `${settings.sensitivity.toFixed(2)}°/px`;
    this.setSteering(settings.steering);
    this.setSound(settings.soundOn);
    this.setBases(bases, selection.baseId, frame);
    this.setSelection(selection);
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Highlights the chosen aircraft, paint and start, and shows the aircraft's figures. */
  setSelection(selection: HangarSelection): void {
    for (const [id, button] of this.aircraftButtons) button.toggleAttribute('data-selected', id === selection.classId);
    for (const [id, button] of this.paintButtons) button.toggleAttribute('data-selected', id === selection.paintId);
    for (const [mode, button] of this.startButtons) button.toggleAttribute('data-selected', mode === selection.start);
    const type = this.aircraft.find((a) => a.id === selection.classId);
    this.statsPanel.replaceChildren();
    if (type) {
      this.statsPanel.append(el('div', 'hangar-stats-name', type.name), el('div', 'hangar-stats-role', type.role));
      const table = el('div', 'hangar-stats-table');
      for (const [label, value] of type.stats) table.append(el('span', 'hangar-stat-label', label), el('span', 'hangar-stat-value', value));
      this.statsPanel.append(table);
    }
  }

  /** The bases this aircraft can start from (changes with the type: carriers need a hook). */
  setBases(bases: readonly BaseChoice[], selectedId: string, frame: MapFrame): void {
    this.map.set(bases, selectedId, frame);
    this.showBase();
  }

  /** ← / →: the next base you can start from. Returns it. */
  moveBase(direction: 1 | -1): BaseDefinition | null {
    const choice = this.map.move(direction);
    this.showBase();
    return choice?.base ?? null;
  }

  setSteering(mode: SteeringMode): void {
    for (const [m, button] of this.steeringButtons) button.toggleAttribute('data-selected', m === mode);
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    this.soundButton.textContent = on ? 'On' : 'Off';
    this.soundButton.toggleAttribute('data-selected', on);
  }

  update(deltaSeconds: number, frame: MapFrame): void {
    if (!this.isOpen) return;
    this.sinceMapDraw += deltaSeconds;
    if (this.sinceMapDraw < 1 / 20) return;
    this.map.update(this.sinceMapDraw, frame);
    this.sinceMapDraw = 0;
    this.showBase();
  }

  dispose(): void {
    this.map.dispose();
    this.root.remove();
  }

  private showBase(): void {
    const choice = this.map.selected;
    this.baseInfo.replaceChildren();
    if (!choice) return;
    const name = el('span', 'hangar-base-name', choice.name);
    name.style.color = choice.color;
    this.baseInfo.append(name, el('span', 'hangar-base-detail', choice.detail));
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  if (element instanceof HTMLButtonElement) element.type = 'button';
  return element;
}

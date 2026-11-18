import type { AircraftClassId, BaseDefinition } from '@dogfight/shared';
import type { PaintId } from '../config/aircraftVisuals';
import { UI_CONFIG } from '../config/ui';
import { BaseMap, type BaseChoice } from './BaseMap';
import type { MapFrame } from './MiniMap';
import { button, dot, h, kbd, label, segmented, setText, statRow, tag, type Control } from './components';

/** An aircraft type as the hangar shows it. */
export interface HangarAircraft {
  readonly id: AircraftClassId;
  /** Its shortcut in the hangar ("1"-"7"). */
  readonly key: string;
  readonly name: string;
  /** Its class, as a tag: "Interceptor", "Vintage"... */
  readonly classTag: string;
  /** One line: what it's for. */
  readonly role: string;
  /**
   * Comparison figures. Each bar is the value over the best in the fleet, so
   * the bars compare the types; `text` is the exact figure.
   */
  readonly ratings: ReadonlyArray<{ readonly name: string; readonly value: number; readonly text: string }>;
  /** Weapons and handling facts: label, value. */
  readonly loadout: ReadonlyArray<readonly [string, string]>;
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

/** After a crash: what happened, and the aircraft's last state. */
export interface RespawnReport {
  readonly title: string;
  readonly cause: string;
  readonly lines: ReadonlyArray<readonly [string, string]>;
}

/**
 * Why the hangar is open. "select": before a flight (from the main menu or
 * lobby). "change": from the pause menu; `resumable` when a flight is in
 * progress, so FLY starts a new one. "respawn": after a crash.
 */
export type HangarMode = { readonly kind: 'select' } | { readonly kind: 'change'; readonly resumable: boolean } | { readonly kind: 'respawn'; readonly report: RespawnReport };

/** Everything the hangar tells the game. */
export interface HangarEvents {
  aircraft(id: AircraftClassId): void;
  paint(id: PaintId): void;
  base(base: BaseDefinition): void;
  start(mode: StartMode): void;
  /** Before a match: its length (minutes). */
  matchLength(minutes: number): void;
  fly(): void;
  back(): void;
}

/** What the hangar may change: in a match the aircraft is fixed (only the base and paint change). */
export interface HangarOptions {
  /** The aircraft locked in for the match, or null before it starts. */
  readonly lockedClassId: AircraftClassId | null;
  readonly matchMinutes: number;
  readonly matchLengths: readonly number[];
}

const START_OPTIONS = [
  { value: 'runway', label: 'Runway', tooltip: 'On the runway (or the catapult), ready to take off' },
  { value: 'air', label: 'In the air', tooltip: '800 m up over the base' },
  { value: 'approach', label: 'Landing', tooltip: 'On final approach, flaps down, to practise landing' },
] as const;

/**
 * The hangar: choose an aircraft (compared with the rest of the fleet), its
 * paint, the base to start from (on a map) and how to start; then FLY. The
 * 3D view between the columns shows the aircraft, the camera slowly circling
 * it (drag to look round). After a crash it's the respawn screen, with what
 * happened. The game is paused while it's open.
 */
export class Hangar {
  private readonly root: HTMLElement;
  private readonly cards = new Map<AircraftClassId, HTMLButtonElement>();
  private readonly swatches = new Map<PaintId, HTMLButtonElement>();
  private readonly title: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly backButton: HTMLButtonElement;
  private readonly flyButton: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly report: HTMLElement;
  private readonly detailTag: HTMLElement;
  private readonly detailName: HTMLElement;
  private readonly detailRole: HTMLElement;
  private readonly ratings: Array<ReturnType<typeof statRow>>;
  private readonly loadout: HTMLElement;
  private readonly paintName: HTMLElement;
  private readonly baseName: HTMLElement;
  private readonly baseDetail: HTMLElement;
  private readonly baseDot: HTMLElement;
  private readonly start: Control<StartMode>;
  private readonly lockTag: HTMLElement;
  private matchLength: Control<string> | null = null;
  private readonly matchSlot: HTMLElement;
  private noteText = '';
  private noteTimer: number | null = null;
  private readonly map: BaseMap;
  /** The best of each rating in the fleet, to scale the bars. */
  private readonly ratingMax: number[];
  private sinceMapDraw = Infinity;

  constructor(
    parent: HTMLElement,
    background: HTMLCanvasElement,
    private readonly aircraft: readonly HangarAircraft[],
    private readonly paints: readonly HangarPaint[],
    private readonly events: HangarEvents,
  ) {
    this.root = h('section', 'screen hangar');
    this.root.setAttribute('aria-label', 'Hangar');
    this.root.hidden = true;

    // ── Top bar ──
    this.backButton = button('Back', { variant: 'ghost', hint: 'Esc', onClick: () => this.events.back() });
    this.eyebrow = label('Hangar');
    this.title = h('h1', 'screen-title__name', 'Select aircraft');
    const bar = h('header', 'screen-bar', this.backButton, h('div', 'screen-title', this.eyebrow, this.title), h('span', 'chip screen-bar__end', dot('friendly'), 'Blue team'));

    // ── Left: the fleet, and where to start ──
    const cardGrid = h('div', 'hangar__cards');
    cardGrid.setAttribute('role', 'group');
    cardGrid.setAttribute('aria-label', 'Aircraft');
    for (const type of aircraft) {
      const card = h('button', 'card aircraft-card', h('span', 'aircraft-card__name', type.name), h('span', 'aircraft-card__meta', tag(type.classTag), kbd(type.key)));
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', () => this.events.aircraft(type.id));
      this.cards.set(type.id, card);
      cardGrid.append(card);
    }
    this.map = new BaseMap(background, UI_CONFIG.hangarMapSize);
    this.map.canvas.setAttribute('aria-label', 'Map: click a ringed base to start there');
    this.map.onSelect = (base) => {
      this.showBase();
      this.events.base(base);
    };
    this.map.onConfirm = () => this.events.fly();
    this.baseDot = dot();
    this.baseName = h('span', 'hangar__base-name');
    this.baseDetail = h('span', 'hangar__base-detail');
    this.start = segmented<StartMode>('How to start', START_OPTIONS, 'runway', (mode) => this.events.start(mode));
    this.start.element.classList.add('segmented--block');
    this.lockTag = tag('Locked for this match', 'caution');
    this.lockTag.dataset['tooltip'] = 'Your aircraft is fixed for the match. Exit to the main menu to choose another.';
    this.lockTag.hidden = true;
    const left = h(
      'aside',
      'screen-panel hangar__column hangar__left',
      h('div', 'section-head', label('Aircraft'), h('span', 'section-head__hint', kbd('1'), '–', kbd(String(aircraft.length))), this.lockTag),
      cardGrid,
      h('div', 'section-head', label('Deploy'), h('span', 'section-head__hint', kbd('←'), kbd('→'))),
      h('div', 'hangar__map', this.map.canvas),
      h('div', 'hangar__base', this.baseDot, this.baseName, this.baseDetail),
      h('div', 'section-head', label('Start')),
      this.start.element,
    );

    // ── Right: the chosen type ──
    this.detailTag = tag('');
    this.detailName = h('h2', 'hangar__name');
    this.detailRole = h('p', 'hangar__role');
    const ratingNames = aircraft[0]?.ratings.map((r) => r.name) ?? [];
    this.ratings = ratingNames.map((name) => statRow(name));
    this.ratingMax = ratingNames.map((_, i) => Math.max(...aircraft.map((a) => a.ratings[i]?.value ?? 0)));
    this.loadout = h('dl', 'facts');
    const swatchRow = h('div', 'swatches');
    swatchRow.setAttribute('role', 'group');
    swatchRow.setAttribute('aria-label', 'Paint');
    for (const paint of paints) {
      const swatch = h('button', 'swatch');
      swatch.style.setProperty('--swatch', paint.body);
      swatch.setAttribute('aria-label', paint.name);
      swatch.dataset['tooltip'] = paint.name;
      swatch.addEventListener('click', () => this.events.paint(paint.id));
      this.swatches.set(paint.id, swatch);
      swatchRow.append(swatch);
    }
    this.paintName = h('span', 'section-head__hint');
    const right = h(
      'aside',
      'screen-panel hangar__column hangar__right',
      h('div', 'hangar__identity', this.detailTag, this.detailName, this.detailRole),
      h('div', 'section-head', label('Performance'), h('span', 'section-head__hint', 'vs. the fleet')),
      h('div', 'hangar__ratings', ...this.ratings.map((r) => r.element)),
      h('div', 'section-head', label('Loadout')),
      this.loadout,
      h('div', 'section-head', label('Paint'), this.paintName),
      swatchRow,
    );

    // ── Respawn: what happened ──
    this.report = h('div', 'screen-panel hangar__report');
    this.report.setAttribute('role', 'status');
    this.report.hidden = true;

    // ── Bottom: go ──
    this.note = h('p', 'screen-footer__note');
    this.matchSlot = h('div', 'hangar__match');
    this.flyButton = button('Fly', { variant: 'primary', size: 'lg', hint: 'Enter', onClick: () => this.events.fly() });
    const footer = h('footer', 'screen-footer', this.note, this.matchSlot, this.flyButton);

    this.root.append(bar, left, this.report, right, footer);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(mode: HangarMode, selection: HangarSelection, bases: readonly BaseChoice[], frame: MapFrame, options: HangarOptions): void {
    this.root.hidden = false;
    this.root.dataset['mode'] = mode.kind;
    // In a match: only the locked type can be chosen.
    const locked = options.lockedClassId;
    this.lockTag.hidden = locked === null;
    for (const [id, card] of this.cards) {
      const off = locked !== null && id !== locked;
      card.toggleAttribute('aria-disabled', off);
      if (off) card.setAttribute('aria-disabled', 'true');
      if (off) card.dataset['tooltip'] = 'Locked for this match';
      else delete card.dataset['tooltip'];
    }
    // Before a match: how long it lasts.
    this.matchSlot.replaceChildren();
    if (mode.kind === 'select') {
      this.matchLength = segmented<string>(
        'Match length',
        options.matchLengths.map((m) => ({ value: String(m), label: `${m} min` })),
        String(options.matchMinutes),
        (value) => this.events.matchLength(Number(value)),
      );
      this.matchSlot.append(label('Match'), this.matchLength.element);
    }
    setText(this.eyebrow, mode.kind === 'respawn' ? 'Aircraft lost' : 'Hangar');
    setText(this.title, mode.kind === 'respawn' ? 'Respawn' : mode.kind === 'change' ? 'Change base' : 'Select aircraft');
    setText(this.backButton.firstElementChild as HTMLElement, mode.kind === 'respawn' ? 'Menu' : 'Back');
    setText(this.flyButton.firstElementChild as HTMLElement, mode.kind === 'respawn' ? 'Fly again' : 'Fly');
    this.noteText =
      mode.kind === 'change'
        ? mode.resumable
          ? 'FLY starts a new flight from the chosen base. Back returns to your paused flight.'
          : 'Your choices apply straight away. FLY takes off.'
        : mode.kind === 'respawn'
          ? 'Choose where to start, then fly again.'
          : 'Choose your aircraft for the match (it can\'t be changed once you fly), its paint and where to start.';
    setText(this.note, this.noteText);
    this.report.hidden = mode.kind !== 'respawn';
    if (mode.kind === 'respawn') {
      const r = mode.report;
      const facts = h('dl', 'facts');
      for (const [name, value] of r.lines) facts.append(h('dt', '', name), h('dd', '', value));
      this.report.replaceChildren(h('div', 'hangar__report-title', tag('Lost', 'danger'), h('h2', 'ui-heading', r.title)), h('p', 'hangar__report-cause', r.cause), facts);
    }
    this.setBases(bases, selection.baseId, frame);
    this.setSelection(selection);
    // Keyboard users start on FLY: Enter goes, Tab reaches the rest.
    this.flyButton.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Someone tried to pick another type mid-match: say why it can't be. */
  flashLocked(): void {
    setText(this.note, 'Your aircraft is fixed for this match. Exit to the main menu to choose another; the base can change.');
    this.note.dataset['tone'] = 'caution';
    if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => {
      setText(this.note, this.noteText);
      delete this.note.dataset['tone'];
      this.noteTimer = null;
    }, 3_500);
  }

  /** Highlights the chosen aircraft, paint and start, and shows the aircraft's figures. */
  setSelection(selection: HangarSelection): void {
    for (const [id, card] of this.cards) card.setAttribute('aria-pressed', String(id === selection.classId));
    for (const [id, swatch] of this.swatches) swatch.setAttribute('aria-pressed', String(id === selection.paintId));
    setText(this.paintName, this.paints.find((p) => p.id === selection.paintId)?.name ?? '');
    this.start.set(selection.start);
    const type = this.aircraft.find((a) => a.id === selection.classId);
    if (!type) return;
    setText(this.detailTag, type.classTag);
    setText(this.detailName, type.name);
    setText(this.detailRole, type.role);
    type.ratings.forEach((rating, i) => {
      const max = this.ratingMax[i] ?? 0;
      this.ratings[i]?.set(max > 0 ? rating.value / max : 0, rating.text);
    });
    this.loadout.replaceChildren();
    for (const [name, value] of type.loadout) this.loadout.append(h('dt', '', name), h('dd', '', value));
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
    setText(this.baseName, choice?.name ?? 'No base available');
    setText(this.baseDetail, choice?.detail ?? '');
    this.baseDot.style.background = choice?.color ?? '';
  }
}

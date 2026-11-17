import type { BaseDefinition } from '@dogfight/shared';
import { drawMap, mapPoint, type MapFrame } from './MiniMap';

/** One base you could take off from, as the picker lists it. */
export interface BaseChoice {
  readonly base: BaseDefinition;
  /** e.g. "Red airfield". */
  readonly name: string;
  /** e.g. "captured · 8.9 km". */
  readonly detail: string;
  /** CSS colour of its owner. */
  readonly color: string;
}

/** On-screen size of the picker's map (CSS px). */
const MAP_SIZE = 500;
/** A click within this of a base picks it (CSS px). */
const CLICK_RADIUS = 30;

/**
 * "Take off from", on the map: every base is shown in its owner's colour,
 * and the ones you can take off from (your own and any you've captured) are
 * ringed. Click one to select it (click it again, or "TAKE OFF HERE", to go),
 * or use ← / → and Enter. J closes it. The game decides when it may open
 * (stopped on the ground, or crashed) and what a pick does (`onTakeOff`).
 */
export class BasePicker {
  /** Called with the base to take off from. */
  onTakeOff: ((base: BaseDefinition) => void) | null = null;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly info: HTMLElement;
  private choices: readonly BaseChoice[] = [];
  private index = 0;
  private time = 0;
  private sinceRedraw = Infinity;
  private lastFrame: MapFrame | null = null;

  constructor(
    parent: HTMLElement,
    /** The terrain picture the map draws on (shared with the corner map). */
    private readonly background: HTMLCanvasElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'base-picker';
    this.root.hidden = true;
    const title = document.createElement('div');
    title.className = 'base-picker-title';
    title.textContent = 'TAKE OFF FROM';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'base-picker-map';
    const pixels = Math.round(MAP_SIZE * Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.canvas.style.width = `${MAP_SIZE}px`;
    this.canvas.style.height = `${MAP_SIZE}px`;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas for the base picker');
    this.context = context;
    this.canvas.addEventListener('click', this.handleClick);
    this.info = document.createElement('div');
    this.info.className = 'base-picker-info';
    const go = document.createElement('button');
    go.className = 'base-picker-go';
    go.type = 'button';
    go.textContent = 'TAKE OFF HERE';
    go.addEventListener('click', () => this.confirm());
    const keys = document.createElement('div');
    keys.className = 'base-picker-keys';
    keys.textContent = 'Click a ringed base · ← → choose · Enter: take off · J: close';
    const footer = document.createElement('div');
    footer.className = 'base-picker-footer';
    footer.append(this.info, go);
    this.root.append(title, this.canvas, footer, keys);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** The selected base, or null if the picker is closed. */
  get selected(): BaseDefinition | null {
    return this.isOpen ? (this.choices[this.index]?.base ?? null) : null;
  }

  open(choices: readonly BaseChoice[], selectedId: string | null, frame: MapFrame): void {
    this.choices = choices;
    this.index = Math.max(0, choices.findIndex((c) => c.base.id === selectedId));
    this.root.hidden = false;
    this.lastFrame = frame;
    this.sinceRedraw = Infinity;
    this.refresh();
  }

  /** Redraws the map (selection ring pulsing, base colours) while open. */
  update(deltaSeconds: number, frame: MapFrame): void {
    if (!this.isOpen) return;
    this.time += deltaSeconds;
    this.sinceRedraw += deltaSeconds;
    this.lastFrame = frame;
    if (this.sinceRedraw < 1 / 30) return;
    this.sinceRedraw = 0;
    this.draw();
  }

  move(direction: 1 | -1): void {
    if (!this.isOpen || this.choices.length === 0) return;
    this.index = (this.index + direction + this.choices.length) % this.choices.length;
    this.refresh();
  }

  confirm(): void {
    const base = this.selected;
    if (base) this.onTakeOff?.(base);
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.handleClick);
    this.root.remove();
  }

  private refresh(): void {
    const choice = this.choices[this.index];
    this.info.replaceChildren();
    if (choice) {
      const name = document.createElement('span');
      name.className = 'base-picker-name';
      name.textContent = choice.name;
      name.style.color = choice.color;
      const detail = document.createElement('span');
      detail.className = 'base-picker-detail';
      detail.textContent = choice.detail;
      this.info.append(name, detail);
    }
    this.draw();
  }

  private draw(): void {
    if (!this.lastFrame) return;
    drawMap(this.context, this.background, this.lastFrame, {
      large: true,
      unit: this.canvas.width / MAP_SIZE,
      time: this.time,
      choice: { selectable: this.choices.map((c) => c.base.id), selected: this.selected?.id ?? null },
    });
  }

  /** Click a base to select it; click the selected base again to take off there. */
  private readonly handleClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * MAP_SIZE;
    const py = ((event.clientY - rect.top) / rect.height) * MAP_SIZE;
    let best = -1;
    let bestDistance = CLICK_RADIUS;
    this.choices.forEach((choice, i) => {
      const c = choice.base.runway.center;
      const p = mapPoint(c.x, c.z, MAP_SIZE);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) return;
    if (best === this.index) this.confirm();
    else {
      this.index = best;
      this.refresh();
    }
  };
}


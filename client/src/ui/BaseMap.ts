import type { BaseDefinition } from '@dogfight/shared';
import { drawMap, mapPoint, type MapFrame } from './MiniMap';

/** One base you could take off from. */
export interface BaseChoice {
  readonly base: BaseDefinition;
  /** e.g. "Red airfield". */
  readonly name: string;
  /** e.g. "captured · 8.9 km". */
  readonly detail: string;
  /** CSS colour of its owner. */
  readonly color: string;
}

/** A click within this of a base picks it (CSS px). */
const CLICK_RADIUS = 30;

/**
 * A map to choose a base on: every base in its owner's colour, the ones you
 * may choose ringed (the selected one pulsing). Click a ringed base to
 * select it; clicking the selected one again "confirms" it.
 */
export class BaseMap {
  /** A different base was selected. */
  onSelect: ((base: BaseDefinition) => void) | null = null;
  /** The selected base was clicked again. */
  onConfirm: ((base: BaseDefinition) => void) | null = null;
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private choices: readonly BaseChoice[] = [];
  private selectedId: string | null = null;
  private frame: MapFrame | null = null;
  private time = 0;

  constructor(
    /** The terrain picture (shared with the corner map). */
    private readonly background: HTMLCanvasElement,
    /** On-screen size (CSS px). */
    private readonly size: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'base-map';
    const pixels = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas for the base map');
    this.context = context;
    this.canvas.addEventListener('click', this.handleClick);
  }

  get selected(): BaseChoice | null {
    return this.choices.find((c) => c.base.id === this.selectedId) ?? null;
  }

  set(choices: readonly BaseChoice[], selectedId: string | null, frame: MapFrame): void {
    this.choices = choices;
    this.selectedId = choices.some((c) => c.base.id === selectedId) ? selectedId : (choices[0]?.base.id ?? null);
    this.frame = frame;
    this.draw();
  }

  /** Selects the next (+1) or previous (-1) base you can choose. */
  move(direction: 1 | -1): BaseChoice | null {
    if (this.choices.length === 0) return null;
    const index = Math.max(0, this.choices.findIndex((c) => c.base.id === this.selectedId));
    const next = this.choices[(index + direction + this.choices.length) % this.choices.length] ?? null;
    this.selectedId = next?.base.id ?? null;
    this.draw();
    return next;
  }

  /** Redraws with the latest frame (pulsing ring, base colours). */
  update(deltaSeconds: number, frame: MapFrame): void {
    this.time += deltaSeconds;
    this.frame = frame;
    this.draw();
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.handleClick);
  }

  private draw(): void {
    if (!this.frame) return;
    drawMap(this.context, this.background, this.frame, {
      large: true,
      unit: this.canvas.width / this.size,
      time: this.time,
      choice: { selectable: this.choices.map((c) => c.base.id), selected: this.selectedId },
    });
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * this.size;
    const py = ((event.clientY - rect.top) / rect.height) * this.size;
    let best: BaseChoice | null = null;
    let bestDistance = CLICK_RADIUS;
    for (const choice of this.choices) {
      const c = choice.base.runway.center;
      const p = mapPoint(c.x, c.z, this.size);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestDistance) {
        best = choice;
        bestDistance = d;
      }
    }
    if (!best) return;
    if (best.base.id === this.selectedId) this.onConfirm?.(best.base);
    else {
      this.selectedId = best.base.id;
      this.draw();
      this.onSelect?.(best.base);
    }
  };
}

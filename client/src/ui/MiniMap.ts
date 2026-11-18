import { CARRIERS, RUNWAYS, WORLD_CONFIG, type Terrain } from '@dogfight/shared';
import type { BaseView } from '../combat/baseViews';
import { BASE_COLORS, MINIMAP_CONFIG } from '../config/map';

export type MapMode = 'small' | 'large' | 'off';

export interface MapFrame {
  /** Where you are and which way you're heading (deg, clockwise from north); null while crashed. */
  readonly player: { readonly x: number; readonly z: number; readonly headingDeg: number } | null;
  readonly bases: readonly BaseView[];
  readonly playerTeam: 'blue' | 'red';
}

const MODES: readonly MapMode[] = ['small', 'large', 'off'];

/**
 * A top-down map of the islands (north up): the terrain, runways and
 * carriers, every base as a dot in its owner's colour (amber, blinking:
 * defenceless, capture it; grey cross: a sunk carrier), and you as an arrow.
 * A small one in the corner, a big one in the middle, or none (N cycles).
 */
export class MiniMap {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly legend: HTMLElement;
  /** The terrain and runways, drawn once. */
  private readonly background: HTMLCanvasElement;
  private mode: MapMode;
  private sinceRedraw = Infinity;
  private time = 0;
  private suppressed = false;

  constructor(parent: HTMLElement, background: HTMLCanvasElement) {
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas for the map');
    this.context = context;
    this.legend = document.createElement('div');
    this.legend.className = 'minimap-legend';
    this.legend.innerHTML = `<span style="color:${BASE_COLORS.blue}">● Blue</span><span style="color:${BASE_COLORS.red}">● Red</span><span style="color:${BASE_COLORS.open}">● Defenceless: land to capture</span><span>▲ You</span><span class="minimap-key">N: map size</span>`;
    this.root.append(this.canvas, this.legend);
    parent.append(this.root);
    this.background = background;
    this.mode = readMode();
    this.applyMode();
  }

  /** Hidden while the hangar is open (it has its own map). */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.root.hidden = suppressed || this.mode === 'off';
  }

  /** Small → large → off → small. Returns the new mode, and remembers it. */
  cycle(): MapMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length] ?? 'small';
    try {
      localStorage.setItem(MINIMAP_CONFIG.storageKey, this.mode);
    } catch {
      // Storage can be unavailable; the setting just won't persist.
    }
    this.applyMode();
    return this.mode;
  }

  update(deltaSeconds: number, frame: MapFrame): void {
    this.time += deltaSeconds;
    this.sinceRedraw += deltaSeconds;
    if (this.mode === 'off' || this.sinceRedraw < 1 / MINIMAP_CONFIG.redrawHz) return;
    this.sinceRedraw = 0;
    this.draw(frame);
  }

  dispose(): void {
    this.root.remove();
  }

  private applyMode(): void {
    this.root.hidden = this.suppressed || this.mode === 'off';
    this.root.dataset['mode'] = this.mode;
    const css = this.mode === 'large' ? MINIMAP_CONFIG.largeSize : MINIMAP_CONFIG.smallSize;
    const pixels = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    this.sinceRedraw = Infinity;
  }

  private draw(frame: MapFrame): void {
    const large = this.mode === 'large';
    drawMap(this.context, this.background, frame, { large, unit: this.canvas.width / (large ? MINIMAP_CONFIG.largeSize : MINIMAP_CONFIG.smallSize), time: this.time });
  }
}

export interface MapDrawOptions {
  /** Labels and bigger symbols. */
  readonly large: boolean;
  /** Device pixels per CSS pixel. */
  readonly unit: number;
  /** For blinking (s). */
  readonly time: number;
  /** The base picker: which bases can be chosen (others dimmed), and which one is selected. */
  readonly choice?: { readonly selectable: readonly string[]; readonly selected: string | null };
}

/** Map position (canvas pixels) of world (x, z), north up. */
export function mapPoint(x: number, z: number, size: number): { x: number; y: number } {
  const e = MINIMAP_CONFIG.halfExtent;
  return { x: ((x + e) / (2 * e)) * size, y: ((e - z) / (2 * e)) * size };
}

/** World (x, z) at a map position (canvas pixels). */
export function worldPoint(px: number, py: number, size: number): { x: number; z: number } {
  const e = MINIMAP_CONFIG.halfExtent;
  return { x: (px / size) * 2 * e - e, z: e - (py / size) * 2 * e };
}

/** Draws the whole map into `ctx` (its canvas's full size): terrain, carriers, bases, you. */
export function drawMap(ctx: CanvasRenderingContext2D, background: HTMLCanvasElement, frame: MapFrame, options: MapDrawOptions): void {
  const size = ctx.canvas.width;
  const { large, unit, time, choice } = options;
  const metresToPx = size / (2 * MINIMAP_CONFIG.halfExtent);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(background, 0, 0, size, size);

  // Carriers: the hull to scale (at least a few pixels).
  for (const carrier of CARRIERS) {
    const view = frame.bases.find((v) => v.base.id === carrier.id);
    const p = mapPoint(carrier.center.x, carrier.center.z, size);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((carrier.headingDegrees * Math.PI) / 180);
    const length = Math.max(10 * unit, carrier.deckLength * metresToPx);
    const width = Math.max(3.5 * unit, carrier.deckWidth * metresToPx);
    ctx.fillStyle = view?.state === 'gone' ? 'rgba(120, 130, 140, 0.35)' : '#9aa3ab';
    ctx.fillRect(-width / 2, -length / 2, width, length);
    ctx.restore();
  }

  // Bases: a dot in the owner's colour.
  const blinkOn = Math.cos(time * Math.PI * 2 * 1.2) > -0.3;
  ctx.font = `${Math.round(11 * unit)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  for (const view of frame.bases) {
    const { x, y } = mapPoint(view.x, view.z, size);
    const r = (large ? 9 : 6) * unit;
    const selectable = choice?.selectable.includes(view.base.id) ?? true;
    const selected = choice?.selected === view.base.id;
    ctx.globalAlpha = selectable ? 1 : 0.4;
    if (view.state === 'gone') {
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    } else {
      const color = view.state === 'open' ? BASE_COLORS.open : BASE_COLORS[view.owner];
      if (view.state === 'open' && !blinkOn) ctx.globalAlpha *= 0.35;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5 * unit;
      ctx.beginPath();
      if (view.base.kind === 'carrier') ctx.rect(x - r, y - r, 2 * r, 2 * r);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The picker: a ring round each base you can choose, a pulsing one round the selected base.
    if (choice && selectable) {
      ctx.strokeStyle = selected ? '#ffffff' : 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = (selected ? 3 : 1.5) * unit;
      ctx.beginPath();
      ctx.arc(x, y, r + (selected ? 7 + 2.5 * Math.sin(time * 6) : 5) * unit, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (large) {
      const label = view.state === 'gone' ? `${view.base.name} (sunk)` : view.state === 'open' ? `${view.base.name}: defenceless` : view.owner !== view.base.team ? `${view.base.name}: captured by ${view.owner}` : view.base.name;
      ctx.font = `${selected ? 'bold ' : ''}${Math.round(11 * unit)}px ui-monospace, Menlo, monospace`;
      ctx.globalAlpha = selectable ? 1 : 0.5;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillText(label, x + unit, y - r - 9 * unit + unit);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, y - r - 9 * unit);
      ctx.globalAlpha = 1;
    }
  }

  // You: an arrow pointing where you're heading.
  if (frame.player) {
    const p = mapPoint(frame.player.x, frame.player.z, size);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((frame.player.headingDeg * Math.PI) / 180);
    const s = (large ? 9 : 7) * unit;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.65, s * 0.75);
    ctx.lineTo(0, s * 0.35);
    ctx.lineTo(-s * 0.65, s * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5 * unit;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // North.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `bold ${Math.round(11 * unit)}px ui-monospace, Menlo, monospace`;
  ctx.fillText('N', size - 10 * unit, 14 * unit);
}

/** The terrain seen from above, hill-shaded, with the runways: drawn once, shared by the map and the base picker. */
export function renderMapBackground(terrain: Terrain): HTMLCanvasElement {
  const c = MINIMAP_CONFIG;
  const n = c.backgroundResolution;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const heights = new Float32Array(n * n);
  const metresPerPixel = (2 * c.halfExtent) / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -c.halfExtent + (i + 0.5) * metresPerPixel;
      const z = c.halfExtent - (j + 0.5) * metresPerPixel;
      heights[j * n + i] = terrain.heightAt(x, z);
    }
  }
  const image = ctx.createImageData(n, n);
  const deep = hex(c.deepSea);
  const shallow = hex(c.shallowSea);
  const beach = hex(c.beach);
  const low = hex(c.lowland);
  const high = hex(c.highland);
  const peak = hex(c.peak);
  const sea = WORLD_CONFIG.seaLevel;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = heights[j * n + i] ?? sea;
      let color: [number, number, number];
      if (h < sea) {
        color = mix(shallow, deep, Math.min(1, (sea - h) / 25));
      } else {
        const above = h - sea;
        if (above < 4) color = beach;
        else {
          const t = Math.min(1, above / c.peakHeight);
          color = t < 0.45 ? mix(low, high, t / 0.45) : mix(high, peak, (t - 0.45) / 0.55);
        }
        // Hill shading, lit from the north-west: brighter where the ground
        // rises to the east or the south (so it faces north-west).
        const east = heights[j * n + Math.min(n - 1, i + 1)] ?? h;
        const south = heights[Math.min(n - 1, j + 1) * n + i] ?? h;
        const slope = (east - h + (south - h)) / metresPerPixel;
        const shade = Math.max(0.7, Math.min(1.25, 1 + slope * 1.8));
        color = [color[0] * shade, color[1] * shade, color[2] * shade];
      }
      const k = (j * n + i) * 4;
      image.data[k] = Math.min(255, color[0]);
      image.data[k + 1] = Math.min(255, color[1]);
      image.data[k + 2] = Math.min(255, color[2]);
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Runways, to scale.
  const toPx = (v: number) => ((v + c.halfExtent) / (2 * c.halfExtent)) * n;
  for (const runway of RUNWAYS) {
    ctx.save();
    ctx.translate(toPx(runway.center.x), n - toPx(runway.center.z));
    ctx.rotate((runway.headingDegrees * Math.PI) / 180);
    const length = (runway.length / (2 * c.halfExtent)) * n;
    const width = Math.max(1.5, (runway.width / (2 * c.halfExtent)) * n);
    ctx.fillStyle = '#2b2d30';
    ctx.fillRect(-width / 2, -length / 2, width, length);
    ctx.restore();
  }
  return canvas;
}

function readMode(): MapMode {
  try {
    const stored = localStorage.getItem(MINIMAP_CONFIG.storageKey);
    if (stored === 'small' || stored === 'large' || stored === 'off') return stored;
  } catch {
    // Unavailable storage: use the default.
  }
  return 'small';
}

function hex(color: string): [number, number, number] {
  const v = parseInt(color.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

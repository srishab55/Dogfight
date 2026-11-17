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

  constructor(parent: HTMLElement, terrain: Terrain) {
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
    this.background = renderBackground(terrain);
    this.mode = readMode();
    this.applyMode();
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
    this.root.hidden = this.mode === 'off';
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
    const ctx = this.context;
    const size = this.canvas.width;
    const large = this.mode === 'large';
    const unit = size / (large ? MINIMAP_CONFIG.largeSize : MINIMAP_CONFIG.smallSize); // device px per CSS px
    const toX = (x: number) => ((x + MINIMAP_CONFIG.halfExtent) / (2 * MINIMAP_CONFIG.halfExtent)) * size;
    const toY = (z: number) => ((MINIMAP_CONFIG.halfExtent - z) / (2 * MINIMAP_CONFIG.halfExtent)) * size;
    const metresToPx = size / (2 * MINIMAP_CONFIG.halfExtent);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.background, 0, 0, size, size);

    // Carriers: the hull to scale (at least a few pixels).
    for (const carrier of CARRIERS) {
      const view = frame.bases.find((v) => v.base.id === carrier.id);
      ctx.save();
      ctx.translate(toX(carrier.center.x), toY(carrier.center.z));
      ctx.rotate((carrier.headingDegrees * Math.PI) / 180);
      const length = Math.max(10 * unit, carrier.deckLength * metresToPx);
      const width = Math.max(3.5 * unit, carrier.deckWidth * metresToPx);
      ctx.fillStyle = view?.state === 'gone' ? 'rgba(120, 130, 140, 0.35)' : '#9aa3ab';
      ctx.fillRect(-width / 2, -length / 2, width, length);
      ctx.restore();
    }

    // Bases: a dot in the owner's colour.
    const blinkOn = Math.cos(this.time * Math.PI * 2 * 1.2) > -0.3;
    ctx.font = `${Math.round(11 * unit)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    for (const view of frame.bases) {
      const x = toX(view.x);
      const y = toY(view.z);
      const r = (large ? 9 : 6) * unit;
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
        ctx.globalAlpha = view.state === 'open' && !blinkOn ? 0.35 : 1;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5 * unit;
        ctx.beginPath();
        if (view.base.kind === 'carrier') ctx.rect(x - r, y - r, 2 * r, 2 * r);
        else ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (large) {
        const label = view.state === 'gone' ? `${view.base.name} (sunk)` : view.state === 'open' ? `${view.base.name}: defenceless` : view.owner !== view.base.team ? `${view.base.name}: captured by ${view.owner}` : view.base.name;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillText(label, x + unit, y - r - 5 * unit + unit);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x, y - r - 5 * unit);
      }
    }

    // You: an arrow pointing where you're heading.
    if (frame.player) {
      ctx.save();
      ctx.translate(toX(frame.player.x), toY(frame.player.z));
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
}

/** The terrain seen from above, hill-shaded, with the runways: drawn once. */
function renderBackground(terrain: Terrain): HTMLCanvasElement {
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

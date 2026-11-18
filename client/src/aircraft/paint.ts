import type { AircraftClassId } from '@dogfight/shared';
import { DEFAULT_PAINT, PAINT_SCHEMES, type PaintId } from '../config/aircraftVisuals';

const STORAGE_KEY = 'dogfight.paint';

type PaintScheme = (typeof PAINT_SCHEMES)[number];

/**
 * The paint you've chosen for each aircraft type (O), remembered between
 * sessions in this browser. Types you haven't repainted keep their default.
 */
export class PaintChoices {
  private readonly chosen: Partial<Record<AircraftClassId, PaintId>>;

  constructor() {
    this.chosen = readChoices();
  }

  /** The scheme for a type: yours, or its default. */
  schemeFor(classId: AircraftClassId): PaintScheme {
    const id = this.chosen[classId] ?? DEFAULT_PAINT[classId];
    return PAINT_SCHEMES.find((s) => s.id === id) ?? PAINT_SCHEMES[0];
  }

  /** Sets a type's scheme and remembers it. */
  set(classId: AircraftClassId, id: PaintId): PaintScheme {
    this.chosen[classId] = id;
    this.save();
    return this.schemeFor(classId);
  }

  /** Moves a type on to the next scheme and remembers it. */
  next(classId: AircraftClassId): PaintScheme {
    const current = PAINT_SCHEMES.indexOf(this.schemeFor(classId));
    const scheme = PAINT_SCHEMES[(current + 1) % PAINT_SCHEMES.length] ?? PAINT_SCHEMES[0];
    this.chosen[classId] = scheme.id;
    this.save();
    return scheme;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.chosen));
    } catch {
      // Storage can be unavailable; the choice just won't persist.
    }
  }
}

function readChoices(): Partial<Record<AircraftClassId, PaintId>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const valid = new Set<string>(PAINT_SCHEMES.map((s) => s.id));
    return Object.fromEntries(Object.entries(parsed).filter(([, id]) => typeof id === 'string' && valid.has(id))) as Partial<Record<AircraftClassId, PaintId>>;
  } catch {
    return {};
  }
}

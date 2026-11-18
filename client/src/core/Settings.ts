import { KEY_BINDINGS, type InputAction, type KeyBindings } from '../config/controls';

/*
 * Player settings (the Settings screen), remembered in this browser. Every
 * setting here changes something real in the game; Game.applySettings()
 * applies them. Mouse sensitivity, steering and mute are kept where they
 * already lived (MouseFlight, Game, AudioSystem) and shown on the same screen.
 */

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';
export type ShadowQuality = 'off' | 'medium' | 'high';
export type ReducedMotion = 'system' | 'on' | 'off';

export interface GameSettings {
  readonly graphics: {
    readonly preset: GraphicsPreset;
    /** Fraction of the screen's resolution the 3D view is drawn at. */
    readonly renderScale: number;
    /** Antialiasing samples (0 = off). */
    readonly antialiasing: 0 | 2 | 4;
    readonly shadows: ShadowQuality;
    readonly bloom: boolean;
  };
  readonly audio: {
    /** Master volume 0-1. */
    readonly volume: number;
  };
  readonly controls: {
    /** Orbit camera (and hangar view) drag speed, 0.5-2. */
    readonly cameraSensitivity: number;
    /** Keys changed from the defaults, per action. */
    readonly bindings: Partial<Record<InputAction, readonly string[]>>;
  };
  readonly gameplay: {
    readonly targetMarkers: boolean;
    readonly baseLabels: boolean;
    readonly autoLandOffers: boolean;
  };
  readonly accessibility: {
    readonly hudScale: number;
    readonly reducedMotion: ReducedMotion;
    readonly damageFlash: boolean;
    readonly cameraShake: boolean;
  };
}

export const GRAPHICS_PRESETS: Readonly<Record<Exclude<GraphicsPreset, 'custom'>, Omit<GameSettings['graphics'], 'preset'>>> = {
  low: { renderScale: 0.67, antialiasing: 0, shadows: 'off', bloom: false },
  medium: { renderScale: 0.85, antialiasing: 2, shadows: 'medium', bloom: true },
  high: { renderScale: 1, antialiasing: 4, shadows: 'high', bloom: true },
};

export const DEFAULT_SETTINGS: GameSettings = {
  // The game's look before settings existed: full resolution, 2x MSAA, 1024 shadows, bloom.
  graphics: { preset: 'custom', renderScale: 1, antialiasing: 2, shadows: 'medium', bloom: true },
  audio: { volume: 0.7 },
  controls: { cameraSensitivity: 1, bindings: {} },
  gameplay: { targetMarkers: true, baseLabels: true, autoLandOffers: true },
  accessibility: { hudScale: 1, reducedMotion: 'system', damageFlash: true, cameraShake: true },
};

/** The flight actions a player may rebind (Esc and Enter stay fixed: they run the menus). */
export const REBINDABLE_ACTIONS: readonly InputAction[] = [
  'pitchUp',
  'pitchDown',
  'rollLeft',
  'rollRight',
  'yawLeft',
  'yawRight',
  'throttleUp',
  'throttleDown',
  'brake',
  'flapsDown',
  'flapsUp',
  'fireGuns',
  'toggleDiveBrakes',
  'cycleCamera',
  'autoLand',
  'toggleMap',
];

const STORAGE_KEY = 'dogfight.settings';

export function loadSettings(): GameSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<GameSettings>;
    return {
      graphics: { ...DEFAULT_SETTINGS.graphics, ...saved.graphics },
      audio: { ...DEFAULT_SETTINGS.audio, ...saved.audio },
      controls: { ...DEFAULT_SETTINGS.controls, ...saved.controls, bindings: { ...saved.controls?.bindings } },
      gameplay: { ...DEFAULT_SETTINGS.gameplay, ...saved.gameplay },
      accessibility: { ...DEFAULT_SETTINGS.accessibility, ...saved.accessibility },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings apply for this visit only.
  }
}

/** The bindings in force: the defaults with the player's changes. */
export function effectiveBindings(settings: GameSettings): KeyBindings {
  return { ...KEY_BINDINGS, ...settings.controls.bindings } as KeyBindings;
}

/**
 * Binds `code` to `action`, taking it off any other rebindable action that
 * used it (that action is left unbound, and the screen says so).
 */
export function rebind(settings: GameSettings, action: InputAction, code: string): GameSettings {
  const current = effectiveBindings(settings);
  const bindings: Partial<Record<InputAction, readonly string[]>> = { ...settings.controls.bindings };
  for (const other of REBINDABLE_ACTIONS) {
    if (other !== action && current[other].includes(code)) bindings[other] = current[other].filter((c) => c !== code);
  }
  bindings[action] = [code];
  return { ...settings, controls: { ...settings.controls, bindings } };
}

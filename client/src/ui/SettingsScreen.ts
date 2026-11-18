import { ACTION_LABELS, RESERVED_KEYS } from '../config/controls';
import { UI_CONFIG } from '../config/ui';
import {
  DEFAULT_SETTINGS,
  GRAPHICS_PRESETS,
  REBINDABLE_ACTIONS,
  effectiveBindings,
  rebind,
  type GameSettings,
  type GraphicsPreset,
  type ReducedMotion,
  type ShadowQuality,
} from '../core/Settings';
import { formatKeyCode } from './ControlsHint';
import { button, h, kbd, label, segmented, settingRow, slider, tabs, tag, toggleSwitch, type Control } from './components';
import type { SteeringMode } from './Hangar';

export type SettingsTab = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'accessibility';

/** Everything the screen shows: the settings, plus the ones that live in their own systems. */
export interface SettingsValues {
  readonly settings: GameSettings;
  readonly steering: SteeringMode;
  readonly mouseSensitivity: number;
  readonly soundOn: boolean;
  /** Antialiasing and bloom need the post-processing pipeline; without it those rows are hidden. */
  readonly postProcessing: boolean;
}

export interface SettingsLimits {
  readonly minMouseSensitivity: number;
  readonly maxMouseSensitivity: number;
  readonly defaultMouseSensitivity: number;
  readonly defaultSteering: SteeringMode;
}

export interface SettingsEvents {
  change(settings: GameSettings): void;
  steering(mode: SteeringMode): void;
  mouseSensitivity(value: number): void;
  sound(on: boolean): void;
  done(): void;
}

const TABS: ReadonlyArray<{ readonly value: SettingsTab; readonly label: string }> = [
  { value: 'graphics', label: 'Graphics' },
  { value: 'audio', label: 'Audio' },
  { value: 'controls', label: 'Controls' },
  { value: 'gameplay', label: 'Gameplay' },
  { value: 'accessibility', label: 'Accessibility' },
];

const percent = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Settings, in five tabs. Every control changes the game as you move it
 * (and is remembered); Done (Esc) goes back. Keys are rebound by clicking
 * Change and pressing the new key.
 */
export class SettingsScreen {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabList: Control<SettingsTab>;
  private tab: SettingsTab = 'graphics';
  private values: SettingsValues | null = null;
  /** The action waiting for a key press, and its Change button. */
  private capture: { readonly action: (typeof REBINDABLE_ACTIONS)[number]; readonly button: HTMLButtonElement } | null = null;
  private readonly status: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly limits: SettingsLimits,
    private readonly events: SettingsEvents,
  ) {
    this.root = h('div', 'modal settings');
    this.root.hidden = true;
    const title = h('h2', 'ui-heading settings__title', 'Settings');
    title.id = 'settings-title';
    this.tabList = tabs(TABS, this.tab, (tab) => this.showTab(tab));
    this.tabList.element.setAttribute('aria-label', 'Settings sections');
    this.body = h('div', 'settings__body');
    this.body.setAttribute('role', 'tabpanel');
    this.status = h('p', 'settings__status');
    this.status.setAttribute('aria-live', 'polite');
    const footer = h(
      'footer',
      'settings__footer',
      button('Restore defaults', { variant: 'ghost', onClick: () => this.restoreDefaults(), tooltip: 'Resets this tab only' }),
      this.status,
      button('Done', { variant: 'primary', hint: 'Esc', onClick: () => this.events.done() }),
    );
    const dialog = h('div', 'modal__dialog settings__dialog', h('header', 'settings__header', title, this.tabList.element), this.body, footer);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', title.id);
    this.root.append(dialog);
    parent.append(this.root);
    window.addEventListener('keydown', this.handleCaptureKey, { capture: true });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Waiting for a key to bind: Esc cancels that, rather than closing the screen. */
  get capturingKey(): boolean {
    return this.capture !== null;
  }

  open(tab: SettingsTab, values: SettingsValues): void {
    this.values = values;
    this.root.hidden = false;
    this.status.textContent = '';
    this.showTab(tab);
    (this.tabList.element.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  close(): void {
    this.stopCapture();
    this.root.hidden = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleCaptureKey, { capture: true });
    this.root.remove();
  }

  private showTab(tab: SettingsTab): void {
    this.stopCapture();
    this.tab = tab;
    this.tabList.set(tab);
    this.render();
  }

  private render(): void {
    const values = this.values;
    if (!values) return;
    const rows = {
      graphics: () => this.graphicsRows(values),
      audio: () => this.audioRows(values),
      controls: () => this.controlsRows(values),
      gameplay: () => this.gameplayRows(values),
      accessibility: () => this.accessibilityRows(values),
    }[this.tab]();
    this.body.replaceChildren(...rows);
    this.body.scrollTop = 0;
  }

  private update(settings: GameSettings): void {
    if (!this.values) return;
    this.values = { ...this.values, settings };
    this.events.change(settings);
  }

  // ── Graphics ──

  private graphicsRows(values: SettingsValues): HTMLElement[] {
    const g = values.settings.graphics;
    const setGraphics = (patch: Partial<GameSettings['graphics']>) => {
      const next = { ...this.values!.settings.graphics, ...patch };
      const preset = matchingPreset(next);
      this.update({ ...this.values!.settings, graphics: { ...next, preset } });
      presetControl.set(preset);
    };
    const presetControl = segmented<GraphicsPreset>(
      'Quality preset',
      [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'custom', label: 'Custom', tooltip: 'Your own mix of the options below' },
      ],
      g.preset,
      (preset) => {
        if (preset === 'custom') {
          presetControl.set(this.values!.settings.graphics.preset);
          return;
        }
        this.update({ ...this.values!.settings, graphics: { preset, ...GRAPHICS_PRESETS[preset] } });
        const p = GRAPHICS_PRESETS[preset];
        scale.set(p.renderScale);
        aa.set(String(p.antialiasing) as '0' | '2' | '4');
        shadows.set(p.shadows);
        bloom.set(p.bloom);
      },
    );
    const scale = slider('Render resolution', g.renderScale, { ...UI_CONFIG.renderScale, format: percent }, (renderScale) => setGraphics({ renderScale }));
    const aa = segmented<'0' | '2' | '4'>(
      'Antialiasing',
      [
        { value: '0', label: 'Off' },
        { value: '2', label: '2×' },
        { value: '4', label: '4×' },
      ],
      String(g.antialiasing) as '0' | '2' | '4',
      (v) => setGraphics({ antialiasing: Number(v) as 0 | 2 | 4 }),
    );
    const shadows = segmented<ShadowQuality>(
      'Shadows',
      [
        { value: 'off', label: 'Off' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      g.shadows,
      (shadows) => setGraphics({ shadows }),
    );
    const bloom = toggleSwitch('Bloom', g.bloom, (bloom) => setGraphics({ bloom }));
    return [
      settingRow('Quality preset', 'Sets the options below at once. Lower is faster on laptops.', presetControl.element),
      settingRow('Render resolution', 'The 3D view is drawn at this share of the screen’s resolution; the HUD stays sharp.', scale.element),
      values.postProcessing ? settingRow('Antialiasing', 'Smooths jagged edges.', aa.element) : null,
      settingRow('Shadows', 'Shadow detail of aircraft and buildings (High: a sharper 2048 px shadow map).', shadows.element),
      values.postProcessing ? settingRow('Bloom', 'The glow around the sun, tracers and fires.', bloom.element) : null,
    ].filter((row): row is HTMLElement => row !== null);
  }

  // ── Audio ──

  private audioRows(values: SettingsValues): HTMLElement[] {
    const sound = toggleSwitch('Sound', values.soundOn, (on) => {
      this.values = { ...this.values!, soundOn: on };
      this.events.sound(on);
    });
    const volume = slider('Master volume', values.settings.audio.volume, { min: 0, max: 1, step: 0.05, format: percent }, (v) => this.update({ ...this.values!.settings, audio: { volume: v } }));
    return [
      settingRow('Sound', 'All game sound on or off. Browsers start sound after your first click or key press.', sound.element),
      settingRow('Master volume', 'Engines, guns, explosions and warnings together.', volume.element),
    ];
  }

  // ── Controls ──

  private controlsRows(values: SettingsValues): HTMLElement[] {
    const bindings = effectiveBindings(values.settings);
    const keyOf = (action: (typeof REBINDABLE_ACTIONS)[number]) => bindings[action].map(formatKeyCode).join(' / ') || 'unbound';
    const steering = segmented<SteeringMode>(
      'Keyboard steering',
      [
        { value: 'easy', label: 'Easy turns' },
        { value: 'direct', label: 'Direct roll' },
      ],
      values.steering,
      (mode) => {
        this.values = { ...this.values!, steering: mode };
        this.events.steering(mode);
      },
    );
    const mouse = slider(
      'Mouse aim sensitivity',
      values.mouseSensitivity,
      { min: this.limits.minMouseSensitivity, max: this.limits.maxMouseSensitivity, step: 0.01, format: (v) => `${v.toFixed(2)}°/px` },
      (v) => {
        this.values = { ...this.values!, mouseSensitivity: v };
        this.events.mouseSensitivity(v);
      },
    );
    const camera = slider('Camera drag speed', values.settings.controls.cameraSensitivity, { ...UI_CONFIG.cameraSensitivity, format: (v) => `${v.toFixed(1)}×` }, (v) =>
      this.update({ ...this.values!.settings, controls: { ...this.values!.settings.controls, cameraSensitivity: v } }),
    );

    const keyRows = REBINDABLE_ACTIONS.map((action) => {
      const keys = bindings[action];
      const change = button('Change', { size: 'sm', onClick: () => this.startCapture(action, change) });
      change.setAttribute('aria-label', `Change the key for ${ACTION_LABELS[action] ?? action}`);
      const current = keys.length > 0 ? h('span', 'keybind__keys', ...keys.map((k) => kbd(formatKeyCode(k)))) : tag('Unbound', 'caution');
      return h('div', 'keybind', h('span', 'keybind__action', ACTION_LABELS[action] ?? action), current, change);
    });
    const fixed: ReadonlyArray<readonly [string, string]> = [
      ['Esc', 'Pause menu; back out of any screen'],
      ['Enter', 'Fly; the menus’ main button'],
      ['Click', 'Fly with the mouse (click the view; Esc lets go)'],
      ['Drag', 'Look round: orbit camera and the hangar view'],
      ['Scroll', 'Zoom the orbit camera'],
    ];
    return [
      settingRow('Keyboard steering', `Easy: ${keyOf('rollLeft')} / ${keyOf('rollRight')} turn like a car and the aircraft levels itself. Direct: they roll; pull to turn.`, steering.element),
      settingRow('Mouse aim sensitivity', 'How far the aim moves per pixel when flying with the mouse.', mouse.element),
      settingRow('Camera drag speed', 'Orbit camera and hangar view.', camera.element),
      h('div', 'settings__section', label('Flight keys'), button('Reset keys', { variant: 'ghost', size: 'sm', onClick: () => this.resetKeys() })),
      h('div', 'keybinds', ...keyRows),
      h('div', 'settings__section', label('Fixed')),
      h('div', 'keybinds', ...fixed.map(([key, what]) => h('div', 'keybind keybind--fixed', h('span', 'keybind__action', what), h('span', 'keybind__keys', kbd(key))))),
    ];
  }

  private startCapture(action: (typeof REBINDABLE_ACTIONS)[number], changeButton: HTMLButtonElement): void {
    this.stopCapture();
    this.capture = { action, button: changeButton };
    changeButton.classList.add('btn--capturing');
    (changeButton.firstElementChild as HTMLElement).textContent = 'Press a key…';
    this.status.textContent = `Press the new key for “${ACTION_LABELS[action] ?? action}”. Esc cancels.`;
  }

  private stopCapture(): void {
    if (!this.capture) return;
    this.capture.button.classList.remove('btn--capturing');
    (this.capture.button.firstElementChild as HTMLElement).textContent = 'Change';
    this.capture = null;
  }

  /** While waiting for a key, the key goes here and nowhere else (not to the flight controls). */
  private readonly handleCaptureKey = (event: KeyboardEvent): void => {
    const capture = this.capture;
    if (!capture || !this.values) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      this.stopCapture();
      this.status.textContent = 'Cancelled.';
      capture.button.focus();
      return;
    }
    if (RESERVED_KEYS.includes(event.code)) {
      this.status.textContent = `${formatKeyCode(event.code)} runs the menus; choose another key.`;
      return;
    }
    const before = effectiveBindings(this.values.settings);
    const taken = REBINDABLE_ACTIONS.find((other) => other !== capture.action && before[other].includes(event.code));
    this.stopCapture();
    this.update(rebind(this.values.settings, capture.action, event.code));
    this.render();
    this.status.textContent = taken
      ? `${formatKeyCode(event.code)} now: ${ACTION_LABELS[capture.action]}. It was ${ACTION_LABELS[taken]}, which needs a new key.`
      : `${formatKeyCode(event.code)} now: ${ACTION_LABELS[capture.action]}.`;
    this.focusChangeButton(capture.action);
  };

  private focusChangeButton(action: (typeof REBINDABLE_ACTIONS)[number]): void {
    const index = REBINDABLE_ACTIONS.indexOf(action);
    (this.body.querySelectorAll('.keybinds')[0]?.children[index]?.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private resetKeys(): void {
    if (!this.values) return;
    this.update({ ...this.values.settings, controls: { ...this.values.settings.controls, bindings: {} } });
    this.render();
    this.status.textContent = 'Flight keys reset to the defaults.';
  }

  // ── Gameplay ──

  private gameplayRows(values: SettingsValues): HTMLElement[] {
    const g = values.settings.gameplay;
    const set = (patch: Partial<GameSettings['gameplay']>) => this.update({ ...this.values!.settings, gameplay: { ...this.values!.settings.gameplay, ...patch } });
    const autoLandKey = effectiveBindings(values.settings).autoLand.map(formatKeyCode).join(' / ') || 'its key';
    return [
      settingRow('Target markers', 'Red brackets over the enemy targets in range.', toggleSwitch('Target markers', g.targetMarkers, (targetMarkers) => set({ targetMarkers })).element),
      settingRow('Base labels and beacons', 'Each base’s name and distance, and its column of light in its owner’s colour.', toggleSwitch('Base labels and beacons', g.baseLabels, (baseLabels) => set({ baseLabels })).element),
      settingRow('Auto-land offers', `Offer auto-land when you near a base. Off, ${autoLandKey} still lands you.`, toggleSwitch('Auto-land offers', g.autoLandOffers, (autoLandOffers) => set({ autoLandOffers })).element),
    ];
  }

  // ── Accessibility ──

  private accessibilityRows(values: SettingsValues): HTMLElement[] {
    const a = values.settings.accessibility;
    const set = (patch: Partial<GameSettings['accessibility']>) => this.update({ ...this.values!.settings, accessibility: { ...this.values!.settings.accessibility, ...patch } });
    const motion = segmented<ReducedMotion>(
      'Reduced motion',
      [
        { value: 'system', label: 'System' },
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ],
      a.reducedMotion,
      (reducedMotion) => set({ reducedMotion }),
    );
    return [
      settingRow('HUD scale', 'Size of the flight instruments. Capped so they always fit the window.', slider('HUD scale', a.hudScale, { ...UI_CONFIG.hudScale, format: percent }, (hudScale) => set({ hudScale })).element),
      settingRow('Reduced motion', 'Stops interface animation (menus, radar sweep, pulsing alerts). System follows your computer’s setting.', motion.element),
      settingRow('Damage flash', 'Red flash at the screen’s edges when you’re hit.', toggleSwitch('Damage flash', a.damageFlash, (damageFlash) => set({ damageFlash })).element),
      settingRow('Camera shake', 'Shake from hits, gunfire, stall buffet and high g.', toggleSwitch('Camera shake', a.cameraShake, (cameraShake) => set({ cameraShake })).element),
    ];
  }

  private restoreDefaults(): void {
    const values = this.values;
    if (!values) return;
    const s = values.settings;
    const d = DEFAULT_SETTINGS;
    switch (this.tab) {
      case 'graphics':
        this.update({ ...s, graphics: d.graphics });
        break;
      case 'audio':
        this.update({ ...s, audio: d.audio });
        if (!values.soundOn) {
          this.values = { ...this.values!, soundOn: true };
          this.events.sound(true);
        }
        break;
      case 'controls':
        this.update({ ...s, controls: d.controls });
        this.values = { ...this.values!, steering: this.limits.defaultSteering, mouseSensitivity: this.limits.defaultMouseSensitivity };
        this.events.steering(this.limits.defaultSteering);
        this.events.mouseSensitivity(this.limits.defaultMouseSensitivity);
        break;
      case 'gameplay':
        this.update({ ...s, gameplay: d.gameplay });
        break;
      case 'accessibility':
        this.update({ ...s, accessibility: d.accessibility });
    }
    this.render();
    this.status.textContent = `${TABS.find((t) => t.value === this.tab)?.label ?? ''} restored to the defaults.`;
  }
}

/** The preset these graphics options match exactly, or "custom". */
function matchingPreset(g: Omit<GameSettings['graphics'], 'preset'>): GraphicsPreset {
  for (const [name, preset] of Object.entries(GRAPHICS_PRESETS) as Array<[Exclude<GraphicsPreset, 'custom'>, (typeof GRAPHICS_PRESETS)['low']]>) {
    if (preset.renderScale === g.renderScale && preset.antialiasing === g.antialiasing && preset.shadows === g.shadows && preset.bloom === g.bloom) return name;
  }
  return 'custom';
}

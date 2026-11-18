/*
 * Builders for the shared interface components (styled in styles/components.css).
 * Screens compose these instead of styling their own buttons, switches and
 * bars, so every screen looks and behaves the same: hover, focus, disabled,
 * keyboard operation and ARIA roles come with each one.
 */

export type Tone = 'accent' | 'caution' | 'danger' | 'friendly' | 'ok';

type Child = Node | string | null | undefined | false;

/** Creates an element with a class, optional text/attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  if (element instanceof HTMLButtonElement) element.type = 'button';
  return element;
}

export function label(text: string): HTMLElement {
  return h('span', 'ui-label', text);
}

export interface ButtonOptions {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly block?: boolean;
  /** A key shown on the button, e.g. "Enter". */
  readonly hint?: string;
  readonly tooltip?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

export function button(text: string, options: ButtonOptions = {}): HTMLButtonElement {
  const classes = ['btn'];
  if (options.variant && options.variant !== 'secondary') classes.push(`btn--${options.variant}`);
  if (options.size && options.size !== 'md') classes.push(`btn--${options.size}`);
  if (options.block) classes.push('btn--block');
  const element = h('button', classes.join(' '), h('span', '', text), options.hint ? h('span', 'btn__hint', options.hint) : null);
  if (options.tooltip) element.dataset['tooltip'] = options.tooltip;
  if (options.disabled) element.disabled = true;
  if (options.onClick) element.addEventListener('click', options.onClick);
  return element;
}

/**
 * A big menu entry (main and pause menus), with an optional note on the
 * right. A disabled entry stays focusable (aria-disabled), so keyboard users
 * reach it and read why: give it a `tooltip`.
 */
export function navItem(text: string, onClick: () => void, options: { readonly meta?: string; readonly disabled?: boolean; readonly tooltip?: string } = {}): HTMLButtonElement {
  const element = h('button', 'nav__item', h('span', '', text), options.meta ? h('span', 'nav__meta', options.meta) : null);
  if (options.tooltip) element.dataset['tooltip'] = options.tooltip;
  if (options.disabled) element.setAttribute('aria-disabled', 'true');
  element.addEventListener('click', () => {
    if (element.getAttribute('aria-disabled') !== 'true') onClick();
  });
  return element;
}

/** Up/down arrow keys move focus between the container's buttons (menus). */
export function arrowNavigation(container: HTMLElement, selector = 'button:not(:disabled)'): void {
  // The arrows belong to this menu while it has focus (InputManager leaves them alone).
  container.dataset['arrowKeys'] = '';
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...container.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next?.focus();
    event.preventDefault();
  });
}

export interface Control<T> {
  readonly element: HTMLElement;
  set(value: T): void;
}

/** An on/off switch. */
export function toggleSwitch(name: string, checked: boolean, onChange: (checked: boolean) => void): Control<boolean> {
  const element = h('button', 'switch');
  element.setAttribute('role', 'switch');
  element.setAttribute('aria-label', name);
  const set = (value: boolean) => element.setAttribute('aria-checked', String(value));
  set(checked);
  element.addEventListener('click', () => {
    const value = element.getAttribute('aria-checked') !== 'true';
    set(value);
    onChange(value);
  });
  return { element, set };
}

/** One of a few options, side by side. */
export function segmented<T extends string>(name: string, options: ReadonlyArray<{ readonly value: T; readonly label: string; readonly tooltip?: string }>, value: T, onChange: (value: T) => void): Control<T> {
  const element = h('div', 'segmented');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', name);
  const buttons = options.map((option) => {
    const b = h('button', 'segmented__option', option.label);
    if (option.tooltip) b.title = option.tooltip;
    b.addEventListener('click', () => {
      set(option.value);
      onChange(option.value);
    });
    element.append(b);
    return { b, value: option.value };
  });
  const set = (v: T) => {
    for (const { b, value: optionValue } of buttons) b.setAttribute('aria-pressed', String(optionValue === v));
  };
  set(value);
  return { element, set };
}

export interface SliderOptions {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
}

/** A range slider with its value shown beside it. */
export function slider(name: string, value: number, options: SliderOptions, onInput: (value: number) => void): Control<number> {
  const input = h('input', '');
  input.type = 'range';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.setAttribute('aria-label', name);
  const readout = h('span', 'slider__value');
  const element = h('div', 'slider', input, readout);
  const set = (v: number) => {
    input.value = String(v);
    readout.textContent = options.format(v);
  };
  set(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    readout.textContent = options.format(v);
    onInput(v);
  });
  return { element, set };
}

/** A dropdown. */
export function select<T extends string>(name: string, options: ReadonlyArray<{ readonly value: T; readonly label: string }>, value: T, onChange: (value: T) => void): Control<T> {
  const element = h('select', 'select');
  element.setAttribute('aria-label', name);
  for (const option of options) {
    const o = h('option', '', option.label);
    o.value = option.value;
    element.append(o);
  }
  element.value = value;
  element.addEventListener('change', () => onChange(element.value as T));
  return { element, set: (v) => (element.value = v) };
}

/** Tabs: a row of tab buttons; `onSelect` shows the matching panel. */
export function tabs<T extends string>(items: ReadonlyArray<{ readonly value: T; readonly label: string }>, value: T, onSelect: (value: T) => void): Control<T> {
  const element = h('div', 'tabs');
  element.setAttribute('role', 'tablist');
  element.dataset['arrowKeys'] = '';
  const buttons = items.map((item) => {
    const b = h('button', 'tab', item.label);
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      set(item.value);
      onSelect(item.value);
    });
    element.append(b);
    return { b, value: item.value };
  });
  // Left/right arrows move between tabs, as in any tab list.
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = buttons.findIndex(({ b }) => b === document.activeElement);
    if (index < 0) return;
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    if (!next) return;
    next.b.focus();
    set(next.value);
    onSelect(next.value);
    event.preventDefault();
  });
  const set = (v: T) => {
    for (const { b, value: itemValue } of buttons) {
      b.setAttribute('aria-selected', String(itemValue === v));
      b.tabIndex = itemValue === v ? 0 : -1;
    }
  };
  set(value);
  return { element, set };
}

/** A thin bar; `set(fraction)` fills it (animated by CSS), `tone` colours it. */
export interface ProgressBar {
  readonly element: HTMLElement;
  set(fraction: number, tone?: Tone): void;
}

export function progress(thick = false): ProgressBar {
  const fill = h('div', 'progress__fill');
  const element = h('div', thick ? 'progress progress--thick' : 'progress', fill);
  element.setAttribute('role', 'progressbar');
  let lastFraction = -1;
  let lastTone: Tone | undefined;
  return {
    element,
    set(fraction, tone) {
      const f = Math.max(0, Math.min(1, fraction));
      // Only touch the DOM when something visibly changes.
      if (Math.abs(f - lastFraction) > 0.002) {
        lastFraction = f;
        fill.style.transform = `scaleX(${f.toFixed(3)})`;
        element.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      }
      if (tone !== lastTone) {
        lastTone = tone;
        if (tone) fill.dataset['tone'] = tone;
        else delete fill.dataset['tone'];
      }
    },
  };
}

/** A comparison row: label, bar, value. */
export function statRow(name: string): { readonly element: HTMLElement; set(fraction: number, text: string): void } {
  const bar = progress();
  const value = h('span', 'stat__value');
  const element = h('div', 'stat', label(name), bar.element, value);
  return {
    element,
    set(fraction, text) {
      bar.set(fraction);
      value.textContent = text;
    },
  };
}

export function tag(text: string, tone?: Tone): HTMLElement {
  const element = h('span', 'tag', text);
  if (tone) element.dataset['tone'] = tone;
  return element;
}

/** A small status light. */
export function dot(tone?: Tone): HTMLElement {
  const element = h('span', 'dot');
  if (tone) element.dataset['tone'] = tone;
  return element;
}

/** A setting: its name and what it does on the left, the control on the right. */
export function settingRow(name: string, description: string, control: HTMLElement): HTMLElement {
  return h('div', 'setting', h('div', 'setting__text', h('span', 'setting__name', name), description ? h('span', 'setting__description', description) : null), h('div', 'setting__control', control));
}

/** A big number with its label (after-action report). */
export function statTile(name: string, value: string, detail?: string): HTMLElement {
  return h('div', 'stat-tile', label(name), h('span', 'stat-tile__value', value), detail ? h('span', 'stat-tile__detail', detail) : null);
}

export function kbd(text: string): HTMLElement {
  return h('kbd', 'kbd', text);
}

/** Sets text only when it changes (cheap per-frame updates). */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/** Shows or hides an element only when that changes. */
export function show(element: HTMLElement, visible: boolean): void {
  if (element.hidden === !visible) return;
  element.hidden = !visible;
}

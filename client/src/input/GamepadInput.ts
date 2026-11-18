import { GAMEPAD_CONFIG, type InputAction } from '../config/controls';

/** Stick and trigger positions for the flight controls, -1 to 1 (0 inside the deadzone). */
export interface AnalogFlight {
  /** Pull back (+1) to climb, as on a control column. */
  pitch: number;
  roll: number;
  yaw: number;
  /** Throttle lever rate: RT (+) minus LT (-). */
  throttle: number;
}

type Direction = 'up' | 'down' | 'left' | 'right';

const BUTTON = { a: 0, b: 1, lb: 4, rb: 5, menu: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';
/** How much being out of line counts against a control, per pixel, against 1 for each pixel further away. */
const NAV_OFFSET_WEIGHT = 0.3;
const ARROW_KEYS: Readonly<Record<Direction, string>> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/**
 * A gamepad (game-skills/Game UI: full keyboard *and* gamepad reach). Polled
 * once a frame. In flight it holds the same actions the keys do (InputManager
 * reads `held` and `pressed` alongside the keyboard) and gives the sticks and
 * triggers as analog values. While a screen is open it drives the menus
 * instead: spatial focus movement, A to press, B to go back, LB/RB for tabs.
 * Mouse, keyboard and pad coexist: whichever was used last styles the focus.
 */
export class GamepadInput {
  readonly held = new Set<InputAction>();
  readonly pressed = new Set<InputAction>();
  readonly analog: AnalogFlight = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  /** Push the stick forward to climb. */
  invertPitch = false;
  private index: number | null = null;
  private wasDown: boolean[] = [];
  /** Buttons held when the game switched between flight and the menus: ignored until let go. */
  private readonly blocked = new Set<number>();
  private lastMenus: boolean | null = null;
  private navDirection: Direction | null = null;
  private navRepeatIn = 0;

  constructor(
    private readonly target: Window,
    /** A pad was plugged in (or first pressed), for a hint. */
    private readonly onConnected: (id: string) => void = () => undefined,
  ) {
    target.addEventListener('gamepadconnected', this.handleConnected);
    target.addEventListener('gamepaddisconnected', this.handleDisconnected);
    // The pointer or keyboard takes over the focus styling from the pad.
    target.addEventListener('pointerdown', this.handleOtherDevice, true);
    target.addEventListener('keydown', this.handleOtherDevice, true);
  }

  get connected(): boolean {
    return this.index !== null;
  }

  /** Once a frame, before the game reads its input. `menus`: a screen is open. */
  poll(deltaSeconds: number, menus: boolean): void {
    this.pressed.clear();
    this.held.clear();
    this.analog.pitch = this.analog.roll = this.analog.yaw = this.analog.throttle = 0;
    if (this.index === null) return;
    const pad = this.target.navigator.getGamepads()[this.index];
    if (!pad || !pad.connected) return;
    const down = pad.buttons.map((b) => b.pressed);
    if (menus !== this.lastMenus) {
      this.blocked.clear();
      down.forEach((d, i) => d && this.blocked.add(i));
      this.lastMenus = menus;
      this.navDirection = null;
    }
    for (const i of this.blocked) if (!down[i]) this.blocked.delete(i);
    const isDown = (i: number): boolean => down[i] === true && !this.blocked.has(i);
    const justPressed = (i: number): boolean => isDown(i) && !this.wasDown[i];
    const anyInput = down.some((d, i) => d && !this.wasDown[i]) || pad.axes.some((a) => Math.abs(a) > GAMEPAD_CONFIG.menuStickThreshold);
    if (anyInput) this.markActive();

    if (menus) this.pollMenus(pad, deltaSeconds, isDown, justPressed);
    else this.pollFlight(pad, isDown, justPressed);
    this.wasDown = down;
  }

  dispose(): void {
    this.target.removeEventListener('gamepadconnected', this.handleConnected);
    this.target.removeEventListener('gamepaddisconnected', this.handleDisconnected);
    this.target.removeEventListener('pointerdown', this.handleOtherDevice, true);
    this.target.removeEventListener('keydown', this.handleOtherDevice, true);
  }

  private pollFlight(pad: Gamepad, isDown: (i: number) => boolean, justPressed: (i: number) => boolean): void {
    for (const [index, actions] of Object.entries(GAMEPAD_CONFIG.flightButtons)) {
      const i = Number(index);
      if (!isDown(i)) continue;
      for (const action of actions) {
        this.held.add(action);
        if (justPressed(i)) this.pressed.add(action);
      }
    }
    const [lx = 0, ly = 0, rx = 0] = pad.axes;
    const [sx, sy] = radialDeadzone(lx, ly);
    this.analog.roll = sx;
    // The Gamepad API's y is +1 pulled back (towards you): a control column's "climb".
    this.analog.pitch = this.invertPitch ? -sy : sy;
    this.analog.yaw = axisDeadzone(rx);
    const trigger = (i: number): number => (this.blocked.has(i) ? 0 : (pad.buttons[i]?.value ?? 0));
    this.analog.throttle = (trigger(7) - trigger(6)) * GAMEPAD_CONFIG.throttleRateScale;
  }

  private pollMenus(pad: Gamepad, deltaSeconds: number, isDown: (i: number) => boolean, justPressed: (i: number) => boolean): void {
    // Back: what Esc does on every screen.
    if (justPressed(BUTTON.b) || justPressed(BUTTON.menu)) this.pressed.add('openHangar');
    if (justPressed(BUTTON.a)) pressFocused();
    if (justPressed(BUTTON.lb)) switchTab(-1);
    if (justPressed(BUTTON.rb)) switchTab(1);

    const [lx = 0, ly = 0] = pad.axes;
    const t = GAMEPAD_CONFIG.menuStickThreshold;
    const direction: Direction | null =
      isDown(BUTTON.up) || ly < -t ? 'up' : isDown(BUTTON.down) || ly > t ? 'down' : isDown(BUTTON.left) || lx < -t ? 'left' : isDown(BUTTON.right) || lx > t ? 'right' : null;
    if (direction === null) {
      this.navDirection = null;
      return;
    }
    if (direction !== this.navDirection) {
      this.navDirection = direction;
      this.navRepeatIn = GAMEPAD_CONFIG.menuRepeatDelay;
      navigate(direction);
      return;
    }
    this.navRepeatIn -= deltaSeconds;
    if (this.navRepeatIn <= 0) {
      this.navRepeatIn = GAMEPAD_CONFIG.menuRepeatInterval;
      navigate(direction);
    }
  }

  private markActive(): void {
    this.target.document.documentElement.dataset['input'] = 'gamepad';
  }

  private readonly handleConnected = (event: GamepadEvent): void => {
    // Only the standard layout has known button positions.
    if (event.gamepad.mapping !== 'standard' && this.index !== null) return;
    this.index = event.gamepad.index;
    this.wasDown = [];
    this.lastMenus = null;
    this.onConnected(event.gamepad.id);
  };

  private readonly handleDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.index !== this.index) return;
    this.index = null;
    // Another pad still plugged in takes over.
    const other = [...this.target.navigator.getGamepads()].find((g) => g && g.connected && g.index !== event.gamepad.index);
    if (other) this.index = other.index;
  };

  private readonly handleOtherDevice = (event: Event): void => {
    if (!event.isTrusted) return;
    delete this.target.document.documentElement.dataset['input'];
  };
}

/** A stick's two axes with a round deadzone, rescaled so just outside it is ~0 and full travel is 1. */
function radialDeadzone(x: number, y: number): [number, number] {
  const magnitude = Math.sqrt(x * x + y * y);
  const dz = GAMEPAD_CONFIG.deadzone;
  if (magnitude <= dz) return [0, 0];
  const scaled = Math.min(1, (magnitude - dz) / (1 - dz)) / magnitude;
  return [x * scaled, y * scaled];
}

function axisDeadzone(v: number): number {
  const dz = GAMEPAD_CONFIG.deadzone;
  if (Math.abs(v) <= dz) return 0;
  return (Math.sign(v) * Math.min(1, Math.abs(v) - dz)) / (1 - dz);
}

// ── Menus: spatial navigation over the open screen's controls ──

/** The open screen's controls: the top modal dialog if there is one (focus stays trapped in it), else the open screen. */
function menuScope(): HTMLElement | null {
  const visible = (el: Element): boolean => el.getClientRects().length > 0;
  const dialogs = [...document.querySelectorAll<HTMLElement>('#ui-root [aria-modal="true"]')].filter(visible);
  if (dialogs.length > 0) return dialogs[dialogs.length - 1] ?? null;
  const screens = [...document.querySelectorAll<HTMLElement>('#ui-root .screen')].filter(visible);
  return screens[screens.length - 1] ?? null;
}

function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && el.closest('[inert]') === null);
}

function focus(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** The focused control, if it's in the open screen; otherwise focuses the screen's first control and returns null. */
function focusedIn(scope: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && scope.contains(active)) return active;
  const first = focusables(scope)[0];
  if (first) focus(first);
  return null;
}

function pressFocused(): void {
  const scope = menuScope();
  if (!scope) return;
  const active = focusedIn(scope);
  if (!active) return;
  if (active instanceof HTMLInputElement && (active.type === 'range' || active.type === 'text')) return;
  active.click();
}

function switchTab(step: -1 | 1): void {
  const scope = menuScope();
  const tabs = scope ? [...scope.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.getClientRects().length > 0) : [];
  if (tabs.length === 0) return;
  const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[(Math.max(0, current) + step + tabs.length) % tabs.length];
  if (!next) return;
  next.click();
  focus(next);
}

function navigate(direction: Direction): void {
  const scope = menuScope();
  if (!scope) return;
  const active = focusedIn(scope);
  if (!active) return;
  if (adjust(active, direction)) return;
  // Menus and tab lists that move focus with the arrows themselves: let them (they cancel the key when they use it).
  if (active.closest('[data-arrow-keys]')) {
    const key = ARROW_KEYS[direction];
    const used = !active.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
    if (used) return;
  }
  const next = nearest(focusables(scope), active, direction);
  if (next) focus(next);
}

/** Left/right change a slider or a dropdown, as the arrow keys do. */
function adjust(el: HTMLElement, direction: Direction): boolean {
  if (direction !== 'left' && direction !== 'right') return false;
  const step = direction === 'right' ? 1 : -1;
  if (el instanceof HTMLInputElement && el.type === 'range') {
    if (step > 0) el.stepUp();
    else el.stepDown();
  } else if (el instanceof HTMLSelectElement) {
    const index = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + step));
    if (index === el.selectedIndex) return true;
    el.selectedIndex = index;
  } else return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * The control nearest in that direction: the next row (or column) first,
 * and within it the one most in line with the current control. The offset
 * weighs less than the gap, so down from a tab reaches the first row of
 * settings even when that row's control sits off to one side.
 */
function nearest(candidates: readonly HTMLElement[], from: HTMLElement, direction: Direction): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === from) continue;
    const c = el.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const vertical = direction === 'up' || direction === 'down';
    const along = direction === 'down' ? cy - ay : direction === 'up' ? ay - cy : direction === 'right' ? cx - ax : ax - cx;
    if (along <= 1) continue;
    // Edge gap along the direction, and how far out of line it is (0 when the two overlap across it).
    const gap = Math.max(0, direction === 'down' ? c.top - a.bottom : direction === 'up' ? a.top - c.bottom : direction === 'right' ? c.left - a.right : a.left - c.right);
    const offset = vertical ? Math.max(0, Math.max(a.left, c.left) - Math.min(a.right, c.right)) : Math.max(0, Math.max(a.top, c.top) - Math.min(a.bottom, c.bottom));
    // Only within 45 degrees of the direction: nothing to the right of the last button means stay put, not jump up a row.
    if (offset > along) continue;
    const score = gap + offset * NAV_OFFSET_WEIGHT + along * 0.01;
    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

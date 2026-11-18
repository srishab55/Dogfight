import type { InputAction, KeyBindings } from '../config/controls';

/**
 * Turns raw keyboard events into game actions.
 *
 * Game code never sees a key code; it asks "was `cycleCamera` pressed this
 * frame?". That keeps bindings configurable and lets Phase 5 send *actions*
 * (not keys) to the server.
 *
 * Two kinds of query:
 *  - `isHeld(action)`: true for as long as a bound key is down (flight controls, Phase 1).
 *  - `wasPressed(action)`: true only in the frame the key went down (toggles).
 *
 * Call `endFrame()` once at the end of every frame to clear the "pressed" set.
 */
export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly keysPressedThisFrame = new Set<string>();
  private codesByAction: ReadonlyMap<InputAction, readonly string[]> = new Map();
  private boundCodes: ReadonlySet<string> = new Set();

  constructor(private readonly target: Window, bindings: KeyBindings) {
    this.setBindings(bindings);

    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
    // If the window loses focus while a key is held, its keyup goes to another
    // app and the key would stay "stuck" down. Forget everything instead.
    target.addEventListener('blur', this.releaseAll);
    target.document.addEventListener('visibilitychange', this.releaseAll);
  }

  /** Replaces the key bindings (the settings screen rebinds keys). */
  setBindings(bindings: KeyBindings): void {
    this.codesByAction = new Map(Object.entries(bindings) as Array<[InputAction, readonly string[]]>);
    this.boundCodes = new Set(Object.values(bindings).flat());
    this.releaseAll();
  }

  isHeld(action: InputAction): boolean {
    return this.anyBoundKey(action, this.heldKeys);
  }

  wasPressed(action: InputAction): boolean {
    return this.anyBoundKey(action, this.keysPressedThisFrame);
  }

  endFrame(): void {
    this.keysPressedThisFrame.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target.removeEventListener('blur', this.releaseAll);
    this.target.document.removeEventListener('visibilitychange', this.releaseAll);
  }

  private anyBoundKey(action: InputAction, keys: ReadonlySet<string>): boolean {
    const codes = this.codesByAction.get(action);
    return codes !== undefined && codes.some((code) => keys.has(code));
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // macOS never sends keyup for keys released while Cmd is held, so any key
    // held across a Cmd shortcut would stick. Release everything when Cmd goes down.
    if (event.key === 'Meta') {
      this.releaseAll();
      return;
    }
    // Leave Cmd+<key> (copy, reload, ...) and unbound keys to the browser.
    if (event.metaKey || !this.boundCodes.has(event.code)) return;
    // Menus keep their own keys: typing in a text box (all but Esc), and
    // Enter and Space on a focused button, tab or switch; the arrows on a slider, dropdown or arrow-key menu.
    if (ownedByFocusedControl(event)) return;

    // Stop bound keys from scrolling the page or triggering browser features.
    event.preventDefault();
    // Auto-repeat keydowns fire while a key is held; only the first one counts.
    if (event.repeat || this.heldKeys.has(event.code)) return;
    this.heldKeys.add(event.code);
    this.keysPressedThisFrame.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };

  private readonly releaseAll = (): void => {
    this.heldKeys.clear();
    this.keysPressedThisFrame.clear();
  };
}

/** Keys a focused interface control handles itself, so the game must leave them alone. */
function ownedByFocusedControl(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target === document.body) return false;
  const textEntry = target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type));
  if (textEntry) return event.code !== 'Escape';
  const arrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code);
  // Sliders and dropdowns use the arrows; so do menus and tab lists that move focus with them (marked data-arrow-keys).
  if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'range')) return arrow || ['Enter', 'NumpadEnter', 'Space'].includes(event.code);
  if (arrow) return target.closest('[data-arrow-keys]') !== null;
  const control = target instanceof HTMLButtonElement || target instanceof HTMLInputElement || target.getAttribute('role') === 'tab' || target.getAttribute('role') === 'switch';
  return control && ['Enter', 'NumpadEnter', 'Space'].includes(event.code);
}

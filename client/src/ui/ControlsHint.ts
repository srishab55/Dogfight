import { CONTROLS_HINT_ROWS, type KeyBindings } from '../config/controls';

/**
 * On-screen key reference. Generated from the live bindings, so it stays
 * correct when keys are rebound.
 */
export function createControlsHint(parent: HTMLElement, bindings: KeyBindings): HTMLElement {
  const element = document.createElement('div');
  element.className = 'controls-hint';
  for (const row of CONTROLS_HINT_ROWS) {
    const line = document.createElement('div');
    for (const action of row.actions) {
      const key = document.createElement('kbd');
      key.textContent = bindings[action].map(formatKeyCode).join('/');
      line.append(key);
    }
    line.append(` ${row.label}`);
    element.append(line);
  }
  element.append(
    Object.assign(document.createElement('div'), { className: 'controls-hint-note', textContent: 'Mouse flight: click the view, then aim with the mouse · Esc releases' }),
    Object.assign(document.createElement('div'), { className: 'controls-hint-note', textContent: 'Orbit camera: drag to rotate, scroll to zoom' }),
  );
  parent.append(element);
  return element;
}

/** "KeyC" -> "C", "Digit1" -> "1", "Backquote" -> "`", "ArrowUp" -> "↑". */
export function formatKeyCode(code: string): string {
  const named: Record<string, string> = {
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
  };
  return named[code] ?? code.replace(/^(Key|Digit)/, '');
}

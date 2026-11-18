/** "KeyC" -> "C", "Digit1" -> "1", "Backquote" -> "`", "ArrowUp" -> "↑". */
export function formatKeyCode(code: string): string {
  const named: Record<string, string> = {
    Backquote: '`',
    Escape: 'Esc',
    NumpadEnter: 'Enter',
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

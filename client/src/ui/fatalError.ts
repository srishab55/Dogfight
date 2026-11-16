/**
 * Shows an unrecoverable startup error on screen. Without it, a failure (no
 * WebGL, a shader compile error) leaves the player staring at a blank page.
 */
export function showFatalError(title: string, detail: string): void {
  const root = document.getElementById('ui-root') ?? document.body;
  const panel = document.createElement('div');
  panel.className = 'fatal-error';
  panel.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.textContent = title;
  const message = document.createElement('p');
  message.textContent = detail;
  panel.append(heading, message);
  root.append(panel);
}

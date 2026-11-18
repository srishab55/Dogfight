// Fonts, bundled with the game (SIL Open Font License): Rajdhani for headings, Inter for text, JetBrains Mono for instruments.
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles.css';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Game } from './core/Game';
import { showFatalError } from './ui/fatalError';

declare global {
  interface Window {
    /** Dev builds only: the running game, for poking at in the DevTools console. */
    dogfight?: Game;
  }
}

function bootstrap(): void {
  const canvas = document.getElementById('render-canvas');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('index.html is missing #render-canvas or #ui-root');
  }

  if (!Engine.isSupported()) {
    showFatalError(
      'WebGL is not available',
      'Dogfight needs WebGL 2. Use a current version of Chrome, Firefox, Safari or Edge, and check that hardware acceleration is enabled in the browser settings.',
    );
    return;
  }

  const game = new Game(canvas, uiRoot);
  game.start();
  if (import.meta.env.DEV) window.dogfight = game;
}

try {
  bootstrap();
} catch (error) {
  console.error(error);
  showFatalError('Dogfight failed to start', error instanceof Error ? error.message : String(error));
}

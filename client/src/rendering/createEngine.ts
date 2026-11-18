import { Engine } from '@babylonjs/core/Engines/engine';
import { RENDER_CONFIG } from '../config/graphics';

/**
 * Creates the WebGL2 engine. WebGL2 is used rather than WebGPU because it is
 * Babylon's most mature backend and runs in every desktop browser.
 */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(
    canvas,
    RENDER_CONFIG.antialias,
    {
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    },
    // We apply our own capped device pixel ratio below instead of Babylon's.
    false,
  );
  applyPixelRatio(engine);
  return engine;
}

/**
 * Sets the render resolution from the current device pixel ratio, capped by
 * config. Call again on resize, because dragging the window to another monitor
 * can change the ratio.
 */
/** @param renderScale the Graphics setting: draw the 3D view at this fraction of the screen's resolution. */
export function applyPixelRatio(engine: Engine, renderScale = 1): void {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.maxDevicePixelRatio) * renderScale;
  // Babylon expresses resolution as a "hardware scaling level": 0.5 renders 2x.
  engine.setHardwareScalingLevel(1 / pixelRatio);
}

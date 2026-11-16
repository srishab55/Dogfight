import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

/** A label and value shown in the overlay. */
export type DebugLine = readonly [label: string, value: string];

/** How often the text refreshes (s). Rewriting DOM text every frame wastes time and is unreadable. */
const REFRESH_INTERVAL = 0.25;

/**
 * Performance and state readout. Its purpose is to *measure* performance
 * rather than assume it: frame rate, CPU time per frame, physics rate, draw
 * calls and active meshes are the numbers to watch as features are added.
 * Game-specific lines are passed in by the game.
 */
export class DebugOverlay {
  private readonly element: HTMLPreElement;
  private readonly instrumentation: SceneInstrumentation;
  private sinceRefresh = REFRESH_INTERVAL;

  constructor(
    parent: HTMLElement,
    private readonly engine: Engine,
    private readonly scene: Scene,
    visible: boolean,
  ) {
    this.element = document.createElement('pre');
    this.element.className = 'debug-overlay';
    this.element.hidden = !visible;
    parent.append(this.element);

    this.instrumentation = new SceneInstrumentation(scene);
    // CPU time spent inside scene.render(), averaged by Babylon.
    this.instrumentation.captureRenderTime = true;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
    this.sinceRefresh = REFRESH_INTERVAL;
  }

  /** Call after scene.render() so the draw-call count is for the frame just drawn. */
  update(deltaSeconds: number, gameLines: () => readonly DebugLine[]): void {
    if (this.element.hidden) return;
    this.sinceRefresh += deltaSeconds;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;

    const fps = this.engine.getFps();
    const lines: DebugLine[] = [
      ['FPS', `${fps.toFixed(0)}  (${(1000 / Math.max(fps, 1)).toFixed(1)} ms)`],
      ['Render CPU', `${this.instrumentation.renderTimeCounter.lastSecAverage.toFixed(2)} ms`],
      ['Draw calls', `${this.instrumentation.drawCallsCounter.current}`],
      ['Meshes', `${this.scene.getActiveMeshes().length} active / ${this.scene.meshes.length} total`],
      ['Resolution', `${this.engine.getRenderWidth()} x ${this.engine.getRenderHeight()}`],
      ...gameLines(),
    ];
    const labelWidth = Math.max(...lines.map(([label]) => label.length)) + 2;
    this.element.textContent = lines.map(([label, value]) => `${label.padEnd(labelWidth)}${value}`).join('\n');
  }

  dispose(): void {
    this.instrumentation.dispose();
    this.element.remove();
  }
}

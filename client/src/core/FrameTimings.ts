/**
 * CPU time per subsystem, measured every frame with performance.now() and
 * smoothed, against the frame budget (16.7 ms at 60 FPS). The debug
 * overlay shows it, so slowdowns are measured before anything is changed
 * (game-skills/Performance: measure first). Costs a few calls a frame.
 */
export const FRAME_BUDGET_MS = 1000 / 60;

export type TimedSection = 'simulation' | 'visuals' | 'render' | 'hud';

const SECTIONS: readonly TimedSection[] = ['simulation', 'visuals', 'render', 'hud'];
/** Smoothing: each frame moves the average this far towards the new value. */
const SMOOTHING = 0.05;

export class FrameTimings {
  private readonly averages: Record<TimedSection, number> = { simulation: 0, visuals: 0, render: 0, hud: 0 };
  /** The worst frame total over the last second (ms): spikes matter more than the average. */
  private worst = 0;
  private worstWindow = 0;
  private windowAge = 0;
  private frameTotal = 0;
  private started = 0;

  /** Starts timing a section (sections run one after another, not nested). */
  begin(): void {
    this.started = performance.now();
  }

  end(section: TimedSection): void {
    const ms = performance.now() - this.started;
    this.averages[section] += (ms - this.averages[section]) * SMOOTHING;
    this.frameTotal += ms;
  }

  /** At the end of each frame. */
  endFrame(deltaSeconds: number): void {
    this.worstWindow = Math.max(this.worstWindow, this.frameTotal);
    this.frameTotal = 0;
    this.windowAge += deltaSeconds;
    if (this.windowAge >= 1) {
      this.worst = this.worstWindow;
      this.worstWindow = 0;
      this.windowAge = 0;
    }
  }

  average(section: TimedSection): number {
    return this.averages[section];
  }

  /** The smoothed CPU total of the timed sections (ms). */
  get total(): number {
    return SECTIONS.reduce((sum, s) => sum + this.averages[s], 0);
  }

  get worstFrame(): number {
    return this.worst;
  }
}

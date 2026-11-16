/**
 * Runs the simulation in fixed steps, decoupled from the display's frame rate.
 *
 * Each frame, the real elapsed time is added to an accumulator, and as many
 * whole steps as fit are run. The leftover fraction ("alpha", 0-1) tells the
 * renderer how far between the previous and current physics states to draw.
 * Physics therefore sees the same dt every step whether the screen runs at
 * 30, 60 or 144 Hz, and motion still looks smooth at any refresh rate.
 *
 *   frame:  |-------16.7 ms-------|-------16.7 ms-------|
 *   steps:  |----step----|----step----|----step----|
 */
export class FixedTimestepLoop {
  private accumulator = 0;
  private stepsInWindow = 0;
  private windowSeconds = 0;
  /** Physics steps actually run per second, measured. Should equal the configured rate. */
  measuredStepsPerSecond = 0;
  /** Times a frame hit `maxStepsPerFrame` and dropped simulation time. */
  droppedFrames = 0;

  constructor(
    readonly stepSeconds: number,
    private readonly maxStepsPerFrame: number,
  ) {}

  /** Runs due steps and returns the interpolation alpha for rendering. */
  advance(frameSeconds: number, step: (dt: number) => void): number {
    this.accumulator += frameSeconds;
    let steps = 0;
    while (this.accumulator >= this.stepSeconds && steps < this.maxStepsPerFrame) {
      step(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    // If the browser stalled, drop the backlog rather than trying to catch up,
    // which would make the next frame even slower (the "spiral of death").
    if (this.accumulator >= this.stepSeconds) {
      this.accumulator = 0;
      this.droppedFrames++;
    }

    this.stepsInWindow += steps;
    this.windowSeconds += frameSeconds;
    if (this.windowSeconds >= 1) {
      this.measuredStepsPerSecond = this.stepsInWindow / this.windowSeconds;
      this.stepsInWindow = 0;
      this.windowSeconds = 0;
    }
    return this.accumulator / this.stepSeconds;
  }

  /** Forget leftover time, e.g. after a respawn, so the first frame doesn't interpolate from the old state. */
  reset(): void {
    this.accumulator = 0;
  }
}

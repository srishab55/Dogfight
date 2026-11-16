import { neutralControls, type FlightControls, type StickInputs } from '@dogfight/shared';
import { KEYBOARD_FLIGHT_CONFIG, type InputAction } from '../config/controls';
import type { InputManager } from './InputManager';

/**
 * Turns held keys into smooth, absolute flight controls (see FlightControls).
 * Runs once per *physics step*, not per rendered frame, so the result is the
 * same at any frame rate. Phase 5 sends these values to the server.
 */
export class FlightInputController {
  private readonly current: FlightControls = neutralControls();
  private flapNotch = 0;

  constructor(private readonly input: InputManager) {}

  get controls(): Readonly<FlightControls> {
    return this.current;
  }

  /** Name of the flap lever's current notch, e.g. "LANDING". */
  get flapNotchName(): string {
    return KEYBOARD_FLIGHT_CONFIG.flapNotchNames[this.flapNotch] ?? '';
  }

  /** Move the flap lever one notch down (+1) or up (-1). Called on key press, not every step. */
  stepFlaps(direction: 1 | -1): void {
    const notches = KEYBOARD_FLIGHT_CONFIG.flapNotches;
    this.flapNotch = Math.max(0, Math.min(notches.length - 1, this.flapNotch + direction));
    this.current.flaps = notches[this.flapNotch] ?? 0;
  }

  /**
   * @param assist stick positions from the mouse-flight pilot, or null. On
   *   each axis a held key wins; otherwise the assist value is used.
   */
  update(dt: number, assist: Readonly<StickInputs> | null = null): Readonly<FlightControls> {
    const c = this.current;
    c.pitch = this.axis(c.pitch, 'pitchUp', 'pitchDown', assist?.pitch, dt);
    c.roll = this.axis(c.roll, 'rollRight', 'rollLeft', assist?.roll, dt);
    c.yaw = this.axis(c.yaw, 'yawRight', 'yawLeft', assist?.yaw, dt);

    const throttle = c.throttle + this.direction('throttleUp', 'throttleDown') * KEYBOARD_FLIGHT_CONFIG.throttlePerSecond * dt;
    c.throttle = Math.min(1, Math.max(0, throttle));
    c.brake = KEYBOARD_FLIGHT_CONFIG.autoBrakeAtIdle && c.throttle === 0 ? 1 : 0;
    c.fire = this.input.isHeld('fireGuns');
    return c;
  }

  /** Centre the stick and set the throttle and flap levers, e.g. on respawn. */
  reset(throttle = 0, flaps = 0): void {
    const notches: readonly number[] = KEYBOARD_FLIGHT_CONFIG.flapNotches;
    // Snap the flap lever to the nearest notch.
    this.flapNotch = notches.reduce((best, value, index) => (Math.abs(value - flaps) < Math.abs((notches[best] ?? 0) - flaps) ? index : best), 0);
    Object.assign(this.current, neutralControls(), { throttle, flaps: notches[this.flapNotch] ?? 0 });
    this.current.brake = KEYBOARD_FLIGHT_CONFIG.autoBrakeAtIdle && throttle === 0 ? 1 : 0;
  }

  private axis(current: number, positive: InputAction, negative: InputAction, assist: number | undefined, dt: number): number {
    const direction = this.direction(positive, negative);
    if (direction !== 0 || assist === undefined) return rampAxis(current, direction, dt);
    return assist;
  }

  /** +1 if only `positive` is held, -1 if only `negative`, 0 for neither or both. */
  private direction(positive: InputAction, negative: InputAction): number {
    return (this.input.isHeld(positive) ? 1 : 0) - (this.input.isHeld(negative) ? 1 : 0);
  }
}

/** Moves `current` towards `target` at the ramp rate, or faster when recentring or reversing. */
function rampAxis(current: number, target: number, dt: number): number {
  const recentring = target === 0 || (current !== 0 && Math.sign(target) !== Math.sign(current));
  const step = (recentring ? KEYBOARD_FLIGHT_CONFIG.axisReturnPerSecond : KEYBOARD_FLIGHT_CONFIG.axisRampPerSecond) * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

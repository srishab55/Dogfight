import { neutralControls, type FlightControls, type StickInputs } from '@dogfight/shared';
import { KEYBOARD_FLIGHT_CONFIG, type InputAction } from '../config/controls';
import type { InputManager } from './InputManager';

/** The keys that fly the aircraft: pressing any of them takes over from an autopilot. */
const FLIGHT_ACTIONS: readonly InputAction[] = ['pitchUp', 'pitchDown', 'rollLeft', 'rollRight', 'yawLeft', 'yawRight', 'throttleUp', 'throttleDown', 'flapsDown', 'flapsUp', 'brake', 'toggleDiveBrakes'];

/**
 * Turns held keys into smooth, absolute flight controls (see FlightControls).
 * Runs once per *physics step*, not per rendered frame, so the result is the
 * same at any frame rate. Phase 5 sends these values to the server.
 */
export class FlightInputController {
  private readonly current: FlightControls = neutralControls();
  private flapNotch = 0;
  /** The Dive Bomber's dive brakes, toggled with X. B opens the air brakes only while held. */
  private diveBrakesOpen = false;
  /** Left/right as a smooth turn command (-1 to 1) for car-like steering. */
  private turn = 0;

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

  /** Dive brakes: one key press opens them, the next closes them. Returns whether they are now open. */
  toggleAirbrake(): boolean {
    this.diveBrakesOpen = !this.diveBrakesOpen;
    return this.diveBrakesOpen;
  }

  /**
   * Car-like steering inputs for this step: the left/right keys as a turn
   * command (ramped, so a tap is a gentle turn), and whether a pitch key is held.
   */
  steeringInputs(dt: number): { turn: number; pitchByHand: boolean } {
    this.turn = rampAxis(this.turn, this.direction('rollRight', 'rollLeft'), dt);
    return { turn: this.turn, pitchByHand: this.input.isHeld('pitchUp') || this.input.isHeld('pitchDown') };
  }

  /**
   * @param assist stick positions from a pilot assist (mouse flight or car-like steering), or null.
   * @param steering true for car-like steering: left/right drive the assist, so the assist always sets the roll.
   *   Otherwise a held key wins on each axis, and the assist fills in the rest.
   * @param assistAirbrake air brakes the assist asks for (to slow to the best turning speed), 0-1.
   */
  update(dt: number, assist: Readonly<StickInputs> | null = null, steering = false, assistAirbrake = 0): Readonly<FlightControls> {
    const c = this.current;
    c.pitch = this.axis(c.pitch, 'pitchUp', 'pitchDown', assist?.pitch, dt);
    c.roll = steering && assist ? assist.roll : this.axis(c.roll, 'rollRight', 'rollLeft', assist?.roll, dt);
    c.yaw = this.axis(c.yaw, 'yawRight', 'yawLeft', assist?.yaw, dt);

    const throttle = c.throttle + this.direction('throttleUp', 'throttleDown') * KEYBOARD_FLIGHT_CONFIG.throttlePerSecond * dt;
    c.throttle = Math.min(1, Math.max(0, throttle));
    // B: wheel brakes on the ground, air brakes in the air (both at once is fine: each only acts where it can).
    const braking = this.input.isHeld('brake');
    c.brake = braking || (KEYBOARD_FLIGHT_CONFIG.autoBrakeAtIdle && c.throttle === 0) ? 1 : 0;
    c.airbrake = braking || this.diveBrakesOpen ? 1 : assistAirbrake;
    c.fire = this.input.isHeld('fireGuns');
    return c;
  }

  /**
   * An autopilot (auto-land) flies: its stick, throttle, flaps and brakes
   * become the controls. The levers are left where it put them, so taking
   * over carries on smoothly. The guns stay yours.
   */
  autopilot(controls: Readonly<FlightControls>): Readonly<FlightControls> {
    const c = this.current;
    c.pitch = controls.pitch;
    c.roll = controls.roll;
    c.yaw = controls.yaw;
    c.throttle = controls.throttle;
    c.brake = controls.brake;
    c.airbrake = controls.airbrake;
    this.diveBrakesOpen = false;
    this.turn = 0;
    if (c.flaps !== controls.flaps) this.setFlapLever(controls.flaps);
    c.fire = this.input.isHeld('fireGuns');
    return c;
  }

  /** Whether the pilot is touching any flight control (stick, rudder, throttle, flaps or brakes): that takes over from an autopilot. */
  flyingByHand(): boolean {
    return FLIGHT_ACTIONS.some((action) => this.input.isHeld(action));
  }

  /** Centre the stick and set the throttle and flap levers, e.g. on respawn. */
  reset(throttle = 0, flaps = 0): void {
    this.diveBrakesOpen = false;
    this.turn = 0;
    Object.assign(this.current, neutralControls(), { throttle });
    this.setFlapLever(flaps);
    this.current.brake = KEYBOARD_FLIGHT_CONFIG.autoBrakeAtIdle && throttle === 0 ? 1 : 0;
  }

  /** Snaps the flap lever to the notch nearest `flaps`. */
  private setFlapLever(flaps: number): void {
    const notches: readonly number[] = KEYBOARD_FLIGHT_CONFIG.flapNotches;
    this.flapNotch = notches.reduce((best, value, index) => (Math.abs(value - flaps) < Math.abs((notches[best] ?? 0) - flaps) ? index : best), 0);
    this.current.flaps = notches[this.flapNotch] ?? 0;
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

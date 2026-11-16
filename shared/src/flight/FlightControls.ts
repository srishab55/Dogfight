/**
 * The pilot's inputs for one physics step. All values are *absolute*
 * positions, not changes. In Phase 5 this exact object is what clients send
 * to the server, so a lost packet can't leave the throttle "half pressed".
 *
 * Sign convention (pilot's view, not raw axis maths):
 *   pitch +1 = stick back (nose up)    -1 = stick forward
 *   roll  +1 = roll right              -1 = roll left
 *   yaw   +1 = right rudder (nose right)
 */
export interface FlightControls {
  pitch: number;
  roll: number;
  yaw: number;
  /** Throttle lever position, 0 (idle) to 1 (full power). */
  throttle: number;
  /** Wheel brakes, 0 to 1. Only has an effect on the ground. */
  brake: number;
  /** Flap lever, 0 (up) to 1 (fully down). The flaps travel there at their own speed. */
  flaps: number;
  /** Gun trigger held. */
  fire: boolean;
}

export function neutralControls(): FlightControls {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0, flaps: 0, fire: false };
}

/** Clamps every input to its valid range. The server will run this on every client message. */
export function sanitizeControls(controls: FlightControls): FlightControls {
  const clamp = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0);
  controls.pitch = clamp(controls.pitch, -1, 1);
  controls.roll = clamp(controls.roll, -1, 1);
  controls.yaw = clamp(controls.yaw, -1, 1);
  controls.throttle = clamp(controls.throttle, 0, 1);
  controls.brake = clamp(controls.brake, 0, 1);
  controls.flaps = clamp(controls.flaps, 0, 1);
  controls.fire = controls.fire === true;
  return controls;
}

/**
 * Keyboard bindings, keyed by action. Values are `KeyboardEvent.code` strings,
 * which identify the *physical* key, so bindings keep working on AZERTY,
 * Dvorak and other layouts. Each action may have several keys.
 *
 * Throttle is on the arrow keys (decision D10 in ARCHITECTURE.md): Ctrl+W
 * closes the browser tab on Windows and Linux, and pages can't block it.
 * Guns are on Space; wheel brakes on B (IL-2's key). Bombs arrive with the rest of Phase 4, on another key. The mouse can
 * fly the aircraft too (MOUSE_FLIGHT_CONFIG below). X opens and closes the
 * dive brakes (only the Dive Bomber has them). Everything else (aircraft,
 * paint, base and how to start in the hangar; steering, mouse, sound and
 * these keys in Settings) is set from the menus, so the flight keys stay few.
 * Players can rebind the flight keys (core/Settings.ts); these are the defaults.
 */
export const KEY_BINDINGS = {
  // ── In flight ──
  pitchUp: ['KeyW'],
  pitchDown: ['KeyS'],
  rollLeft: ['KeyA'],
  rollRight: ['KeyD'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ArrowUp'],
  throttleDown: ['ArrowDown'],
  flapsDown: ['KeyF'],
  flapsUp: ['KeyV'],
  brake: ['KeyB'],
  toggleDiveBrakes: ['KeyX'],
  fireGuns: ['Space'],
  cycleCamera: ['KeyC'],
  autoLand: ['KeyP'],
  toggleMap: ['KeyN'],
  /** The pause menu in flight; back out of any screen. */
  openHangar: ['Escape'],
  toggleDebugOverlay: ['Backquote'],
  // ── In the hangar (shortcuts for its buttons) ──
  pickerPrevious: ['ArrowLeft'],
  pickerNext: ['ArrowRight'],
  /** FLY (and the menus' main button); after a crash, flies again straight from the crash screen. */
  pickerConfirm: ['Enter', 'NumpadEnter'],
  selectInterceptor: ['Digit1'],
  selectFighterBomber: ['Digit2'],
  selectHeavyBomber: ['Digit3'],
  selectNavalFighter: ['Digit4'],
  selectDiveBomber: ['Digit5'],
  selectTriplane: ['Digit6'],
  selectBiplane: ['Digit7'],
} as const satisfies Record<string, readonly string[]>;

export type InputAction = keyof typeof KEY_BINDINGS;
export type KeyBindings = Readonly<Record<InputAction, readonly string[]>>;

/**
 * Keyboard keys are on/off, but control surfaces should move smoothly. Each
 * flight axis ramps towards full deflection while its key is held and
 * recentres when released, so a quick tap gives a small correction and a
 * hold gives full deflection.
 */
/**
 * Keyboard steering modes. "easy": A/D turn the aircraft like a car (it
 * banks, pulls, then levels itself when you let go). "direct": A/D roll the
 * aircraft and you pull to turn, as in a real aircraft. K switches.
 */
export const STEERING_CONFIG = {
  defaultMode: 'easy' as 'easy' | 'direct',
  /** In easy steering, hard turns above this multiple of the corner speed ease the air brakes out to turn tighter. */
  brakeAboveCornerSpeed: 1.05,
  /** Air brake per unit of speed ratio above that. */
  brakePerSpeedRatio: 5,
} as const;

export const KEYBOARD_FLIGHT_CONFIG = {
  /** Deflection gained per second while a key is held (3.5 = full deflection in ~0.3 s). */
  axisRampPerSecond: 3.5,
  /** Recentring speed when released or reversed (per second). */
  axisReturnPerSecond: 6,
  /** Throttle lever travel per second while an arrow is held (0.5 = idle to full in 2 s). */
  throttlePerSecond: 0.5,
  /**
   * Apply the wheel brakes automatically whenever the throttle is at idle.
   * Off: the brakes are on their own key (B), so you can roll freely at idle.
   */
  autoBrakeAtIdle: false,
  /** Flap lever positions that F / V step through: up, take-off, landing. */
  flapNotches: [0, 0.5, 1],
  flapNotchNames: ['UP', 'TAKE-OFF', 'LANDING'],
} as const;

/**
 * Mouse flight: click the game to capture the mouse. Moving it swings an aim
 * circle (and the camera), and the aircraft flies itself towards it using the
 * shared direction pilot. Esc releases the mouse. Holding a flight key
 * overrides the mouse on that axis.
 */
export const MOUSE_FLIGHT_CONFIG = {
  /** Default aim movement per pixel of mouse movement (deg). [ and ] adjust it in flight; the choice is remembered. */
  sensitivityDegPerPixel: 0.2,
  minSensitivity: 0.04,
  maxSensitivity: 0.8,
  /** Each [ or ] press scales sensitivity by this factor. */
  sensitivityStep: 1.25,
  /** Push the mouse forward to aim down (like a joystick) instead of up. */
  invertY: false,
  /** The aim can't go beyond this far above or below the horizon (deg). */
  maxAimElevationDeg: 80,
  /** Distance of the aim point used for the reticle and the camera (m). */
  aimDistance: 1_000,
  camera: {
    /** Behind the aircraft along the aim direction, and above it (m, at airframe scale 1). */
    distance: 19,
    height: 4.5,
    /** How quickly the camera follows the aim (1/s): high, so it feels attached to the mouse. */
    sharpness: 20,
  },
} as const;

/** What each rebindable flight key does, as the Settings screen lists it. */
export const ACTION_LABELS: Readonly<Partial<Record<InputAction, string>>> = {
  pitchUp: 'Pitch up',
  pitchDown: 'Pitch down',
  rollLeft: 'Turn / roll left',
  rollRight: 'Turn / roll right',
  yawLeft: 'Rudder left',
  yawRight: 'Rudder right',
  throttleUp: 'Throttle up',
  throttleDown: 'Throttle down',
  brake: 'Brakes (hold): wheels, or air brakes in flight',
  flapsDown: 'Flaps down a notch',
  flapsUp: 'Flaps up a notch',
  fireGuns: 'Fire guns (hold)',
  toggleDiveBrakes: 'Dive brakes (Dive Bomber)',
  cycleCamera: 'Camera: chase / cockpit / orbit',
  autoLand: 'Auto-land at the nearest base',
  toggleMap: 'Map: corner / large / off',
};

/** Keys a flight action can't take: they run the menus, move focus or open the debug overlay. */
export const RESERVED_KEYS: readonly string[] = ['Escape', 'Enter', 'NumpadEnter', 'Tab', 'Backquote', 'MetaLeft', 'MetaRight'];

/**
 * A gamepad in the browser's "standard" layout (Xbox names; a PlayStation
 * pad's buttons sit in the same places). Button indices are the Gamepad
 * API's. In flight: the left stick is the control column (pull back to climb,
 * unless inverted in Settings), the right stick's sideways axis the rudder,
 * the triggers move the throttle lever. In the menus: the D-pad or left
 * stick moves between controls, A presses, B or Menu goes back, LB/RB change tab.
 */
export const GAMEPAD_CONFIG = {
  /** Stick movement ignored round the centre (fraction of full travel). */
  deadzone: 0.18,
  /** Throttle lever travel per second with a trigger fully in, as a multiple of the arrow keys' rate. */
  throttleRateScale: 1,
  /** In the menus, a stick pushed this far counts as a direction. */
  menuStickThreshold: 0.55,
  /** Holding a direction in the menus repeats it after this delay, then this often (s). */
  menuRepeatDelay: 0.4,
  menuRepeatInterval: 0.12,
  /** In flight: the actions each button gives (held for as long as it is down). */
  flightButtons: {
    0: ['fireGuns', 'pickerConfirm'],
    1: ['brake'],
    2: ['toggleDiveBrakes'],
    3: ['cycleCamera'],
    4: ['yawLeft'],
    5: ['yawRight'],
    8: ['toggleMap'],
    9: ['openHangar'],
    12: ['flapsUp'],
    13: ['flapsDown'],
    15: ['autoLand'],
  } as Readonly<Record<number, readonly InputAction[]>>,
} as const;

/** The gamepad layout as the Settings screen lists it. */
export const GAMEPAD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['Left stick', 'Pitch and roll (in Easy steering: turn)'],
  ['Right stick ↔', 'Rudder'],
  ['RT / LT', 'Throttle up / down'],
  ['A', 'Fire guns; after a crash, fly again'],
  ['B', 'Brakes (wheels on the ground, air brakes in the air)'],
  ['X', 'Dive brakes'],
  ['Y', 'Camera'],
  ['LB / RB', 'Rudder left / right'],
  ['D-pad ↑ / ↓', 'Flaps up / down'],
  ['D-pad →', 'Auto-land'],
  ['View', 'Map'],
  ['Menu', 'Pause menu'],
  ['Menus', 'D-pad or stick to move, A to press, B to go back, LB / RB to change tab'],
];

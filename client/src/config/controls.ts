/**
 * Keyboard bindings, keyed by action. Values are `KeyboardEvent.code` strings,
 * which identify the *physical* key, so bindings keep working on AZERTY,
 * Dvorak and other layouts. Each action may have several keys.
 *
 * Throttle is on the arrow keys (decision D10 in ARCHITECTURE.md): Ctrl+W
 * closes the browser tab on Windows and Linux, and pages can't block it.
 * Guns are on Space. Bombs (B) arrive with the rest of Phase 4. The mouse can
 * fly the aircraft too (MOUSE_FLIGHT_CONFIG below). X opens and closes the
 * dive brakes (only the Dive Bomber has them).
 * The Settings screen (Phase 8) will let players override these defaults.
 */
export const KEY_BINDINGS = {
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
  toggleDiveBrakes: ['KeyX'],
  fireGuns: ['Space'],
  cycleCamera: ['KeyC'],
  respawn: ['KeyR'],
  airStart: ['KeyT'],
  landingPractice: ['KeyL'],
  selectInterceptor: ['Digit1'],
  selectFighterBomber: ['Digit2'],
  selectHeavyBomber: ['Digit3'],
  selectNavalFighter: ['Digit4'],
  selectDiveBomber: ['Digit5'],
  mouseSensitivityDown: ['BracketLeft'],
  mouseSensitivityUp: ['BracketRight'],
  toggleControlsHelp: ['KeyH'],
  toggleDebugOverlay: ['Backquote'],
} as const satisfies Record<string, readonly string[]>;

export type InputAction = keyof typeof KEY_BINDINGS;
export type KeyBindings = Readonly<Record<InputAction, readonly string[]>>;

/**
 * Keyboard keys are on/off, but control surfaces should move smoothly. Each
 * flight axis ramps towards full deflection while its key is held and
 * recentres when released, so a quick tap gives a small correction and a
 * hold gives full deflection.
 */
export const KEYBOARD_FLIGHT_CONFIG = {
  /** Deflection gained per second while a key is held (3.5 = full deflection in ~0.3 s). */
  axisRampPerSecond: 3.5,
  /** Recentring speed when released or reversed (per second). */
  axisReturnPerSecond: 6,
  /** Throttle lever travel per second while an arrow is held (0.5 = idle to full in 2 s). */
  throttlePerSecond: 0.5,
  /** Apply the wheel brakes automatically whenever the throttle is at idle. */
  autoBrakeAtIdle: true,
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

/** Rows of the on-screen controls reference (H). Generated from the bindings, so it stays correct when keys change. */
export const CONTROLS_HINT_ROWS: ReadonlyArray<{ readonly actions: readonly InputAction[]; readonly label: string }> = [
  { actions: ['pitchUp', 'pitchDown'], label: 'Pitch up / down' },
  { actions: ['rollLeft', 'rollRight'], label: 'Roll left / right' },
  { actions: ['yawLeft', 'yawRight'], label: 'Rudder left / right (steers on the ground)' },
  { actions: ['throttleUp', 'throttleDown'], label: 'Throttle up / down (idle = brakes)' },
  { actions: ['flapsDown', 'flapsUp'], label: 'Flaps down / up a notch' },
  { actions: ['toggleDiveBrakes'], label: 'Dive brakes out / in (Dive Bomber)' },
  { actions: ['fireGuns'], label: 'Fire guns (hold; limited ammo, watch the heat)' },
  { actions: ['cycleCamera'], label: 'Camera: chase / cockpit / orbit' },
  { actions: ['respawn'], label: 'Respawn at your base (airfield or carrier)' },
  { actions: ['airStart'], label: 'Air start (800 m, for testing)' },
  { actions: ['landingPractice'], label: 'Landing practice (carrier aircraft: the carrier)' },
  { actions: ['selectInterceptor', 'selectFighterBomber', 'selectHeavyBomber', 'selectNavalFighter', 'selectDiveBomber'], label: 'Interceptor / Fighter-Bomber / Heavy Bomber / Naval Fighter / Dive Bomber' },
  { actions: ['mouseSensitivityDown', 'mouseSensitivityUp'], label: 'Mouse sensitivity down / up' },
  { actions: ['toggleControlsHelp'], label: 'Hide this help' },
  { actions: ['toggleDebugOverlay'], label: 'Debug stats' },
];

import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MOUSE_FLIGHT_CONFIG } from '../config/controls';

const DEG = Math.PI / 180;
const SENSITIVITY_STORAGE_KEY = 'dogfight.mouseSensitivity';

/**
 * Mouse flight input. Clicking the canvas captures the mouse (Pointer Lock):
 * the cursor disappears and mouse movement turns an aim direction, stored as
 * a heading and elevation in the world. The game steers the aircraft
 * towards it and points the camera along it. Esc releases the mouse, which
 * the browser always allows.
 *
 * If the browser refuses pointer lock (some embedded or headless browsers),
 * it falls back to reading relative movement of the visible cursor.
 */
export class MouseFlight {
  private aimHeading = 0;
  private aimElevation = 0;
  private enabled = false;
  /** Aim movement per pixel (deg). Remembered in this browser between sessions. */
  private sensitivityDegPerPixel = loadSensitivity();
  /** False while the orbit camera owns the mouse. */
  captureAllowed = true;
  /** Called when mouse flight starts or stops (e.g. to aim along the nose, show a message). */
  onChange: (active: boolean) => void = () => {};
  /** The player let go of the mouse (Esc) while flying with it: the game opens the hangar. */
  onUserRelease: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', this.handleClick);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
  }

  get active(): boolean {
    return this.enabled;
  }

  get sensitivity(): number {
    return this.sensitivityDegPerPixel;
  }

  /** Sets the sensitivity (deg per pixel), clamped to the configured range, and remembers it. */
  setSensitivity(degreesPerPixel: number): number {
    return this.adjustSensitivity(degreesPerPixel / this.sensitivityDegPerPixel);
  }

  /** Scales sensitivity (e.g. 1.25 up, 0.8 down), clamped to the configured range, and remembers it. */
  adjustSensitivity(factor: number): number {
    const { minSensitivity, maxSensitivity } = MOUSE_FLIGHT_CONFIG;
    this.sensitivityDegPerPixel = Math.min(maxSensitivity, Math.max(minSensitivity, this.sensitivityDegPerPixel * factor));
    try {
      localStorage.setItem(SENSITIVITY_STORAGE_KEY, String(this.sensitivityDegPerPixel));
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the setting just won't persist.
    }
    return this.sensitivityDegPerPixel;
  }

  /** Point the aim along a world direction, e.g. the aircraft's nose when mouse flight starts. */
  aimAlong(direction: { x: number; y: number; z: number }): void {
    this.aimHeading = Math.atan2(direction.x, direction.z);
    const horizontal = Math.hypot(direction.x, direction.z);
    this.aimElevation = clampElevation(Math.atan2(direction.y, horizontal));
  }

  /** Writes the unit aim direction into `out`. */
  aimDirection(out: Vector3): Vector3 {
    const c = Math.cos(this.aimElevation);
    return out.set(c * Math.sin(this.aimHeading), Math.sin(this.aimElevation), c * Math.cos(this.aimHeading));
  }

  /** Start without pointer lock (fallback, and for automated tests). */
  activateWithoutLock(): void {
    this.setEnabled(true);
  }

  release(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setEnabled(false);
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
  }

  private setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.onChange(enabled);
  }

  private readonly handleClick = (): void => {
    if (!this.captureAllowed || this.enabled) return;
    // requestPointerLock returns a promise in current browsers, nothing in older ones.
    const request = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (request && typeof request.catch === 'function') request.catch(() => this.activateWithoutLock());
  };

  private readonly handleLockChange = (): void => {
    const wasEnabled = this.enabled;
    const locked = document.pointerLockElement === this.canvas;
    this.setEnabled(locked);
    // Lost without release() being called: the player pressed Esc.
    if (wasEnabled && !locked) this.onUserRelease();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) return;
    const step = this.sensitivityDegPerPixel * DEG;
    this.aimHeading += event.movementX * step;
    this.aimElevation = clampElevation(this.aimElevation - event.movementY * step * (MOUSE_FLIGHT_CONFIG.invertY ? -1 : 1));
  };
}

function loadSensitivity(): number {
  const { sensitivityDegPerPixel, minSensitivity, maxSensitivity } = MOUSE_FLIGHT_CONFIG;
  try {
    const stored = Number(localStorage.getItem(SENSITIVITY_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= minSensitivity && stored <= maxSensitivity) return stored;
  } catch {
    // Storage unavailable: use the default.
  }
  return sensitivityDegPerPixel;
}

function clampElevation(radians: number): number {
  const limit = MOUSE_FLIGHT_CONFIG.maxAimElevationDeg * DEG;
  return Math.max(-limit, Math.min(limit, radians));
}

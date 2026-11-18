/** Menus, screens and the settings' ranges. */
export const UI_CONFIG = {
  /** After a crash, the respawn screen opens on its own after this long (s); Enter flies again sooner. */
  respawnScreenDelaySeconds: 1.5,
  /** Esc is ignored this soon after a screen opens: leaving pointer lock can deliver the same Esc twice (s). */
  escDebounceSeconds: 0.3,
  hudScale: { min: 0.8, max: 1.4, step: 0.05 },
  renderScale: { min: 0.5, max: 1, step: 0.05 },
  cameraSensitivity: { min: 0.5, max: 2, step: 0.1 },
  /**
   * The HUD's bottom row at scale 1: the airframe, instruments and weapons
   * panels side by side, plus the gaps and edges (px). The HUD scale is
   * capped so that row always fits the window.
   */
  hudRowWidth: 1_120 + 64,
  callsign: { storageKey: 'dogfight.callsign', maxLength: 16, fallback: 'PILOT' },
  /** The hangar's base map (CSS px). */
  hangarMapSize: 188,
} as const;

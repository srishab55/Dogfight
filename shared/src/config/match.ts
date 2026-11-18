/**
 * A match: Blue against Red over the islands, against the clock. Each team
 * starts with its carrier; the three island airfields belong to nobody.
 * When the time is up, the team holding more bases wins (equal: a draw). A
 * team that holds no base at all has nowhere to start from, and loses at once.
 */
export const MATCH_CONFIG = {
  /** The lengths a player can choose, and the default (minutes). */
  lengthsMinutes: [5, 10, 15] as const,
  defaultMinutes: 10,
} as const;

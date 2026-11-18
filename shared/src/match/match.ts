import { basesHeld, type BaseControl } from '../combat/baseControl';
import { MATCH_CONFIG } from '../config/match';
import type { Team } from '../types/team';

/** How a match ended. */
export interface MatchResult {
  /** Null: a draw. */
  readonly winner: Team | null;
  /** "time": the clock ran out and bases were counted; "eliminated": the loser held no base. */
  readonly reason: 'time' | 'eliminated';
  /** Bases each team held at the end. */
  readonly bases: Readonly<Record<Team, number>>;
}

export interface MatchState {
  readonly lengthSeconds: number;
  /** Match time so far (s): only while it's being played. */
  elapsed: number;
  result: MatchResult | null;
}

export function createMatch(lengthMinutes: number = MATCH_CONFIG.defaultMinutes): MatchState {
  return { lengthSeconds: lengthMinutes * 60, elapsed: 0, result: null };
}

export function remainingSeconds(match: Readonly<MatchState>): number {
  return Math.max(0, match.lengthSeconds - match.elapsed);
}

/**
 * Advances the clock and applies the rules (MATCH_CONFIG). Returns the
 * result on the step the match ends, and null otherwise (and after it's over).
 */
export function stepMatch(match: MatchState, bases: readonly BaseControl[], dt: number): MatchResult | null {
  if (match.result) return null;
  match.elapsed += dt;
  const held = { blue: basesHeld(bases, 'blue'), red: basesHeld(bases, 'red') };
  // A team with no base left can't put an aircraft in the air: it has lost.
  if (held.blue === 0 || held.red === 0) {
    match.result = { winner: held.blue === 0 ? (held.red === 0 ? null : 'red') : 'blue', reason: 'eliminated', bases: held };
    return match.result;
  }
  if (match.elapsed < match.lengthSeconds) return null;
  match.result = { winner: held.blue > held.red ? 'blue' : held.red > held.blue ? 'red' : null, reason: 'time', bases: held };
  return match.result;
}

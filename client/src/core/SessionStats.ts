import type { CombatEvent, TargetKind } from '@dogfight/shared';

/**
 * What the player did this match, for the after-action report: counted
 * from the combat events and the flight's own state, never estimated.
 */
export class SessionStats {
  /** Game clock at the first sortie (s), or null before it. */
  startedAt: number | null = null;
  sorties = 0;
  /** Time actually flying: unpaused and not crashed (s). */
  flightSeconds = 0;
  readonly destroyed = new Map<TargetKind, number>();
  shotDown = 0;
  crashes = 0;
  /** Hull points removed from enemy targets by the player's rounds. */
  damageDealt = 0;
  roundsFired = 0;
  /** Rounds that hit a target (each round hits at most one). */
  hits = 0;
  basesCaptured = 0;
  /** Enemy aircraft the player shot down. */
  kills = 0;

  constructor(
    private readonly playerId: number,
    private readonly playerTeam: string,
  ) {}

  sortieStarted(clock: number): void {
    this.startedAt ??= clock;
    this.sorties++;
  }

  record(event: CombatEvent): void {
    switch (event.type) {
      case 'targetHit':
      case 'targetDestroyed':
        if (event.owner !== this.playerId) return;
        this.hits++;
        this.damageDealt += event.damage;
        if (event.type === 'targetDestroyed') this.destroyed.set(event.kind, (this.destroyed.get(event.kind) ?? 0) + 1);
        return;
      case 'baseCaptured':
        if (event.owner === this.playerTeam) this.basesCaptured++;
        return;
      case 'aircraftShotDown':
        if (event.owner === this.playerId && event.victim !== this.playerId) this.kills++;
        return;
      case 'aircraftHit':
        // Rounds on enemy aircraft count towards accuracy and damage dealt too.
        if (event.owner === this.playerId && event.victim !== this.playerId) {
          this.hits++;
          this.damageDealt += event.damage;
        }
        return;
      default:
    }
  }

  /** The aircraft was lost: shot down, or crashed for another reason. */
  lost(reason: string | null): void {
    if (reason === 'shot down') this.shotDown++;
    else this.crashes++;
  }

  get targetsDestroyed(): number {
    let total = 0;
    for (const count of this.destroyed.values()) total += count;
    return total;
  }

  /** Hits per round fired, or null before any were fired. */
  get accuracy(): number | null {
    return this.roundsFired > 0 ? this.hits / this.roundsFired : null;
  }

  durationSeconds(clock: number): number {
    return this.startedAt === null ? 0 : clock - this.startedAt;
  }
}

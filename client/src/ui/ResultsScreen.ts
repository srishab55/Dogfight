import type { MatchResult, TargetKind, Team } from '@dogfight/shared';
import type { SessionStats } from '../core/SessionStats';
import { button, h, label, setText, statTile, tag } from './components';

const KIND_NAMES: Readonly<Record<TargetKind, string>> = {
  balloon: 'Practice balloons',
  aaGun: 'AA guns',
  parkedAircraft: 'Parked aircraft',
  hangar: 'Hangars',
  fuelDepot: 'Fuel depots',
  radar: 'Radars',
  carrier: 'Carriers',
};

/** Everything the report shows: the match's outcome and the player's own figures. */
export interface MatchReport {
  readonly stats: SessionStats;
  readonly callsign: string;
  readonly clock: number;
  /** How it ended; null: the player left before the end. */
  readonly result: MatchResult | null;
  /** Bases each side held at the end (or when the player left). */
  readonly bases: Readonly<Record<Team, number>>;
  readonly matchSeconds: number;
  readonly playerTeam: Team;
}

/**
 * The after-action report: the match's outcome (the side holding more bases
 * when the time is up wins; a side left with none loses at once), the bases
 * each side held, and the player's real figures. Assists and bombing aren't
 * tracked yet and say so.
 */
export class ResultsScreen {
  private readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly outcomeValue: HTMLElement;
  private readonly outcomeNote: HTMLElement;
  private readonly scoreBlue: HTMLElement;
  private readonly scoreRed: HTMLElement;
  private readonly tiles: HTMLElement;
  private readonly breakdown: HTMLElement;
  private readonly continueButton: HTMLButtonElement;

  constructor(parent: HTMLElement, onContinue: () => void) {
    this.root = h('section', 'screen results');
    this.root.setAttribute('aria-label', 'After-action report');
    this.root.hidden = true;
    this.subtitle = h('p', 'results__subtitle');
    this.outcomeValue = h('span', 'results__outcome-value');
    this.outcomeNote = h('span', 'results__outcome-note');
    this.scoreBlue = h('span', 'results__score-blue');
    this.scoreRed = h('span', 'results__score-red');
    this.tiles = h('div', 'results__tiles');
    this.breakdown = h('dl', 'facts');
    this.continueButton = button('Continue', { variant: 'primary', size: 'lg', hint: 'Enter', onClick: onContinue });

    const outcome = h(
      'div',
      'results__outcome',
      h('div', 'results__outcome-main', label('Result'), this.outcomeValue, this.outcomeNote),
      h('div', 'results__score', label('Bases held'), h('span', 'results__score-line', h('span', 'results__team', 'Blue'), this.scoreBlue, h('span', 'results__dash', '–'), this.scoreRed, h('span', 'results__team', 'Red'))),
    );
    const pending = h('dl', 'facts', h('dt', '', 'Assists'), h('dd', '', '— ', tag('Phase 5')), h('dt', '', 'Bombing damage'), h('dd', '', '— ', tag('Bombs: Phase 4')));
    const panel = h(
      'div',
      'screen-panel results__panel',
      h('header', 'results__header', h('div', 'screen-title', label('Debrief'), h('h1', 'screen-title__name', 'After-action report')), this.subtitle),
      outcome,
      this.tiles,
      h('div', 'results__columns', h('div', '', h('div', 'section-head', label('Ground targets destroyed')), this.breakdown), h('div', '', h('div', 'section-head', label('Not tracked yet')), pending)),
      h('footer', 'results__footer', this.continueButton),
    );
    this.root.append(panel);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(report: MatchReport): void {
    const { stats, result } = report;
    this.root.hidden = false;
    setText(this.subtitle, `${report.callsign} · match ${formatDuration(report.matchSeconds)} · you against the Red squadron`);
    const won = result?.winner === report.playerTeam;
    const outcome = !result ? 'Abandoned' : result.winner === null ? 'Draw' : won ? 'Victory' : 'Defeat';
    setText(this.outcomeValue, outcome);
    this.outcomeValue.dataset['outcome'] = !result ? 'abandoned' : result.winner === null ? 'draw' : won ? 'victory' : 'defeat';
    const enemy = report.playerTeam === 'blue' ? 'Red' : 'Blue';
    setText(
      this.outcomeNote,
      !result
        ? 'You left before the end: this is how it stood.'
        : result.reason === 'eliminated'
          ? won
            ? `${enemy} held no base left to fly from.`
            : 'Your side held no base left to fly from.'
          : result.winner === null
            ? 'Time up, with the same number of bases each.'
            : won
              ? 'Time up: your side held more bases.'
              : `Time up: ${enemy} held more bases.`,
    );
    setText(this.scoreBlue, String(report.bases.blue));
    setText(this.scoreRed, String(report.bases.red));
    const accuracy = stats.accuracy;
    this.tiles.replaceChildren(
      statTile('Aircraft shot down', String(stats.kills)),
      statTile('Deaths', String(stats.shotDown + stats.crashes), `${stats.shotDown} shot down · ${stats.crashes} crashed`),
      statTile('Bases captured', String(stats.basesCaptured)),
      statTile('Damage dealt', stats.damageDealt.toFixed(0), 'to targets, in hull points'),
      statTile('Hit accuracy', accuracy === null ? '—' : `${(accuracy * 100).toFixed(1)}%`, `${stats.hits} hits / ${stats.roundsFired} rounds`),
      statTile('Sorties', String(stats.sorties), `${formatDuration(stats.flightSeconds)} flying`),
    );
    this.breakdown.replaceChildren();
    const kinds = [...stats.destroyed.entries()].filter(([, n]) => n > 0);
    if (kinds.length === 0) this.breakdown.append(h('dt', '', 'None'), h('dd', '', '—'));
    for (const [kind, count] of kinds) this.breakdown.append(h('dt', '', KIND_NAMES[kind]), h('dd', '', String(count)));
    this.continueButton.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
  }
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

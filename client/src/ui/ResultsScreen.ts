import type { TargetKind } from '@dogfight/shared';
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

/**
 * The after-action report (Exit to main menu): the session's real figures.
 * What the game doesn't track yet (a winner, team scores, assists, bombing)
 * is shown as "—" with when it arrives, never invented.
 */
export class ResultsScreen {
  private readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly tiles: HTMLElement;
  private readonly breakdown: HTMLElement;
  private readonly continueButton: HTMLButtonElement;

  constructor(parent: HTMLElement, onContinue: () => void) {
    this.root = h('section', 'screen results');
    this.root.setAttribute('aria-label', 'After-action report');
    this.root.hidden = true;
    this.subtitle = h('p', 'results__subtitle');
    this.tiles = h('div', 'results__tiles');
    this.breakdown = h('dl', 'facts');
    this.continueButton = button('Continue', { variant: 'primary', size: 'lg', hint: 'Enter', onClick: onContinue });

    const outcome = h('div', 'results__outcome', label('Result'), h('span', 'results__outcome-value', 'No result'), h('span', 'results__outcome-note', 'Victory conditions and team scores arrive in Phase 6.'));
    const pending = h(
      'dl',
      'facts',
      h('dt', '', 'Team score'),
      h('dd', '', '— ', tag('Phase 6')),
      h('dt', '', 'Assists'),
      h('dd', '', '— ', tag('Phase 5')),
      h('dt', '', 'Bombing damage'),
      h('dd', '', '— ', tag('Bombs: Phase 4')),
    );
    const panel = h(
      'div',
      'screen-panel results__panel',
      h('header', 'results__header', h('div', 'screen-title', label('Debrief'), h('h1', 'screen-title__name', 'After-action report')), this.subtitle),
      outcome,
      this.tiles,
      h('div', 'results__columns', h('div', '', h('div', 'section-head', label('Destroyed by type')), this.breakdown), h('div', '', h('div', 'section-head', label('Not tracked yet')), pending)),
      h('footer', 'results__footer', this.continueButton),
    );
    this.root.append(panel);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(stats: SessionStats, callsign: string, clock: number): void {
    this.root.hidden = false;
    setText(this.subtitle, `${callsign} · session ${formatDuration(stats.durationSeconds(clock))} · single player`);
    const accuracy = stats.accuracy;
    this.tiles.replaceChildren(
      statTile('Targets destroyed', String(stats.targetsDestroyed)),
      statTile('Damage dealt', stats.damageDealt.toFixed(0), 'hull points'),
      statTile('Hit accuracy', accuracy === null ? '—' : `${(accuracy * 100).toFixed(1)}%`, `${stats.hits} hits / ${stats.roundsFired} rounds`),
      statTile('Deaths', String(stats.shotDown + stats.crashes), `${stats.shotDown} shot down · ${stats.crashes} crashed`),
      statTile('Bases captured', String(stats.basesCaptured)),
      statTile('Sorties', String(stats.sorties), `${formatDuration(stats.flightSeconds)} flying`),
    );
    this.breakdown.replaceChildren();
    const kinds = [...stats.destroyed.entries()].filter(([, n]) => n > 0);
    if (kinds.length === 0) this.breakdown.append(h('dt', '', 'Nothing destroyed'), h('dd', '', '—'));
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

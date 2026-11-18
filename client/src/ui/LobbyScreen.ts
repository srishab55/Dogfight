import { arrowNavigation, button, dot, h, label, segmented, setText, tag, toggleSwitch } from './components';

export interface LobbyEvents {
  /** Fly single player instead (opens the hangar). */
  playOffline(): void;
  back(): void;
}

/** Who's in the (local) lobby. */
export interface LobbyInfo {
  readonly callsign: string;
  readonly aircraft: string;
}

/**
 * The multiplayer lobby's layout. Online play needs the game server (Phase
 * 5) and team choice the team rules (Phase 6), so this build shows the
 * truth: offline, one player (you, on Blue), and everything that needs the
 * server disabled with the reason. The layout is ready for the real data.
 */
export class LobbyScreen {
  private readonly root: HTMLElement;
  private readonly blueList: HTMLElement;
  private readonly playerCount: HTMLElement;
  private readonly offlineButton: HTMLButtonElement;

  constructor(parent: HTMLElement, events: LobbyEvents) {
    this.root = h('section', 'screen lobby');
    this.root.setAttribute('aria-label', 'Multiplayer lobby');
    this.root.hidden = true;

    const bar = h(
      'header',
      'screen-bar',
      button('Back', { variant: 'ghost', hint: 'Esc', onClick: () => events.back() }),
      h('div', 'screen-title', label('Multiplayer'), h('h1', 'screen-title__name', 'Lobby')),
      h('span', 'chip screen-bar__end', dot('caution'), 'Offline · no game server'),
    );

    const banner = h(
      'div',
      'banner',
      tag('Phase 5', 'caution'),
      h('p', '', 'Online play arrives with the game server in Phase 5: rooms, room codes, matchmaking and ready checks. Until then, fly single player.'),
    );
    banner.setAttribute('role', 'note');

    // ── Left: rooms and the server ──
    const roomCode = h('input', 'input');
    roomCode.type = 'text';
    roomCode.placeholder = 'Room code';
    roomCode.disabled = true;
    roomCode.setAttribute('aria-label', 'Room code');
    const needsServer = 'Needs the game server (Phase 5)';
    const rooms = h(
      'div',
      'screen-panel lobby__panel',
      h('div', 'section-head', label('Room')),
      button('Create room', { block: true, disabled: true, tooltip: needsServer }),
      h('div', 'lobby__join', roomCode, button('Join', { disabled: true, tooltip: needsServer })),
      h('div', 'section-head', label('Server')),
      h('dl', 'facts', h('dt', '', 'Status'), h('dd', '', 'Offline'), h('dt', '', 'Region'), h('dd', '', '—'), h('dt', '', 'Ping'), h('dd', '', '—')),
    );

    // ── Right: the teams ──
    const team = segmented<'blue' | 'red'>(
      'Team',
      [
        { value: 'blue', label: 'Blue' },
        { value: 'red', label: 'Red', tooltip: 'Choosing a team arrives in Phase 6' },
      ],
      'blue',
      () => team.set('blue'),
    );
    team.element.querySelectorAll('button')[1]?.setAttribute('aria-disabled', 'true');
    this.blueList = h('ul', 'roster');
    const redList = h('ul', 'roster', h('li', 'roster__empty', 'No players: the enemy is the AI defences until Phase 5'));
    this.playerCount = h('span', 'section-head__hint');
    const ready = toggleSwitch('Ready', false, () => ready.set(false));
    (ready.element as HTMLButtonElement).disabled = true;
    const teams = h(
      'div',
      'screen-panel lobby__panel lobby__teams',
      h('div', 'section-head', label('Teams'), this.playerCount),
      h('div', 'lobby__team-choice', h('span', 'setting__name', 'Your team'), team.element),
      h(
        'div',
        'lobby__columns',
        h('div', 'lobby__team', h('div', 'lobby__team-head', dot('friendly'), h('span', '', 'Blue')), this.blueList),
        h('div', 'lobby__team', h('div', 'lobby__team-head', dot('danger'), h('span', '', 'Red')), redList),
      ),
      h('div', 'lobby__ready', h('span', 'setting__name', 'Ready'), h('span', 'setting__description', 'Not available offline'), ready.element),
    );

    this.offlineButton = button('Fly single player', { variant: 'primary', size: 'lg', hint: 'Enter', onClick: () => events.playOffline() });
    const footer = h('footer', 'screen-footer', h('p', 'screen-footer__note', 'Single player uses the same aircraft, bases and rules.'), this.offlineButton);

    const content = h('div', 'lobby__content', banner, h('div', 'lobby__grid', rooms, teams));
    arrowNavigation(content);
    this.root.append(bar, content, footer);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(info: LobbyInfo): void {
    this.root.hidden = false;
    this.blueList.replaceChildren(h('li', 'roster__player', h('span', 'roster__name', info.callsign), tag('You', 'accent'), h('span', 'roster__detail', info.aircraft)));
    setText(this.playerCount, '1 player');
    this.offlineButton.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
  }
}

import { arrowNavigation, h, label, navItem, setText } from './components';
import type { SettingsTab } from './SettingsScreen';

export interface PauseMenuEvents {
  resume(): void;
  changeAircraft(): void;
  settings(tab: SettingsTab): void;
  exit(): void;
}

/** The flight the menu paused. */
export interface PauseInfo {
  readonly aircraft: string;
  readonly base: string;
  /** e.g. "In flight", "Parked", "Aircraft lost". */
  readonly status: string;
  /** Resume returns to the respawn screen rather than a flight. */
  readonly afterCrash: boolean;
}

/**
 * The pause menu (Esc in flight): a small dialog over the frozen game.
 * Single player, so the game really is paused while it's open.
 */
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly resumeItem: HTMLButtonElement;

  constructor(parent: HTMLElement, events: PauseMenuEvents) {
    this.root = h('div', 'modal pause-menu');
    this.root.hidden = true;
    // A click on the dimmed game around the dialog resumes, like Esc.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) events.resume();
    });

    this.subtitle = h('p', 'pause-menu__subtitle');
    this.resumeItem = navItem('Resume', () => events.resume(), { meta: 'Esc' });
    const nav = h(
      'nav',
      'nav',
      this.resumeItem,
      navItem('Change base', () => events.changeAircraft(), { meta: 'Aircraft fixed for the match' }),
      navItem('Settings', () => events.settings('graphics')),
      navItem('Controls', () => events.settings('controls')),
      navItem('Audio', () => events.settings('audio')),
      h('hr', 'nav__divider'),
      navItem('Return to lobby', () => undefined, { meta: 'Phase 5', disabled: true, tooltip: 'Online lobbies arrive with the game server in Phase 5.' }),
      navItem('Exit to main menu', () => events.exit(), { meta: 'Ends the match: all resets' }),
    );
    nav.setAttribute('aria-label', 'Pause menu');
    arrowNavigation(nav, 'button');
    const title = h('h2', 'ui-heading pause-menu__title', 'Paused');
    title.id = 'pause-menu-title';
    const dialog = h('div', 'modal__dialog pause-menu__dialog', h('header', 'pause-menu__header', label('Single player · game paused'), title, this.subtitle), nav);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', title.id);
    this.root.append(dialog);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(info: PauseInfo): void {
    this.root.hidden = false;
    setText(this.subtitle, `${info.aircraft} · ${info.base} · ${info.status}`);
    setText(this.resumeItem.firstElementChild as HTMLElement, info.afterCrash ? 'Back to respawn' : 'Resume');
    this.resumeItem.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
  }
}

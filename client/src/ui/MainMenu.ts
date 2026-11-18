import { UI_CONFIG } from '../config/ui';
import { arrowNavigation, button, dot, h, label, navItem, setText } from './components';

export interface MainMenuEvents {
  play(): void;
  multiplayer(): void;
  settings(): void;
  controls(): void;
  /** The player renamed themselves. */
  callsign(name: string): void;
}

/** What the menu shows about the player and the aircraft in the hangar. */
export interface MainMenuInfo {
  readonly callsign: string;
  readonly aircraft: string;
  readonly base: string;
}

/**
 * The main menu: over the hangar's slowly circling aircraft, the game's name,
 * PLAY, the lobby, settings and controls. Top right, the callsign (click to
 * edit) and the connection: this build plays offline.
 */
export class MainMenu {
  private readonly root: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly callsignButton: HTMLButtonElement;
  private readonly callsignName: HTMLElement;
  private readonly callsignInput: HTMLInputElement;
  private readonly hangarLine: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly events: MainMenuEvents,
  ) {
    this.root = h('section', 'screen main-menu');
    this.root.setAttribute('aria-label', 'Main menu');
    this.root.hidden = true;

    const logo = h('h1', 'logo', h('span', 'logo__dogfight', 'Dogfight'), h('span', 'logo__squadron', 'Squadron'));
    this.playButton = button('Play', { variant: 'primary', size: 'lg', hint: 'Enter', onClick: () => this.events.play() });
    this.playButton.classList.add('main-menu__play');
    const nav = h(
      'nav',
      'nav main-menu__nav',
      navItem('Multiplayer', () => this.events.multiplayer(), { meta: 'Lobby' }),
      navItem('Settings', () => this.events.settings()),
      navItem('Controls', () => this.events.controls()),
    );
    nav.setAttribute('aria-label', 'Main menu');
    const column = h('div', 'main-menu__column', logo, h('p', 'main-menu__tagline', 'Take the islands’ airfields; hold more than Red when the clock runs out.'), this.playButton, nav);
    arrowNavigation(column);

    // ── Top right: who you are, and the connection ──
    this.callsignName = h('span', 'callsign__name');
    this.callsignButton = h('button', 'callsign', label('Callsign'), this.callsignName, h('span', 'callsign__edit', 'Edit'));
    this.callsignButton.addEventListener('click', () => this.editCallsign());
    this.callsignInput = h('input', 'callsign__input');
    this.callsignInput.type = 'text';
    this.callsignInput.maxLength = UI_CONFIG.callsign.maxLength;
    this.callsignInput.setAttribute('aria-label', 'Callsign');
    this.callsignInput.spellcheck = false;
    this.callsignInput.hidden = true;
    this.callsignInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.commitCallsign();
      else if (event.key === 'Escape') this.cancelCallsign();
    });
    this.callsignInput.addEventListener('blur', () => this.commitCallsign());
    const status = h('span', 'chip', dot('caution'), 'Offline · single player');
    status.dataset['tooltip'] = 'Online play needs the game server, which arrives in Phase 5.';
    status.tabIndex = 0;
    const corner = h('div', 'main-menu__corner', this.callsignButton, this.callsignInput, status);

    this.hangarLine = h('p', 'main-menu__hangar');
    const footer = h('div', 'main-menu__footer', this.hangarLine);

    this.root.append(h('div', 'main-menu__scrim'), column, corner, footer);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Editing the callsign: the menu's keys (Enter, Esc) belong to the text box. */
  get editing(): boolean {
    return !this.callsignInput.hidden;
  }

  open(info: MainMenuInfo): void {
    this.root.hidden = false;
    setText(this.callsignName, info.callsign);
    setText(this.hangarLine, `In the hangar: ${info.aircraft} · ${info.base}`);
    this.playButton.focus({ preventScroll: true });
  }

  close(): void {
    if (this.editing) this.cancelCallsign();
    this.root.hidden = true;
  }

  private editCallsign(): void {
    this.callsignInput.value = this.callsignName.textContent ?? '';
    this.callsignButton.hidden = true;
    this.callsignInput.hidden = false;
    this.callsignInput.focus();
    this.callsignInput.select();
  }

  private commitCallsign(): void {
    if (!this.editing) return;
    const name = cleanCallsign(this.callsignInput.value);
    if (name) {
      setText(this.callsignName, name);
      this.events.callsign(name);
    }
    this.closeEditor();
  }

  private cancelCallsign(): void {
    this.closeEditor();
  }

  private closeEditor(): void {
    this.callsignInput.hidden = true;
    this.callsignButton.hidden = false;
    this.callsignButton.focus({ preventScroll: true });
  }
}

/** Letters, digits, spaces, - and _; trimmed and capped. Empty means "keep the old one". */
export function cleanCallsign(text: string): string {
  return text
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, UI_CONFIG.callsign.maxLength);
}

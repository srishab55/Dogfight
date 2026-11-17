import type { BaseDefinition } from '@dogfight/shared';

/** One base you could take off from, as the picker lists it. */
export interface BaseChoice {
  readonly base: BaseDefinition;
  /** e.g. "Red airfield". */
  readonly name: string;
  /** e.g. "captured · 8.9 km". */
  readonly detail: string;
  /** CSS colour of its owner. */
  readonly color: string;
}

/**
 * "Take off from": a list of your bases (your own and any you've captured).
 * ← / → choose, Enter takes off there, J closes. The game decides when it
 * may open (stopped on the ground, or crashed) and what happens on a pick.
 */
export class BasePicker {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private choices: readonly BaseChoice[] = [];
  private index = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'base-picker';
    this.root.hidden = true;
    const title = document.createElement('div');
    title.className = 'base-picker-title';
    title.textContent = 'TAKE OFF FROM';
    this.list = document.createElement('div');
    this.list.className = 'base-picker-list';
    const keys = document.createElement('div');
    keys.className = 'base-picker-keys';
    keys.textContent = '← → choose · Enter: take off there · J: close';
    this.root.append(title, this.list, keys);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** The highlighted base, or null if the picker is closed. */
  get selected(): BaseDefinition | null {
    return this.isOpen ? (this.choices[this.index]?.base ?? null) : null;
  }

  open(choices: readonly BaseChoice[], selectedId: string | null): void {
    this.choices = choices;
    this.index = Math.max(0, choices.findIndex((c) => c.base.id === selectedId));
    this.list.replaceChildren(
      ...choices.map((choice) => {
        const row = document.createElement('div');
        row.className = 'base-picker-row';
        row.style.setProperty('--base-color', choice.color);
        const name = document.createElement('span');
        name.className = 'base-picker-name';
        name.textContent = choice.name;
        const detail = document.createElement('span');
        detail.className = 'base-picker-detail';
        detail.textContent = choice.detail;
        row.append(name, detail);
        return row;
      }),
    );
    this.root.hidden = false;
    this.highlight();
  }

  move(direction: 1 | -1): void {
    if (!this.isOpen || this.choices.length === 0) return;
    this.index = (this.index + direction + this.choices.length) % this.choices.length;
    this.highlight();
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }

  private highlight(): void {
    [...this.list.children].forEach((row, i) => row.toggleAttribute('data-selected', i === this.index));
  }
}

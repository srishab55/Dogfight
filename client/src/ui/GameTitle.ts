/** The game's name along the top of the screen. */
export function createGameTitle(parent: HTMLElement): HTMLElement {
  const title = document.createElement('div');
  title.className = 'game-title';
  title.setAttribute('role', 'banner');
  const squadron = document.createElement('span');
  squadron.className = 'game-title-squadron';
  squadron.textContent = 'Squadron';
  title.append(document.createTextNode('Dogfight '), squadron);
  parent.append(title);
  return title;
}

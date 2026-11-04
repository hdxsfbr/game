import { el } from './dom';
import { keyed } from './touch';

/** One line under each area's card, shown the first time the player arrives. */
export const CARD_LINES: Record<string, string> = {
  hub: 'Hearthstone. The hall where the songs were kept. The doors still remember them, if someone will listen.',
  valley: 'The Valley of Intervals. Every bridge and gate here asks for a distance: a note, and another a certain way above it.',
  town: 'Tonic Town. Every tune in this town comes home to one note. The bell will tell you which.',
  jazz: 'The Jazz Quarter. Four moods, one band, and a last door that wants the whole set.',
  stage: 'The Silent Stage. Three fragments, one song. The kingdom plays it once; you give it back.',
};

/**
 * A full-screen picture with a line of story, shown once per area. Space, Enter or a click
 * dismisses it; the world blocks movement while it is up.
 */
export class StoryCard {
  readonly root: HTMLDivElement;
  private img: HTMLImageElement;
  private titleEl: HTMLElement;
  private lineEl: HTMLElement;
  visible = false;
  onDone: (() => void) | null = null;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'card hidden clickable');
    this.root.id = 'story-card';
    this.img = el('img', 'card-img', undefined, { alt: '' });
    const band = el('div', 'card-band');
    this.titleEl = el('h2', '', '');
    this.lineEl = el('p', '', '');
    band.append(this.titleEl, this.lineEl, el('span', 'card-hint', keyed('Space', 'continue')));
    this.root.append(this.img, band);
    this.root.addEventListener('click', () => this.hide());
    ui.appendChild(this.root);
  }

  /** Show the card for an area. Resolves false, showing nothing, when its picture is missing. */
  show(areaId: string, areaName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const src = `cards/${areaId}.jpg`;
      const img = this.img;
      img.onload = () => {
        this.titleEl.textContent = areaName;
        this.lineEl.textContent = CARD_LINES[areaId] ?? '';
        this.visible = true;
        this.root.classList.remove('hidden');
        requestAnimationFrame(() => this.root.classList.add('in'));
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.remove('in');
    setTimeout(() => {
      this.root.classList.add('hidden');
      this.onDone?.();
    }, 350);
  }
}

import { VOICE_MAX, progress } from '../state';
import { clear, el } from './dom';
import { TOUCH } from './touch';

/** Area name, the five notes of voice, the fragment count, a hint line and a toast. */
export class Hud {
  private root: HTMLDivElement;
  private areaName: HTMLElement;
  private voice: HTMLElement;
  private fragments: HTMLElement;
  private hint: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  /** Touch play: the one thing Space would do here, as a button; and the map. */
  private actionBtn: HTMLButtonElement;
  onAction: (() => void) | null = null;
  onMap: (() => void) | null = null;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'hud hidden');
    this.root.id = 'hud';
    const left = el('div', 'hud-left');
    this.areaName = el('div', 'hud-area', '');
    const voiceRow = el('div', 'hud-voice-row');
    voiceRow.append(el('span', 'hud-label', 'Voice'));
    this.voice = el('span', 'hud-voice');
    this.voice.id = 'hud-voice';
    voiceRow.append(this.voice);
    left.append(this.areaName, voiceRow);
    this.fragments = el('div', 'hud-fragments', '');
    this.hint = el('div', 'hud-hint', '');
    this.hint.id = 'hud-hint';
    this.toastEl = el('div', 'toast hidden', '');
    this.toastEl.id = 'toast';
    this.actionBtn = el('button', 'hud-action hidden', '', { type: 'button', id: 'hud-action' });
    this.actionBtn.addEventListener('click', () => this.onAction?.());
    const map = el('button', 'hud-map', 'Map', { type: 'button', id: 'hud-map' });
    map.addEventListener('click', () => this.onMap?.());
    this.root.append(left, this.fragments, this.hint, this.actionBtn, map, this.toastEl);
    ui.appendChild(this.root);
  }

  show(area: string): void {
    this.areaName.textContent = area;
    this.root.classList.remove('hidden');
    this.refresh();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** The key hint, and on a touch screen the action button it names instead (none when `action` is empty). */
  setHint(text: string, action = ''): void {
    if (TOUCH) text = action ? '' : text.replace(/Arrow keys or WASD to walk/, 'Push the stick to walk').replace(/\s*M: map$/, '');
    if (this.hint.textContent !== text) this.hint.textContent = text;
    if (this.actionBtn.textContent !== action) this.actionBtn.textContent = action;
    this.actionBtn.classList.toggle('hidden', !action);
  }

  refresh(flashIndex = -1): void {
    this.fragments.textContent = `Melody fragments  ${progress.fragments} / 3`;
    clear(this.voice);
    for (let i = 0; i < VOICE_MAX; i++) {
      const n = el('i', 'note' + (i < progress.voice ? ' on' : '') + (i === flashIndex ? ' lost' : ''));
      this.voice.append(n);
    }
  }

  toast(text: string, ms = 3200): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }
}

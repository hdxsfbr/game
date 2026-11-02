import { VOICE_MAX, progress } from '../state';
import { clear, el } from './dom';

/** Area name, the five notes of voice, the fragment count, a hint line and a toast. */
export class Hud {
  private root: HTMLDivElement;
  private areaName: HTMLElement;
  private voice: HTMLElement;
  private fragments: HTMLElement;
  private hint: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;

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
    this.root.append(left, this.fragments, this.hint, this.toastEl);
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

  setHint(text: string): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
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

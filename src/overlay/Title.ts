import { AudioEngine } from '../audio/engine';
import { uiClick } from '../audio/sfx';
import { Tracks } from '../audio/tracks';
import { playSequence } from '../audio/synth';
import { MicPitchDetector } from '../ear/pitchDetector';
import { clearProgress, defaultProgress, progress, type InputMode } from '../state';
import type { WorldStart } from '../scenes3d/World';
import { clear, el } from './dom';

/** The microphone, once started on the title screen, for the world to read. */
export let mic: MicPitchDetector | null = null;

/** The title: the painted backdrop, the question of how to answer the doors, and the way back in. */
export class Title {
  private root: HTMLDivElement;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'title hidden');
    this.root.id = 'title';
    ui.appendChild(this.root);
  }

  show(startAt: WorldStart, onBegin: (mode: InputMode, at: WorldStart) => void): void {
    clear(this.root);
    this.root.classList.remove('hidden');
    if (!Tracks.get().playing.includes('title')) Tracks.get().play('title', { loop: true, fade: 1200 });
    const back = el('div', 'title-back');
    back.style.backgroundImage = 'url(cards/title.jpg)';
    this.root.append(back, el('div', 'title-shade'));
    const box = el('div', 'title-box');
    box.append(el('h1', '', 'The Listening Kingdom'), el('p', 'title-tag', 'A kingdom gone silent. Win your voice back one note at a time.'), el('p', 'title-q', 'How will you answer the doors?'));
    const row = el('div', 'title-row');
    const note = el('p', 'title-note', '');
    const btn = (id: string, label: string, desc: string, mode: InputMode) => {
      const b = el('button', 'title-btn', '', { id, type: 'button' });
      b.append(el('span', 'title-btn-label', label), el('span', 'title-btn-desc', desc));
      b.addEventListener('click', () => {
        uiClick();
        void this.begin(mode, note, () => onBegin(mode, startAt));
      });
      return b;
    };
    row.append(btn('btn-sing', 'Sing', 'Use your voice. Needs a microphone; headphones recommended.', 'sing'), btn('btn-play', 'Play', 'Your keyboard is a piano. Works anywhere.', 'play'));
    box.append(row, note);
    if (progress.solved.length > 0) {
      const doors = progress.solved.filter((id) => !id.startsWith('fragment')).length;
      box.append(el('p', 'title-continue', `Continuing your journey: ${doors} door${doors === 1 ? '' : 's'} opened.`));
      const reset = el('button', 'title-reset', 'Start over', { id: 'btn-reset', type: 'button' });
      reset.addEventListener('click', () => {
        clearProgress();
        Object.assign(progress, defaultProgress());
        this.show(startAt, onBegin);
      });
      box.append(reset);
    }
    this.root.append(box, el('p', 'title-foot', 'Walk with the arrow keys or WASD. Press Space at a door to listen. Every door can be answered by voice or by keys.'));
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private async begin(mode: InputMode, note: HTMLElement, go: () => void): Promise<void> {
    const engine = AudioEngine.get();
    await engine.unlock();
    if (mode === 'sing') {
      note.textContent = 'Asking for the microphone…';
      note.classList.remove('err');
      const m = new MicPitchDetector();
      const ok = await m.start();
      if (!ok) {
        note.classList.add('err');
        note.textContent = m.status === 'denied' ? 'The microphone was refused. You can still play with the keys.' : `Could not start the microphone. ${m.lastError ?? ''} You can still play with the keys.`;
        return;
      }
      mic = m;
    }
    playSequence([60, 64, 67, 72], { timbre: 'bell', duration: 0.25, gap: 0.12, gain: 0.4 });
    this.hide();
    go();
  }
}

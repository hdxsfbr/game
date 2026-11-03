import { uiClick } from '../audio/sfx';
import { playSequence } from '../audio/synth';
import { progress } from '../state';
import { clear, el } from './dom';

interface Row {
  area: string;
  name: string;
  lesson: string;
}

const ROWS: Row[] = [
  { area: 'valley', name: 'Valley of Intervals', lesson: 'An interval is a distance. You can hear it before you can name it.' },
  { area: 'town', name: 'Tonic Town', lesson: 'Every note has a job in its key. Home is degree one.' },
  { area: 'jazz', name: 'Jazz Quarter', lesson: "A chord's quality lives in its third and its seventh." },
  { area: 'stage', name: 'The Silent Stage', lesson: 'A song is all three at once.' },
];

function medal(misses: number): { name: string; color: string } {
  if (misses <= 2) return { name: 'Gold', color: '#f2c46d' };
  if (misses <= 6) return { name: 'Silver', color: '#c9cdd4' };
  return { name: 'Bronze', color: '#c98a5a' };
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The ending: what the journey took, what each area taught, and the way back in. */
export class Results {
  readonly root: HTMLDivElement;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'results hidden');
    this.root.id = 'results';
    ui.appendChild(this.root);
  }

  show(onWalk: () => void, onRestart: () => void): void {
    clear(this.root);
    const back = el('div', 'title-back');
    back.style.backgroundImage = 'url(cards/results.jpg)';
    this.root.append(back, el('div', 'title-shade dark'));
    const box = el('div', 'results-box');
    box.append(el('h1', '', 'The kingdom is listening again.'));
    const took = progress.finishedAt && progress.startedAt ? fmtTime(progress.finishedAt - progress.startedAt) : null;
    const hubMisses = progress.areaMisses.hub ?? 0;
    const quiets = progress.quiets ?? 0;
    const quietLine = quiets ? ` You went quiet ${quiets === 1 ? 'once' : `${quiets} times`} and practised your way back.` : ' Your voice never ran out.';
    box.append(el('p', 'results-sub', (took ? `Your voice came back in ${took}${hubMisses ? `, with ${hubMisses} stumble${hubMisses === 1 ? '' : 's'} at the hearth` : ''}.` : 'Your voice came back.') + quietLine));
    for (const r of ROWS) {
      const misses = progress.areaMisses[r.area] ?? 0;
      const m = medal(misses);
      const row = el('div', 'results-row');
      const dot = el('i', 'results-medal');
      dot.style.background = m.color;
      const text = el('div', 'results-text');
      text.append(el('div', 'results-name', r.name), el('div', 'results-lesson', r.lesson));
      const score = el('div', 'results-score', `${m.name}  ·  ${misses} miss${misses === 1 ? '' : 'es'}`);
      score.style.color = m.color;
      row.append(dot, text, score);
      box.append(row);
    }
    const btns = el('div', 'results-btns');
    const walk = el('button', 'btn-wide', 'Walk the kingdom', { type: 'button', id: 'btn-walk' });
    walk.addEventListener('click', () => (uiClick(), onWalk()));
    const restart = el('button', 'btn-wide', 'Start over', { type: 'button', id: 'btn-restart' });
    restart.addEventListener('click', () => (uiClick(), onRestart()));
    btns.append(walk, restart);
    box.append(btns);
    this.root.append(box);
    this.root.classList.remove('hidden');
    setTimeout(() => playSequence([60, 64, 67, 72, 76], { timbre: 'bell', duration: 0.35, gap: 0.16, gain: 0.4 }), 300);
    if (import.meta.env.DEV) (window as unknown as { __lkResults: boolean }).__lkResults = true;
  }

  hide(): void {
    this.root.classList.add('hidden');
    if (import.meta.env.DEV) (window as unknown as { __lkResults: boolean }).__lkResults = false;
  }
}

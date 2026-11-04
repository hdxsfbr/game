import { playDemo } from '../audio/demo';
import { AudioEngine } from '../audio/engine';
import { KEY_LABELS, PIANO_HIGH, PIANO_LOW } from '../ear/pipes';
import { noteName } from '../ear/pitchMath';
import type { GuideStep } from '../world/guides';
import { colorToCss, type Palette } from '../world/palette';
import { clear, el } from './dom';
import { keyed } from './touch';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * The guided walkthrough at a bench: a step at a time, the narration spoken and shown as a caption,
 * then the thing it talks about sounded and lit on a piano. Steps follow on by themselves; the arrows
 * move by hand, Space says a step again, Enter begins the drill, P opens the text pages.
 */
export class GuideView {
  readonly root: HTMLDivElement;
  private titleEl: HTMLElement;
  private dots: HTMLElement;
  private caption: HTMLElement;
  private pianoEl: HTMLElement;
  private keyEls = new Map<number, HTMLElement>();
  private drillBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private steps: GuideStep[] = [];
  private bench = '';
  private audio: HTMLAudioElement | null = null;
  private timers: number[] = [];
  /** Counts up on every change of step, so a late sound or light from the last one is dropped. */
  private run = 0;
  step = 0;
  onDrill: (() => void) | null = null;
  onPages: (() => void) | null = null;
  onLeave: (() => void) | null = null;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'lesson guide hidden');
    this.root.id = 'guide';
    const top = el('div', 'lesson-top');
    this.titleEl = el('h2', '', '');
    this.dots = el('div', 'lesson-dots');
    top.append(this.titleEl, el('div', 'lesson-pageno', 'the guide'), this.dots);
    const leave = el('button', 'btn-small lesson-leave', keyed('Esc', 'leave'), { type: 'button' });
    leave.addEventListener('click', () => this.onLeave?.());
    const main = el('div', 'lesson-main guide-main');
    this.caption = el('p', 'guide-caption', '');
    this.pianoEl = el('div', 'piano guide-piano');
    this.buildPiano();
    main.append(this.caption, this.pianoEl);
    const foot = el('div', 'lesson-foot');
    this.backBtn = el('button', 'btn-small', '←  back', { type: 'button' });
    this.backBtn.addEventListener('click', () => this.go(-1));
    const again = el('button', 'btn-small', keyed('Space', 'again'), { type: 'button' });
    again.addEventListener('click', () => this.play(this.step));
    const pages = el('button', 'btn-small', keyed('P', 'the pages'), { type: 'button', id: 'guide-pages' });
    pages.addEventListener('click', () => this.onPages?.());
    this.drillBtn = el('button', 'btn-small', keyed('Enter', 'begin the drill'), { type: 'button', id: 'guide-drill' });
    this.drillBtn.addEventListener('click', () => this.onDrill?.());
    this.nextBtn = el('button', 'btn-small', 'next  →', { type: 'button' });
    this.nextBtn.addEventListener('click', () => this.go(1));
    foot.append(this.backBtn, again, pages, this.drillBtn, this.nextBtn);
    this.root.append(top, leave, main, foot);
    ui.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setPalette(p: Palette): void {
    this.root.style.setProperty('--accent', colorToCss(p.accent));
  }

  show(bench: string, title: string, steps: GuideStep[]): void {
    this.bench = bench;
    this.steps = steps;
    this.titleEl.textContent = title;
    this.root.classList.remove('hidden');
    this.play(0);
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.stop();
  }

  /** Move by `d` steps. Past the last step, the drill begins. */
  go(d: number): void {
    const n = this.step + d;
    if (n < 0) return;
    if (n >= this.steps.length) {
      this.onDrill?.();
      return;
    }
    this.play(n);
  }

  /** Say a step, then sound and light its demo, then on to the next by itself. */
  play(i: number): void {
    this.stop();
    const run = ++this.run;
    this.step = i;
    const s = this.steps[i];
    this.caption.textContent = s.say;
    this.render();
    const next = () => {
      if (run !== this.run) return;
      if (i + 1 < this.steps.length) this.timers.push(window.setTimeout(() => run === this.run && this.play(i + 1), 900));
    };
    const demo = () => {
      if (run !== this.run) return;
      if (!s.demo) return next();
      const engine = AudioEngine.get();
      const end = playDemo(s.demo, 60, (midis, at, until) => {
        const on = Math.max(0, (at - engine.now) * 1000);
        const off = Math.max(0, (until - engine.now) * 1000);
        this.timers.push(window.setTimeout(() => run === this.run && this.light(midis, true), on));
        this.timers.push(window.setTimeout(() => run === this.run && this.light(midis, false), off));
      });
      this.timers.push(window.setTimeout(next, Math.max(0, (end - engine.now) * 1000) + 400));
    };
    const a = new Audio(`narration/${this.bench}-${i}.mp3`);
    this.audio = a;
    a.onended = () => this.timers.push(window.setTimeout(demo, 350));
    // A clip that will not load or play (no file, no gesture yet) should not stall the guide.
    a.onerror = () => demo();
    void AudioEngine.get().unlock();
    a.play().catch(() => demo());
  }

  private stop(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    for (const k of this.keyEls.values()) k.classList.remove('held');
  }

  private light(midis: number[], on: boolean): void {
    for (const m of midis) this.keyEls.get(m)?.classList.toggle('held', on);
  }

  private render(): void {
    this.backBtn.style.visibility = this.step > 0 ? 'visible' : 'hidden';
    const last = this.step === this.steps.length - 1;
    this.nextBtn.style.visibility = last ? 'hidden' : 'visible';
    this.drillBtn.classList.toggle('primary', last);
    clear(this.dots);
    for (let i = 0; i < this.steps.length; i++) this.dots.append(el('i', i === this.step ? 'on' : ''));
  }

  private buildPiano(): void {
    let wx = 0;
    const ww = 40;
    const bw = 24;
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      const black = BLACK.has(m % 12);
      const k = el('div', 'key ' + (black ? 'black' : 'white'));
      k.style.left = `${black ? wx - bw / 2 : wx}px`;
      k.append(el('span', 'key-name', noteName(m).replace(/-?\d+$/, '')), el('span', 'key-label', KEY_LABELS[m - PIANO_LOW] ?? ''));
      this.keyEls.set(m, k);
      this.pianoEl.append(k);
      if (!black) wx += ww;
    }
    this.pianoEl.style.width = `${wx}px`;
  }
}

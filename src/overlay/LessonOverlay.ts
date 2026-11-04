import type { LessonDef, LessonPage } from '../world/lessons';
import { colorToCss, type Palette } from '../world/palette';
import { clear, el } from './dom';

/**
 * The lesson shown at a practice bench: one page at a time, each with a short text and, often,
 * something to hear. Keys are handled by the world; the buttons here call back.
 */
export class LessonOverlay {
  readonly root: HTMLDivElement;
  private titleEl: HTMLElement;
  private pageNo: HTMLElement;
  private dots: HTMLElement;
  private heading: HTMLElement;
  private body: HTMLElement;
  private hearBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private drillBtn: HTMLButtonElement;
  private lesson: LessonDef | null = null;
  page = 0;
  onHear: ((page: LessonPage) => void) | null = null;
  onDrill: (() => void) | null = null;
  onLeave: (() => void) | null = null;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'lesson hidden');
    this.root.id = 'lesson';
    const top = el('div', 'lesson-top');
    this.titleEl = el('h2', '', '');
    this.pageNo = el('div', 'lesson-pageno', '');
    this.dots = el('div', 'lesson-dots');
    top.append(this.titleEl, this.pageNo, this.dots);
    const leave = el('button', 'btn-small lesson-leave', 'Esc: leave', { type: 'button' });
    leave.addEventListener('click', () => this.onLeave?.());
    const main = el('div', 'lesson-main');
    this.heading = el('h3', '', '');
    this.body = el('p', '', '');
    this.hearBtn = el('button', 'btn-small', '', { type: 'button', id: 'lesson-hear' });
    this.hearBtn.addEventListener('click', () => this.hear());
    main.append(this.heading, this.body, this.hearBtn);
    const foot = el('div', 'lesson-foot');
    this.backBtn = el('button', 'btn-small', '←  back', { type: 'button' });
    this.backBtn.addEventListener('click', () => this.go(-1));
    this.drillBtn = el('button', 'btn-small', '', { type: 'button', id: 'lesson-drill' });
    this.drillBtn.addEventListener('click', () => this.onDrill?.());
    this.nextBtn = el('button', 'btn-small', 'next  →', { type: 'button' });
    this.nextBtn.addEventListener('click', () => this.go(1));
    foot.append(this.backBtn, this.drillBtn, this.nextBtn);
    this.root.append(top, leave, main, foot);
    ui.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setPalette(p: Palette): void {
    this.root.style.setProperty('--accent', colorToCss(p.accent));
  }

  show(lesson: LessonDef): void {
    this.lesson = lesson;
    this.page = 0;
    this.titleEl.textContent = lesson.title;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.lesson = null;
  }

  get currentPage(): LessonPage | null {
    return this.lesson ? this.lesson.pages[this.page] : null;
  }

  /** Move by `d` pages. Past the last page, the drill begins. */
  go(d: number): void {
    if (!this.lesson) return;
    const n = this.page + d;
    if (n < 0) return;
    if (n >= this.lesson.pages.length) {
      this.onDrill?.();
      return;
    }
    this.page = n;
    this.render();
  }

  hear(): void {
    const p = this.currentPage;
    if (p?.demo) this.onHear?.(p);
  }

  private render(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const p = lesson.pages[this.page];
    this.pageNo.textContent = `${this.page + 1} of ${lesson.pages.length}`;
    this.heading.textContent = p.heading;
    this.body.textContent = p.text;
    this.hearBtn.classList.toggle('hidden', !p.demo);
    if (p.demo) this.hearBtn.textContent = `Space: hear ${p.demoLabel ?? 'it'}`;
    this.backBtn.style.visibility = this.page > 0 ? 'visible' : 'hidden';
    const last = this.page === lesson.pages.length - 1;
    this.nextBtn.style.visibility = last ? 'hidden' : 'visible';
    this.drillBtn.textContent = last ? 'Enter: begin the drill' : 'Enter: skip to the drill';
    clear(this.dots);
    for (let i = 0; i < lesson.pages.length; i++) this.dots.append(el('i', i === this.page ? 'on' : ''));
  }
}

import { noteName } from '../ear/pitchMath';
import { PIANO_HIGH, PIANO_LOW, keyLabelForMidi } from '../ear/pipes';
import { CHORD_QUALITIES, CHORD_SHORT, MAJOR_SCALE, chordOf, type ChordQuality } from '../world/puzzles';
import type { PuzzleRunner } from '../world/puzzleRunner';
import type { Palette } from '../world/palette';
import { colorToCss } from '../world/palette';
import { clear, el } from './dom';

const BLACK = new Set([1, 3, 6, 8, 10]);
const SVG = 'http://www.w3.org/2000/svg';
const LADDER_W = 140;
const LADDER_H = 168;
const LX = 60;
const TOP = 10;
const BOTTOM = LADDER_H - 10;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * The listening panel shown during a puzzle, along the bottom of the screen: the title, what to
 * do, the live voice marker on the ladder, the hint ladder, and the fixed piano (or the four
 * chord signs for a naming step).
 */
export class PuzzlePanel {
  readonly root: HTMLDivElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private statusEl: HTMLElement;
  private keysEl: HTMLElement;
  private dotsEl: HTMLElement;
  private ladder: SVGSVGElement;
  private ladderStatic: SVGGElement;
  private marker: SVGCircleElement;
  private ring: SVGPathElement;
  private pianoEl: HTMLElement;
  private signsEl: HTMLElement;
  readonly answerBtn: HTMLButtonElement;
  private keyEls = new Map<number, HTMLButtonElement>();
  private signEls = new Map<ChordQuality, HTMLButtonElement>();
  private runner: PuzzleRunner | null = null;
  private markerY = 0;
  private ladderKey = '';
  private flashTimer = 0;
  private choiceMode = false;
  /** Set by the world. */
  onSign: ((quality: ChordQuality) => void) | null = null;
  onKey: ((midi: number) => void) | null = null;
  onAnswer: (() => void) | null = null;

  constructor(ui: HTMLDivElement, private palette: Palette) {
    this.root = el('div', 'panel hidden');
    this.root.id = 'puzzle';
    const left = el('div', 'panel-left');
    this.titleEl = el('h2', 'panel-title', '');
    this.bodyEl = el('p', 'panel-body', '');
    this.statusEl = el('p', 'panel-status', '');
    this.statusEl.id = 'puzzle-status';
    this.answerBtn = el('button', 'panel-answer', '', { id: 'puzzle-answer', type: 'button' });
    this.answerBtn.addEventListener('click', () => this.onAnswer?.());
    left.append(this.titleEl, this.bodyEl, this.statusEl, this.answerBtn);

    const right = el('div', 'panel-right');
    this.ladder = svg('svg', { class: 'ladder', viewBox: `0 0 ${LADDER_W} ${LADDER_H}`, width: LADDER_W, height: LADDER_H });
    this.ladderStatic = svg('g', {});
    this.marker = svg('circle', { r: 6, fill: '#f6efe2', opacity: 0.9 });
    this.ring = svg('path', { fill: 'none', 'stroke-width': 3, stroke: colorToCss(palette.accent) });
    this.ladder.append(this.ladderStatic, this.ring, this.marker);
    this.pianoEl = el('div', 'piano');
    this.pianoEl.id = 'piano';
    this.buildPiano();
    this.signsEl = el('div', 'signs hidden');
    this.signsEl.id = 'signs';
    this.buildSigns();
    right.append(this.ladder, this.pianoEl, this.signsEl);

    this.dotsEl = el('div', 'panel-dots');
    this.keysEl = el('div', 'panel-keys', '');
    this.root.append(left, right, this.dotsEl, this.keysEl);
    ui.appendChild(this.root);
  }

  private buildPiano(): void {
    let wx = 0;
    const ww = 40;
    const bw = 24;
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      const black = BLACK.has(m % 12);
      const b = el('button', 'key ' + (black ? 'black' : 'white'), '', { type: 'button', 'data-key': String(m) });
      b.style.left = `${black ? wx - bw / 2 : wx}px`;
      b.append(el('span', 'key-name', noteName(m).replace(/-?\d+$/, '')), el('span', 'key-label', keyLabelForMidi(m)));
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onKey?.(m);
      });
      this.keyEls.set(m, b);
      this.pianoEl.append(b);
      if (!black) wx += ww;
    }
    this.pianoEl.style.width = `${wx}px`;
  }

  private buildSigns(): void {
    CHORD_QUALITIES.forEach((q, i) => {
      const b = el('button', 'sign', '', { type: 'button', 'data-sign': q });
      b.append(el('span', 'sign-num', String(i + 1)), el('span', 'sign-name', CHORD_SHORT[q]));
      b.addEventListener('click', () => this.onSign?.(q));
      this.signEls.set(q, b);
      this.signsEl.append(b);
    });
  }

  setPalette(p: Palette): void {
    this.palette = p;
    this.root.style.setProperty('--accent', colorToCss(p.accent));
    this.ring.setAttribute('stroke', colorToCss(p.accent));
  }

  show(runner: PuzzleRunner): void {
    this.runner = runner;
    const q = runner.question.spec;
    this.titleEl.textContent = q.title;
    this.bodyEl.textContent = `${q.intro} ${q.instruction}`;
    this.statusEl.textContent = 'Listen…';
    this.root.classList.remove('hidden');
    this.markerY = 0;
    this.ladderKey = '';
    this.layoutFor(runner);
    this.update(null);
  }

  private layoutFor(r: PuzzleRunner): void {
    const choice = r.isChoice;
    this.choiceMode = choice;
    this.keysEl.textContent = choice ? 'Click a sign or press 1 to 4  ·  Space: hear it again  ·  Esc: step away' : 'Space: hear it again  ·  Esc: step away';
    this.signsEl.classList.toggle('hidden', !choice);
    this.pianoEl.classList.toggle('hidden', choice);
    this.ladder.classList.toggle('hidden', choice);
    this.answerBtn.classList.toggle('hidden', choice);
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.runner = null;
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  /** Light the key for `midi` briefly when pressed. */
  flashPipe(midi: number): void {
    const b = this.keyEls.get(midi);
    if (!b) return;
    b.classList.add('flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => b.classList.remove('flash'), 160);
  }

  /** Call every frame. `voiceMidi` is the smoothed live pitch or null. */
  update(voiceMidi: number | null): void {
    const r = this.runner;
    if (!r || !this.visible) return;
    if (r.isChoice !== this.choiceMode) this.layoutFor(r);

    // Step dots for multi-step puzzles.
    const dots = r.stepCount > 1 ? r.stepCount : 0;
    if (this.dotsEl.childElementCount !== dots) {
      clear(this.dotsEl);
      for (let i = 0; i < dots; i++) this.dotsEl.append(el('i', ''));
    }
    Array.from(this.dotsEl.children).forEach((d, i) => (d.className = i < r.stepIndex ? 'done' : i === r.stepIndex ? 'now' : ''));

    if (r.isChoice) {
      this.updateSigns(r);
      return;
    }
    const level = r.hintLevel;
    const ref = r.step.refMidi;
    const targetSemis = r.step.targetMidi - ref;
    const key = `${r.stepIndex}|${level}|${r.attempts.join(',')}|${r.step.spec.kind}`;
    if (key !== this.ladderKey) {
      this.ladderKey = key;
      this.drawLadder(r);
    }
    const rung = (semis: number) => BOTTOM - ((BOTTOM - TOP) * semis) / 12;

    // Live voice marker and hold progress.
    if (voiceMidi !== null && r.phase === 'listening') {
      let semis = voiceMidi - ref;
      semis = ((semis % 12) + 12) % 12;
      if (targetSemis === 12 && semis < 1) semis += 12;
      const ty = rung(Math.max(0, Math.min(12, semis)));
      this.markerY = this.markerY === 0 ? ty : this.markerY + (ty - this.markerY) * 0.3;
      const prog = r.candidate ? r.candidate.progress : 0;
      this.marker.setAttribute('cx', String(LX));
      this.marker.setAttribute('cy', String(this.markerY));
      this.marker.style.display = '';
      const a0 = -Math.PI / 2;
      const a1 = a0 + Math.PI * 2 * Math.min(0.999, prog);
      const rr = 11;
      const x0 = LX + Math.cos(a0) * rr;
      const y0 = this.markerY + Math.sin(a0) * rr;
      const x1 = LX + Math.cos(a1) * rr;
      const y1 = this.markerY + Math.sin(a1) * rr;
      this.ring.setAttribute('d', prog > 0.01 ? `M ${x0} ${y0} A ${rr} ${rr} 0 ${prog > 0.5 ? 1 : 0} 1 ${x1} ${y1}` : '');
      this.ring.style.display = '';
    } else {
      this.markerY = 0;
      this.marker.style.display = 'none';
      this.ring.style.display = 'none';
    }

    // Answer button.
    const pending = r.pending;
    if (pending !== null && r.phase === 'listening') {
      this.answerBtn.textContent = `Enter: answer with ${noteName(pending)}`;
      this.answerBtn.classList.add('ready');
    } else {
      this.answerBtn.textContent = 'Try the keys, then Enter';
      this.answerBtn.classList.remove('ready');
    }
    const shown = level >= 3 ? r.step.targetMidi : null;
    for (const [m, b] of this.keyEls) {
      b.classList.toggle('held', m === pending);
      b.classList.toggle('shown', m === shown);
    }
  }

  /** The hint ladder: 13 rungs from the reference up one octave, with attempts and the answer marked as misses mount. */
  private drawLadder(r: PuzzleRunner): void {
    const g = this.ladderStatic;
    clear(g);
    const level = r.hintLevel;
    const ref = r.step.refMidi;
    const targetSemis = r.step.targetMidi - ref;
    const scaleMode = r.step.spec.kind === 'degree';
    const rungs = scaleMode ? MAJOR_SCALE : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const rung = (semis: number) => BOTTOM - ((BOTTOM - TOP) * semis) / 12;
    const accent = colorToCss(this.palette.accent);
    g.append(svg('line', { x1: LX, y1: TOP, x2: LX, y2: BOTTOM, stroke: '#3b3842', 'stroke-width': 2 }));
    rungs.forEach((s, i) => {
      const y = rung(s);
      const wide = s === 0 || s === 12;
      g.append(svg('line', { x1: LX - (wide ? 10 : 6), y1: y, x2: LX + (wide ? 10 : 6), y2: y, stroke: level >= 2 ? '#6e6878' : '#3b3842', 'stroke-width': wide ? 2 : 1 }));
      if (scaleMode && level >= 2) g.append(this.label(LX + 14, y, String(i + 1), '#8f8a80'));
    });
    if (level >= 3) g.append(this.label(LX - 52, rung(0), scaleMode ? `key ${noteName(ref).replace(/\d/, '')}` : noteName(ref), '#8f8a80'));
    const chord = chordOf(r.step);
    if (chord && level >= 2) {
      chord.forEach((s, i) => {
        const y = rung(s);
        g.append(svg('circle', { cx: LX, cy: y, r: 4, fill: '#6e6878' }));
        g.append(this.label(LX + 14, y, ['1', '3', '5', '7'][i], '#8f8a80'));
      });
    }
    if (level >= 2) {
      for (const a of r.attempts) {
        const s = ((((a - ref) % 12) + 12) % 12) || (a - ref >= 12 ? 12 : 0);
        g.append(svg('circle', { cx: LX, cy: rung(s), r: 5, fill: '#e06c75' }));
      }
    }
    if (level >= 3) {
      const y = rung(targetSemis);
      g.append(svg('circle', { cx: LX, cy: y, r: 7, fill: accent }));
      g.append(this.label(LX + (scaleMode ? 30 : 16), y, noteName(r.step.targetMidi), '#f6efe2'));
    }
  }

  private label(x: number, y: number, text: string, color: string): SVGTextElement {
    const t = svg('text', { x, y, fill: color, 'font-size': 11, 'dominant-baseline': 'middle', 'font-family': 'ui-monospace, Menlo, Consolas, monospace' });
    t.textContent = text;
    return t;
  }

  private updateSigns(r: PuzzleRunner): void {
    const spec = r.step.spec;
    const target = spec.kind === 'chordName' ? spec.quality : null;
    for (const [q, b] of this.signEls) {
      b.classList.toggle('wrong', r.choiceAttempts.includes(q));
      b.classList.toggle('lit', r.hintLevel >= 3 && q === target);
    }
  }
}

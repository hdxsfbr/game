import Phaser from 'phaser';
import { noteName } from '../ear/pitchMath';
import { PIANO_HIGH, PIANO_LOW, keyLabelForMidi } from '../ear/pipes';
import { CHORD_QUALITIES, CHORD_SHORT, MAJOR_SCALE, chordOf, type ChordQuality } from '../world/puzzles';
import type { PuzzleRunner } from '../world/puzzleRunner';
import type { Palette } from '../world/palette';

const W = 960;
const H = 190;
const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
const BLACK = new Set([1, 3, 6, 8, 10]);
const SIGN_W = 150;
const SIGN_H = 44;

/**
 * The listening panel shown during a puzzle. Fixed to the camera, bottom of the screen.
 * Shows the title, what to do, the live voice marker, the hold progress, the hint ladder, and the pipes.
 */
export class PuzzlePanel {
  readonly container: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private status: Phaser.GameObjects.Text;
  private keys: Phaser.GameObjects.Text;
  private gfx: Phaser.GameObjects.Graphics;
  private markerY = 0;
  private runner: PuzzleRunner | null = null;
  private litMidi = -1;
  private litUntil = 0;
  private signs: Phaser.GameObjects.Zone[] = [];
  /** Set by the scene; called when a sign is clicked. */
  onSign: ((quality: ChordQuality) => void) | null = null;
  /** Set by the scene; called with the MIDI note when a piano key is clicked. */
  onKey: ((midi: number) => void) | null = null;
  /** Set by the scene; called when the Answer button is clicked. */
  onAnswer: (() => void) | null = null;
  readonly answerBtn: Phaser.GameObjects.Text;
  /** Hit rectangles of the keys drawn this frame, black keys first so they win over the whites beneath. */
  private keyRects: Array<{ x: number; y: number; w: number; h: number; midi: number }> = [];
  private keyZone: Phaser.GameObjects.Zone;

  constructor(
    private readonly scene: Phaser.Scene,
    private palette: Palette,
  ) {
    const y0 = scene.scale.height - H;
    this.container = scene.add.container(0, y0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(24, 16, '', { fontFamily: FONT, fontSize: '24px', color: '#f6efe2' });
    this.body = scene.add.text(24, 50, '', { fontFamily: FONT, fontSize: '16px', color: '#d9d2c4', wordWrap: { width: 520 }, lineSpacing: 4 });
    this.status = scene.add.text(24, 118, '', { fontFamily: FONT, fontSize: '18px', color: '#f2c46d', fontStyle: 'italic' });
    this.keys = scene.add.text(300, H - 28, 'Space: hear it again     Esc: step away', { fontFamily: MONO, fontSize: '13px', color: '#8f8a80' });
    this.answerBtn = scene.add
      .text(24, H - 34, '', { fontFamily: MONO, fontSize: '13px', color: '#15141a', backgroundColor: '#f2c46d', padding: { x: 10, y: 5 } })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onAnswer?.());
    this.container.add([this.gfx, this.title, this.body, this.status, this.keys, this.answerBtn]);
    scene.events.on('postupdate', this.endFrameLabels, this);

    // Zones inside a fixed container still need their own scroll factor at 0, or hit tests shift by the camera scroll.
    this.keyZone = scene.add.zone(600, 84, 352, 72).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this.keyZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const lx = pointer.x - this.container.x;
      const ly = pointer.y - this.container.y;
      const hit = this.keyRects.find((k) => lx >= k.x && lx < k.x + k.w && ly >= k.y && ly < k.y + k.h);
      if (hit) this.onKey?.(hit.midi);
    });
    this.container.add(this.keyZone);
    for (let i = 0; i < 4; i++) {
      const { x, y } = PuzzlePanel.signPos(i);
      const z = scene.add.zone(x, y, SIGN_W, SIGN_H).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.onSign?.(CHORD_QUALITIES[i]));
      this.signs.push(z);
      this.container.add(z);
    }
  }

  /** Top-left of sign i (0..3), two rows of two. */
  static signPos(i: number): { x: number; y: number } {
    return { x: 600 + (i % 2) * (SIGN_W + 14), y: 40 + Math.floor(i / 2) * (SIGN_H + 12) };
  }


  setPalette(p: Palette): void {
    this.palette = p;
  }

  show(runner: PuzzleRunner): void {
    this.runner = runner;
    const q = runner.question.spec;
    this.title.setText(q.title);
    this.body.setText(`${q.intro}\n${q.instruction}`);
    this.status.setY(Math.max(118, this.body.y + this.body.height + 10));
    this.status.setText('Listen…');
    this.container.setVisible(true);
    this.markerY = 0;
    this.layoutFor(runner);
  }

  private choiceMode = false;
  /** Signs for a naming step, ladder and pipes otherwise. */
  private layoutFor(r: PuzzleRunner): void {
    const choice = r.isChoice;
    this.choiceMode = choice;
    this.keys.setText(choice ? 'Click a sign or press 1 to 4     Space: hear it again     Esc: step away' : 'Space: hear it again     Esc: step away');
    this.keys.setX(choice ? 24 : 300);
    for (const z of this.signs) z.setVisible(choice).setActive(choice);
    this.keyZone.setVisible(!choice).setActive(!choice);
    this.answerBtn.setVisible(!choice).setActive(!choice);
  }

  hide(): void {
    this.container.setVisible(false);
    this.runner = null;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  setStatus(text: string): void {
    this.status.setText(text);
  }

  /** Light the key for `midi` briefly when pressed. */
  flashPipe(midi: number): void {
    this.litMidi = midi;
    this.litUntil = this.scene.time.now + 160;
  }


  /** Call every frame. `voiceHz` is the smoothed live pitch or null. */
  update(voiceMidi: number | null): void {
    const r = this.runner;
    if (!r || !this.container.visible) return;
    const g = this.gfx;
    g.clear();

    // Panel background.
    g.fillStyle(0x15141a, 0.92).fillRect(0, 0, W, H);
    g.fillStyle(this.palette.accent, 1).fillRect(0, 0, W, 3);

    // Step dots for multi-step puzzles.
    if (r.stepCount > 1) {
      for (let i = 0; i < r.stepCount; i++) {
        g.fillStyle(i < r.stepIndex ? this.palette.accent : i === r.stepIndex ? 0xf6efe2 : 0x4a4650);
        g.fillCircle(W - 40 - (r.stepCount - 1 - i) * 18, 22, 5);
      }
    }

    if (r.isChoice !== this.choiceMode) this.layoutFor(r);
    if (r.isChoice) {
      this.drawSigns(r);
      return;
    }

    // Ladder: 13 rungs from the reference up one octave, drawn at x = 560..
    const lx = 560;
    const top = 22;
    const bottom = H - 56;
    const rung = (semis: number) => bottom - ((bottom - top) * semis) / 12;
    const level = r.hintLevel;
    const ref = r.step.refMidi;
    const targetSemis = r.step.targetMidi - ref;

    const scaleMode = r.step.spec.kind === 'degree';
    const rungs = scaleMode ? MAJOR_SCALE : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    g.lineStyle(2, 0x3b3842).lineBetween(lx, top, lx, bottom);
    rungs.forEach((s, i) => {
      const y = rung(s);
      const wide = s === 0 || s === 12;
      g.lineStyle(wide ? 2 : 1, level >= 2 ? 0x6e6878 : 0x3b3842).lineBetween(lx - (wide ? 10 : 6), y, lx + (wide ? 10 : 6), y);
      if (scaleMode && level >= 2) this.drawLabel(lx + 14, y, String(i + 1), '#8f8a80');
    });
    // The reference is named only once the answer is shown, so it cannot be counted from.
    if (level >= 3) this.drawLabel(lx - 48, rung(0), scaleMode ? `key ${noteName(ref).replace(/\d/, '')}` : noteName(ref), '#8f8a80');
    // A chord's notes stacked on the ladder, from the second miss.
    const chord = chordOf(r.step);
    if (chord && level >= 2) {
      chord.forEach((s, i) => {
        const y = rung(s);
        g.fillStyle(0x6e6878).fillCircle(lx, y, 4);
        this.drawLabel(lx + 14, y, ['1', '3', '5', '7'][i], '#8f8a80');
      });
    }

    if (level >= 2) {
      for (const a of r.attempts) {
        const s = ((((a - ref) % 12) + 12) % 12) || (a - ref >= 12 ? 12 : 0);
        g.fillStyle(0xe06c75).fillCircle(lx, rung(s), 5);
      }
    }
    if (level >= 3) {
      const y = rung(targetSemis);
      g.fillStyle(this.palette.accent).fillCircle(lx, y, 7);
      this.drawLabel(lx + (scaleMode ? 30 : 16), y, noteName(r.step.targetMidi), '#f6efe2');
    }

    // Live voice marker and hold progress.
    if (voiceMidi !== null && r.phase === 'listening') {
      let semis = voiceMidi - ref;
      semis = ((semis % 12) + 12) % 12;
      if (targetSemis === 12 && semis < 1) semis += 12;
      const targetY = rung(Phaser.Math.Clamp(semis, 0, 12));
      this.markerY = this.markerY === 0 ? targetY : this.markerY + (targetY - this.markerY) * 0.3;
      const cand = r.candidate;
      const prog = cand ? cand.progress : 0;
      g.fillStyle(0xf6efe2, 0.9).fillCircle(lx, this.markerY, 6);
      g.lineStyle(3, this.palette.accent, 1);
      g.beginPath();
      g.arc(lx, this.markerY, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, false);
      g.strokePath();
    } else {
      this.markerY = 0;
    }

    // Answer button.
    const pending = r.pending;
    if (pending !== null && r.phase === 'listening') this.answerBtn.setText(`Enter: answer with ${noteName(pending)}`).setBackgroundColor('#f2c46d').setColor('#15141a');
    else this.answerBtn.setText('Try the keys, then Enter').setBackgroundColor('#2a2730').setColor('#8f8a80');

    this.drawPiano(r, level >= 3 ? r.step.targetMidi : null);
  }

  /**
   * The piano, C4 to E5, the same for every door so an interval cannot be counted from the root.
   * The key last tried stays lit until Enter answers with it. The answer is outlined from the third miss.
   */
  private drawPiano(r: PuzzleRunner, shownMidi: number | null): void {
    const g = this.gfx;
    const ww = 34;
    const wh = 62;
    const bw = 20;
    const bh = 38;
    const y = 88;
    const x0 = 606;
    const xs: number[] = [];
    let wx = x0;
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      if (BLACK.has(m % 12)) xs[m - PIANO_LOW] = wx - bw / 2;
      else {
        xs[m - PIANO_LOW] = wx;
        wx += ww;
      }
    }
    const now = this.scene.time.now;
    const whites: typeof this.keyRects = [];
    const blacks: typeof this.keyRects = [];
    for (const pass of [0, 1]) {
      for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
        const black = BLACK.has(m % 12);
        if ((pass === 1) !== black) continue;
        const x = xs[m - PIANO_LOW];
        const flash = m === this.litMidi && now < this.litUntil;
        const held = m === r.pending;
        const name = noteName(m).replace(/-?\d+$/, '');
        (black ? blacks : whites).push({ x, y, w: black ? bw : ww - 1, h: black ? bh : wh, midi: m });
        const w = black ? bw : ww - 1;
        const h = black ? bh : wh;
        const corners = black ? { tl: 0, tr: 0, bl: 3, br: 3 } : { tl: 0, tr: 0, bl: 4, br: 4 };
        const fill = flash ? 0xfff2cc : held ? this.palette.accent : black ? 0x1c1a22 : 0xe9e3d6;
        g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, corners);
        g.lineStyle(1, 0x15141a).strokeRoundedRect(x, y, w, h, corners);
        if (shownMidi === m) g.lineStyle(3, this.palette.accent, 1).strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, corners);
        const dark = flash || held || !black;
        const nameColor = dark ? '#15141a' : '#f6efe2';
        const keyColor = dark ? (held ? '#15141a' : '#8a8478') : '#9a948a';
        if (black) {
          this.drawLabel(x + bw / 2, y + bh - 20, name, nameColor, true, '10px');
          this.drawLabel(x + bw / 2, y + bh - 8, keyLabelForMidi(m), keyColor, true, '10px');
        } else {
          this.drawLabel(x + ww / 2, y + wh - 24, name, nameColor, true);
          this.drawLabel(x + ww / 2, y + wh - 10, keyLabelForMidi(m), keyColor, true);
        }
      }
    }
    this.keyRects = blacks.concat(whites);
  }

  /** The four quality signs for a naming step. Wrong picks go red; the answer lights on the third miss. */
  private drawSigns(r: PuzzleRunner): void {
    const g = this.gfx;
    const spec = r.step.spec;
    const target = spec.kind === 'chordName' ? spec.quality : null;
    CHORD_QUALITIES.forEach((q, i) => {
      const { x, y } = PuzzlePanel.signPos(i);
      const wrong = r.choiceAttempts.includes(q);
      const lit = r.hintLevel >= 3 && q === target;
      g.fillStyle(lit ? this.palette.accent : wrong ? 0x3a2228 : 0x2a2730, 1).fillRoundedRect(x, y, SIGN_W, SIGN_H, 6);
      g.lineStyle(1, wrong ? 0xe06c75 : lit ? 0xf6efe2 : 0x4a4650).strokeRoundedRect(x, y, SIGN_W, SIGN_H, 6);
      this.drawLabel(x + 12, y + SIGN_H / 2, String(i + 1), wrong ? '#e06c75' : '#8f8a80');
      this.drawLabel(x + 34, y + SIGN_H / 2, CHORD_SHORT[q], wrong ? '#e06c75' : '#f6efe2');
    });
  }

  private labelPool: Phaser.GameObjects.Text[] = [];
  private labelsUsed = 0;
  private drawLabel(x: number, y: number, text: string, color: string, center = false, fontSize = '12px'): void {
    let t = this.labelPool[this.labelsUsed];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: MONO, fontSize: '12px' });
      this.container.add(t);
      this.labelPool.push(t);
    }
    t.setOrigin(center ? 0.5 : 0, 0.5).setPosition(x, y).setText(text).setColor(color).setFontSize(fontSize).setVisible(true);
    this.labelsUsed++;
  }

  /** Hide labels not drawn this frame. Called from the postupdate hook registered in the constructor. */
  private endFrameLabels(): void {
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].setVisible(false);
    this.labelsUsed = 0;
  }
}

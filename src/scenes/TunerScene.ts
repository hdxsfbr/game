import Phaser from 'phaser';
import { AudioEngine } from '../audio/engine';
import { playNote } from '../audio/synth';
import { MicPitchDetector } from '../ear/pitchDetector';
import { HoldDetector, INTERVALS, checkPitch, hzToMidi, noteName, type Interval } from '../ear/pitchMath';
import { KEY_LABELS, PIANO_HIGH, PIANO_LOW, pipeForCode } from '../ear/pipes';

/**
 * Development scene: proves the pitch detector, the synth, and the pipes on a real voice.
 * Not part of the shipped game. See docs/design.md ("Schedule", Sunday).
 */
export class TunerScene extends Phaser.Scene {
  private mic = new MicPitchDetector();
  private readout!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private needle!: Phaser.GameObjects.Graphics;
  private pipeRects: Phaser.GameObjects.Rectangle[] = [];
  private challengeText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;

  private challenge: { interval: Interval; refMidi: number; targetMidi: number; hold: HoldDetector; listening: boolean } | null = null;
  private challengePool = ['P8', 'P5', 'P4', 'M3', 'm3'];
  private solvedFlashUntil = 0;
  private needleCents = 0;

  constructor() {
    super('tuner');
  }

  create(): void {
    const { width } = this.scale;
    this.add.text(width / 2, 24, 'Listening Kingdom: tuner test', { fontSize: '26px', color: '#e8e4d8', fontFamily: 'sans-serif' }).setOrigin(0.5);

    this.makeButton(120, 70, 'Enable microphone', () => this.enableMic());
    this.makeButton(350, 70, 'New challenge (Space)', () => this.newChallenge());
    this.makeButton(580, 70, 'Replay (R)', () => this.replayChallenge());
    this.makeButton(810, 70, 'Play C4', () => this.playNoteUnlocked(60));

    this.status = this.add.text(20, 100, 'Mic: idle', { fontSize: '16px', color: '#9aa3b2', fontFamily: 'monospace' });
    this.readout = this.add.text(20, 130, '', { fontSize: '18px', color: '#e8e4d8', fontFamily: 'monospace', lineSpacing: 6 });

    this.needle = this.add.graphics();
    this.progressBar = this.add.graphics();
    this.challengeText = this.add.text(width / 2, 330, 'Press Space for a challenge', { fontSize: '22px', color: '#f0c674', fontFamily: 'sans-serif', align: 'center' }).setOrigin(0.5);

    this.drawPipes();

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const w = 210;
    const r = this.add.rectangle(x, y, w, 36, 0x2c3140).setStrokeStyle(2, 0x5a6378).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '15px', color: '#e8e4d8', fontFamily: 'sans-serif' }).setOrigin(0.5);
    r.on('pointerover', () => r.setFillStyle(0x3a4154));
    r.on('pointerout', () => r.setFillStyle(0x2c3140));
    r.on('pointerdown', () => void onClick());
  }

  private drawPipes(): void {
    const baseX = 70;
    const y = 470;
    this.add.text(20, 400, 'Piano C4..E5: A S D F G H J K white keys, W E T Y U black keys, O L P ; above', { fontSize: '14px', color: '#9aa3b2', fontFamily: 'monospace' });
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      const i = m - PIANO_LOW;
      const x = baseX + i * 50;
      const rect = this.add.rectangle(x, y, 40, 90, 0x3a4154).setStrokeStyle(2, 0x5a6378).setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.onPipe(m));
      this.add.text(x, y - 25, KEY_LABELS[i], { fontSize: '20px', color: '#e8e4d8', fontFamily: 'sans-serif' }).setOrigin(0.5);
      this.add.text(x, y + 20, noteName(m), { fontSize: '14px', color: '#9aa3b2', fontFamily: 'monospace' }).setOrigin(0.5);
      this.pipeRects.push(rect);
    }
  }

  private async enableMic(): Promise<void> {
    await this.mic.start();
  }

  private async playNoteUnlocked(midi: number): Promise<void> {
    await AudioEngine.get().unlock();
    playNote(midi, { duration: 0.8 });
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      void this.newChallenge();
      return;
    }
    if (ev.code === 'KeyR') {
      void this.replayChallenge();
      return;
    }
    const hit = pipeForCode(ev.code);
    if (hit !== null) this.onPipe(hit);
  }

  private onPipe(midi: number): void {
    void this.playNoteUnlocked(midi);
    const rect = this.pipeRects[midi - PIANO_LOW];
    rect.setFillStyle(0xf0c674);
    this.time.delayedCall(150, () => rect.setFillStyle(0x3a4154));

    const c = this.challenge;
    if (c && c.listening) {
      const res = checkPitch(440 * Math.pow(2, (midi - 69) / 12), c.targetMidi);
      if (res.ok) this.solve('pipes');
    }
  }

  private async newChallenge(): Promise<void> {
    await AudioEngine.get().unlock();
    const engine = AudioEngine.get();
    const id = this.challengePool[Math.floor(Math.random() * this.challengePool.length)];
    const interval = INTERVALS.find((i) => i.id === id)!;
    const refMidi = 57 + Math.floor(Math.random() * 8); // A3..E4, comfortable for most voices
    const targetMidi = refMidi + interval.semitones;
    this.challenge = { interval, refMidi, targetMidi, hold: new HoldDetector(targetMidi), listening: false };
    this.challengeText.setText(`Sing a ${interval.name.toLowerCase()} above ${noteName(refMidi)}\n(listen first)`);
    engine.setDuck(1);
    this.playPrompt();
  }

  /** Plays reference then target, then opens the listening window. */
  private playPrompt(): void {
    const c = this.challenge;
    if (!c) return;
    const engine = AudioEngine.get();
    engine.setDuck(1);
    c.listening = false;
    const t0 = engine.now + 0.05;
    playNote(c.refMidi, { at: t0, duration: 0.7 });
    const end = playNote(c.targetMidi, { at: t0 + 0.9, duration: 0.7 });
    const waitMs = Math.max(0, (end - engine.now) * 1000) + 150;
    this.time.delayedCall(waitMs, () => {
      if (this.challenge !== c) return;
      c.hold.reset();
      c.listening = true;
      engine.setDuck(0.15);
      this.challengeText.setText(`Sing a ${c.interval.name.toLowerCase()} above ${noteName(c.refMidi)}\n(your turn: sing or press a pipe)`);
    });
  }

  private replayChallenge(): void {
    if (this.challenge) this.playPrompt();
  }

  private solve(how: 'voice' | 'pipes'): void {
    const c = this.challenge;
    if (!c) return;
    c.listening = false;
    AudioEngine.get().setDuck(1);
    this.solvedFlashUntil = this.time.now + 1200;
    this.challengeText.setText(`Correct (${how}): ${c.interval.name}, ${noteName(c.refMidi)} to ${noteName(c.targetMidi)}`);
    playNote(c.targetMidi, { timbre: 'bell', duration: 0.6 });
    this.cameras.main.flash(300, 240, 198, 116);
  }

  update(time: number): void {
    const frame = this.mic.read();
    const settings = this.mic.trackSettings();
    this.status.setText(
      `Mic: ${this.mic.status}` +
        (settings ? `  ec=${settings.echoCancellation} ns=${settings.noiseSuppression} agc=${settings.autoGainControl} sr=${AudioEngine.get().ctx.sampleRate}` : '') +
        (this.mic.lastError ? `\n${this.mic.lastError}` : '') +
        (window.isSecureContext ? '' : '\n(page is not a secure context)'),
    );

    let line = `rms ${frame.rms.toFixed(3)}  clarity ${frame.clarity.toFixed(2)}`;
    let cents = 0;
    let voiced = false;
    if (frame.hz !== null) {
      const midi = hzToMidi(frame.hz);
      const nearest = Math.round(midi);
      cents = (midi - nearest) * 100;
      voiced = true;
      line += `\n${frame.hz.toFixed(1)} Hz  ${noteName(nearest)}  ${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cents`;
    } else {
      line += `\n(no voice)`;
    }
    this.readout.setText(line);

    // Needle: cents from nearest semitone.
    const g = this.needle;
    g.clear();
    const cx = 480;
    const cy = 250;
    g.lineStyle(2, 0x5a6378).strokeRect(cx - 200, cy - 20, 400, 40);
    g.lineStyle(2, 0x9aa3b2).lineBetween(cx, cy - 26, cx, cy + 26);
    if (voiced) {
      this.needleCents += (cents - this.needleCents) * 0.25;
      const x = cx + Phaser.Math.Clamp(this.needleCents, -50, 50) * 4;
      g.fillStyle(Math.abs(cents) < 15 ? 0x8fd694 : 0xf0c674).fillRect(x - 4, cy - 18, 8, 36);
    }

    // Challenge hold.
    const c = this.challenge;
    const bar = this.progressBar;
    bar.clear();
    if (c && c.listening) {
      c.hold.feed(frame.hz, time);
      const err = c.hold.lastErrorCents;
      bar.lineStyle(2, 0x5a6378).strokeRect(cx - 200, 290, 400, 14);
      bar.fillStyle(0x8fd694).fillRect(cx - 199, 291, 398 * c.hold.progress, 12);
      if (err !== null) {
        const x = cx + Phaser.Math.Clamp(err, -300, 300) * (200 / 300);
        bar.fillStyle(Math.abs(err) <= 50 ? 0x8fd694 : 0xe06c75).fillCircle(x, 283, 5);
      }
      if (c.hold.done) this.solve('voice');
    } else if (time < this.solvedFlashUntil) {
      bar.fillStyle(0x8fd694).fillRect(cx - 199, 291, 398, 12);
    }
  }
}

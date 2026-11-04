import { StableNoteDetector, checkPitch, midiToHz } from '../ear/pitchMath';
import type { ChordQuality, Question, Step } from './puzzles';

export type Phase = 'idle' | 'prompting' | 'listening' | 'done';

export interface RunnerHooks {
  /** Play the step's prompt. Resolve when the player may answer. `again` is a replay the player asked for. */
  playPrompt(step: Step, slow: boolean, again: boolean): Promise<void>;
  /** Called when a step is answered correctly. Resolve when the next prompt may begin. */
  onStepSolved(index: number): Promise<void>;
  onSolved(): void;
  /** Called on a wrong answer: a MIDI note, or a chord quality for a naming step. Resolve when the prompt may replay. */
  onMiss(attempt: number | ChordQuality): Promise<void>;
  onListening(): void;
}

/**
 * Drives one puzzle: prompt, listen, judge, hint, repeat. Input-agnostic: voice frames come
 * through feedVoice, pipe presses through attempt.
 */
export class PuzzleRunner {
  stepIndex = 0;
  misses = 0;
  /** Wrong answers for the current step, as MIDI notes, for the ladder. */
  attempts: number[] = [];
  /** Wrong chord names for the current step, for the signs. */
  choiceAttempts: ChordQuality[] = [];
  /** True while the step is answered by naming a chord rather than by a note. */
  get isChoice(): boolean {
    return this.step.spec.kind === 'chordName';
  }
  phase: Phase = 'idle';
  /** The note last tried on the pipes and not yet answered with. */
  pending: number | null = null;
  /**
   * Added to the miss count for the hint ladder. Drills set 1 so help comes a miss sooner; doors set -2 so
   * the player gets three tries on the reference alone before the answer is played.
   */
  hintOffset = 0;
  /** Points for the steps solved so far: 3 for a first try, one less per miss before the answer was heard. */
  points = 0;
  private stable = new StableNoteDetector();
  private generation = 0;

  constructor(
    readonly question: Question,
    private readonly hooks: RunnerHooks,
  ) {}

  get step(): Step {
    return this.question.steps[this.stepIndex];
  }

  get stepCount(): number {
    return this.question.steps.length;
  }

  /** 0: nothing. 1: slower replay with the answer. 2: ladder with attempts. 3: target shown. */
  get hintLevel(): number {
    return Math.max(0, Math.min(3, this.misses === 0 ? 0 : this.misses + this.hintOffset));
  }

  /** Tries left before the answer is played, or 0 once it has been. */
  get triesLeft(): number {
    return Math.max(0, 1 - this.hintOffset - this.misses);
  }

  get candidate(): { midi: number; progress: number } | null {
    return this.phase === 'listening' ? this.stable.candidate : null;
  }

  async start(): Promise<void> {
    await this.prompt();
  }

  async replay(): Promise<void> {
    if (this.phase === 'listening') await this.prompt(true);
  }

  abort(): void {
    this.generation++;
    this.phase = 'done';
  }

  feedVoice(hz: number | null, t: number): void {
    if (this.phase !== 'listening' || this.isChoice) return;
    const r = this.stable.feed(hz, t);
    if (r) void this.attempt(r.midi);
  }

  /** Try a note on the pipes without answering. Enter (confirm) answers with it. */
  audition(midi: number): void {
    if (this.phase !== 'listening' || this.isChoice) return;
    this.pending = midi;
  }

  /** Answer with the note last tried. */
  async confirm(): Promise<void> {
    if (this.phase !== 'listening' || this.isChoice || this.pending === null) return;
    const midi = this.pending;
    this.pending = null;
    await this.attempt(midi);
  }

  async attempt(midi: number): Promise<void> {
    if (this.phase !== 'listening' || this.isChoice) return;
    const ok = checkPitch(midiToHz(midi), this.step.targetMidi).ok;
    if (!ok) this.attempts.push(midi);
    await this.judge(ok, midi);
  }

  /** Answer a chord-naming step. */
  async attemptChoice(quality: ChordQuality): Promise<void> {
    if (this.phase !== 'listening' || !this.isChoice) return;
    const spec = this.step.spec;
    const ok = spec.kind === 'chordName' && spec.quality === quality;
    if (!ok) this.choiceAttempts.push(quality);
    await this.judge(ok, quality);
  }

  private async judge(ok: boolean, attempt: number | ChordQuality): Promise<void> {
    const gen = this.generation;
    this.phase = 'prompting';
    if (ok) {
      const index = this.stepIndex;
      this.points += this.hintLevel >= 1 ? 0 : Math.max(0, 3 - this.misses);
      await this.hooks.onStepSolved(index);
      if (gen !== this.generation) return;
      this.stepIndex++;
      this.attempts = [];
      this.choiceAttempts = [];
      this.misses = 0;
      if (this.stepIndex >= this.stepCount) {
        this.phase = 'done';
        this.hooks.onSolved();
      } else {
        await this.prompt();
      }
    } else {
      this.misses++;
      await this.hooks.onMiss(attempt);
      if (gen !== this.generation) return;
      await this.prompt();
    }
  }

  private async prompt(again = false): Promise<void> {
    const gen = this.generation;
    this.phase = 'prompting';
    this.pending = null;
    this.stable.reset();
    await this.hooks.playPrompt(this.step, this.hintLevel >= 1, again);
    if (gen !== this.generation || this.phase !== 'prompting') return;
    this.phase = 'listening';
    this.hooks.onListening();
  }
}

/**
 * Pure pitch math. No audio, no DOM. Everything here is unit-tested in tests/pitchMath.test.ts.
 *
 * Units: Hz for frequency, MIDI note numbers (A4 = 69 = 440 Hz), cents (100 per semitone).
 */

export const A4_HZ = 440;
export const A4_MIDI = 69;

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function hzToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Signed distance in cents from refHz up to hz. Positive = hz is higher. */
export function centsBetween(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}

/** Fold a cents distance into the range [-600, 600) so octaves do not matter. */
export function foldCents(cents: number): number {
  const m = ((cents % 1200) + 1200) % 1200; // 0..1200
  return m >= 600 ? m - 1200 : m;
}

export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export interface Interval {
  /** Short label used in code. */
  id: string;
  /** Display name. */
  name: string;
  semitones: number;
}

export const INTERVALS: readonly Interval[] = [
  { id: 'P1', name: 'Unison', semitones: 0 },
  { id: 'm2', name: 'Minor second', semitones: 1 },
  { id: 'M2', name: 'Major second', semitones: 2 },
  { id: 'm3', name: 'Minor third', semitones: 3 },
  { id: 'M3', name: 'Major third', semitones: 4 },
  { id: 'P4', name: 'Perfect fourth', semitones: 5 },
  { id: 'TT', name: 'Tritone', semitones: 6 },
  { id: 'P5', name: 'Perfect fifth', semitones: 7 },
  { id: 'm6', name: 'Minor sixth', semitones: 8 },
  { id: 'M6', name: 'Major sixth', semitones: 9 },
  { id: 'm7', name: 'Minor seventh', semitones: 10 },
  { id: 'M7', name: 'Major seventh', semitones: 11 },
  { id: 'P8', name: 'Octave', semitones: 12 },
];

export function intervalById(id: string): Interval {
  const found = INTERVALS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown interval ${id}`);
  return found;
}

export interface AnswerRules {
  /** Allowed absolute error in cents. Default 50 (a quarter tone). */
  toleranceCents: number;
  /** Extra leniency on the sharp side, in cents. Default 10. */
  sharpBonusCents: number;
  /** Ignore which octave the player sang in. Default true. */
  octaveAgnostic: boolean;
}

export const DEFAULT_RULES: AnswerRules = {
  toleranceCents: 50,
  sharpBonusCents: 10,
  octaveAgnostic: true,
};

export const HARD_RULES: AnswerRules = {
  toleranceCents: 35,
  sharpBonusCents: 5,
  octaveAgnostic: true,
};

export interface AnswerResult {
  ok: boolean;
  /** Signed error in cents after any octave folding. Positive = sharp. */
  errorCents: number;
}

/**
 * Did a sung frequency hit the target?
 * The target is expressed as a note (MIDI) so that both "sing a fifth above this reference"
 * and "sing the third of this chord" reduce to the same check.
 */
export function checkPitch(sungHz: number, targetMidi: number, rules: AnswerRules = DEFAULT_RULES): AnswerResult {
  const targetHz = midiToHz(targetMidi);
  let err = centsBetween(sungHz, targetHz);
  if (rules.octaveAgnostic) err = foldCents(err);
  const upper = rules.toleranceCents + rules.sharpBonusCents;
  const lower = -rules.toleranceCents;
  return { ok: err >= lower && err <= upper, errorCents: err };
}

/** Convenience: target is `semitones` above `refMidi`. */
export function checkInterval(
  sungHz: number,
  refMidi: number,
  semitones: number,
  rules: AnswerRules = DEFAULT_RULES,
): AnswerResult {
  return checkPitch(sungHz, refMidi + semitones, rules);
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface HoldOptions {
  /** Voiced, in-tolerance time required, in ms. Default 800. */
  holdMs: number;
  /** A gap in voiced-and-correct frames longer than this resets progress. Default 200. */
  maxGapMs: number;
}

export const DEFAULT_HOLD: HoldOptions = { holdMs: 800, maxGapMs: 200 };

/**
 * Accumulates "the player is holding the right note" time across frames.
 * Feed it one frame per animation tick. `null` hz means no voiced pitch this frame.
 */
export class HoldDetector {
  private accumulated = 0;
  private lastGoodT: number | null = null;
  private lastT: number | null = null;
  private _done = false;
  private _lastError: number | null = null;

  constructor(
    private readonly targetMidi: number,
    private readonly rules: AnswerRules = DEFAULT_RULES,
    private readonly opts: HoldOptions = DEFAULT_HOLD,
  ) {}

  get done(): boolean {
    return this._done;
  }

  /** 0..1 fraction of the hold requirement reached. */
  get progress(): number {
    return Math.min(1, this.accumulated / this.opts.holdMs);
  }

  /** Last signed error in cents, or null if the last frame was unvoiced. */
  get lastErrorCents(): number | null {
    return this._lastError;
  }

  reset(): void {
    this.accumulated = 0;
    this.lastGoodT = null;
    this.lastT = null;
    this._done = false;
    this._lastError = null;
  }

  /** @param t timestamp in ms (performance.now()). Returns true once the hold completes. */
  feed(hz: number | null, t: number): boolean {
    if (this._done) return true;
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;

    if (hz === null || !(hz > 0)) {
      this._lastError = null;
      this.handleGap(t);
      return false;
    }

    const res = checkPitch(hz, this.targetMidi, this.rules);
    this._lastError = res.errorCents;
    if (!res.ok) {
      this.handleGap(t);
      return false;
    }

    // Good frame. Count the time since the previous frame only if the gap was short enough.
    if (this.lastGoodT !== null && t - this.lastGoodT <= this.opts.maxGapMs) {
      this.accumulated += Math.min(dt, this.opts.maxGapMs);
    }
    this.lastGoodT = t;
    if (this.accumulated >= this.opts.holdMs) this._done = true;
    return this._done;
  }

  private handleGap(t: number): void {
    if (this.lastGoodT !== null && t - this.lastGoodT > this.opts.maxGapMs) {
      this.accumulated = 0;
      this.lastGoodT = null;
    }
  }
}

export interface StableNoteOptions {
  /** Time the pitch must stay on one note, in ms. Default 700. */
  holdMs: number;
  /** Allowed wobble around the note's centre, in cents. Default 50. */
  wobbleCents: number;
  /** A gap in voiced frames longer than this resets. Default 200. */
  maxGapMs: number;
}

export const DEFAULT_STABLE: StableNoteOptions = { holdMs: 700, wobbleCents: 50, maxGapMs: 200 };

export interface StableNote {
  /** Nearest MIDI note (integer). */
  midi: number;
  /** Mean signed offset from that note during the hold, in cents. */
  offsetCents: number;
}

/**
 * Reports when the singer has held *any* one note steadily. Used by puzzles to decide that the
 * player has committed to an answer, right or wrong. Feed one frame per tick, like HoldDetector.
 */
export class StableNoteDetector {
  private midi: number | null = null;
  private start = 0;
  private lastT: number | null = null;
  private lastVoicedT: number | null = null;
  private sumCents = 0;
  private count = 0;
  private fired = false;

  constructor(private readonly opts: StableNoteOptions = DEFAULT_STABLE) {}

  /** Current candidate note and progress 0..1, for a live indicator. */
  get candidate(): { midi: number; progress: number } | null {
    if (this.midi === null || this.lastT === null) return null;
    return { midi: this.midi, progress: Math.min(1, (this.lastT - this.start) / this.opts.holdMs) };
  }

  reset(): void {
    this.midi = null;
    this.lastT = null;
    this.lastVoicedT = null;
    this.sumCents = 0;
    this.count = 0;
    this.fired = false;
  }

  /** Returns the held note once per hold, then stays null until the singer moves to a new note. */
  feed(hz: number | null, t: number): StableNote | null {
    this.lastT = t;
    if (hz === null || !(hz > 0)) {
      if (this.lastVoicedT !== null && t - this.lastVoicedT > this.opts.maxGapMs) this.dropCandidate();
      return null;
    }
    this.lastVoicedT = t;
    const m = hzToMidi(hz);
    const nearest = Math.round(m);
    const cents = (m - nearest) * 100;

    if (this.midi !== null) {
      const dist = (m - this.midi) * 100;
      if (Math.abs(dist) > this.opts.wobbleCents) this.dropCandidate();
    }
    if (this.midi === null) {
      this.midi = nearest;
      this.start = t;
      this.sumCents = 0;
      this.count = 0;
      this.fired = false;
    }
    this.sumCents += cents;
    this.count++;
    if (!this.fired && t - this.start >= this.opts.holdMs) {
      this.fired = true;
      return { midi: this.midi, offsetCents: this.sumCents / this.count };
    }
    return null;
  }

  private dropCandidate(): void {
    this.midi = null;
    this.fired = false;
  }
}

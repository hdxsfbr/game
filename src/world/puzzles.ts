import { intervalById } from '../ear/pitchMath';

/**
 * Puzzle content model. A puzzle has one or more steps; each step is one listening question.
 * Kinds planned per area: interval (Valley), degree (Town), chordTone and chordName (Jazz Quarter).
 */
export type StepSpec =
  | { kind: 'interval'; intervalId: string }
  | { kind: 'degree'; degree: number }
  | { kind: 'chordTone'; quality: ChordQuality; tone: 3 | 5 | 7 }
  | { kind: 'chordName'; quality: ChordQuality }
  /** The band plays ii and V; the player supplies the I (the tonic). */
  | { kind: 'resolve' };

export type ChordQuality = 'maj7' | 'min7' | 'dom7' | 'm7b5';

/**
 * echo: the prompt plays the reference and the target; the player gives the target back.
 * produce: the prompt plays only the reference; the player must find the interval by ear.
 * A miss replays the prompt as an echo, slower, so the answer is always heard before the ladder.
 */
export type PuzzleMode = 'echo' | 'produce' | 'melody';

export interface PuzzleSpec {
  id: string;
  title: string;
  /** Default 'produce'. */
  mode?: PuzzleMode;
  /** One line of story when the puzzle starts. Written for the player. */
  intro: string;
  /** What to do, in one sentence. */
  instruction: string;
  steps: StepSpec[];
  /** Lowest and highest MIDI the reference may take. Keeps targets singable. */
  refRange: [number, number];
  /** All steps share one reference note (used by the serpent and every Town puzzle). */
  sharedRef?: boolean;
  /** Instead of `steps`, pick this many random degrees from 1..7, weighted toward past misses. */
  randomDegrees?: number;
  /** Instead of `steps`, pick one of these melodies (scale degrees). */
  melodies?: number[][];
  /** Instead of `steps`, this many chords to name, no quality twice in a row. */
  randomChords?: number;
  /** Instead of `steps`, this many intervals drawn from the pool, none twice in a row. */
  randomIntervals?: { pool: string[]; count: number };
  /** Awarded when solved. */
  reward?: 'fragment';
  /** Flags set when solved, read by gates. */
  setsFlags?: string[];
}

export interface Step {
  spec: StepSpec;
  mode: PuzzleMode;
  /** Echo puzzles ask for the first note, then the second. Produce puzzles have only 'second'. */
  part: 'first' | 'second';
  refMidi: number;
  targetMidi: number;
  /** Short label for the ladder and the results, e.g. "Perfect fifth". */
  label: string;
}

export interface Question {
  spec: PuzzleSpec;
  steps: Step[];
}

export type Rng = () => number;

/** Misses per degree, e.g. { 'degree-7': 2 }. Degrees missed before come up more often. */
export type DegreeWeights = Record<string, number>;

export function makeQuestion(spec: PuzzleSpec, rng: Rng = Math.random, weights: DegreeWeights = {}): Question {
  const [lo, hi] = spec.refRange;
  const pick = () => lo + Math.floor(rng() * (hi - lo + 1));
  const sharedRef = pick();
  const mode: PuzzleMode = spec.mode ?? 'produce';
  let specs: StepSpec[] = spec.steps;
  if (spec.randomDegrees) {
    specs = [];
    let last = 0;
    for (let i = 0; i < spec.randomDegrees; i++) {
      const pool = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== last);
      const w = pool.map((d) => 1 + (weights[`degree-${d}`] ?? 0));
      const total = w.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let chosen = pool[pool.length - 1];
      for (let j = 0; j < pool.length; j++) {
        r -= w[j];
        if (r < 0) {
          chosen = pool[j];
          break;
        }
      }
      specs.push({ kind: 'degree', degree: chosen });
      last = chosen;
    }
  } else if (spec.melodies) {
    const melody = spec.melodies[Math.floor(rng() * spec.melodies.length)];
    specs = melody.map((degree) => ({ kind: 'degree', degree }));
  } else if (spec.randomIntervals) {
    specs = [];
    let last: string | null = null;
    for (let i = 0; i < spec.randomIntervals.count; i++) {
      const pool = spec.randomIntervals.pool.filter((id) => id !== last);
      const intervalId = pool[Math.floor(rng() * pool.length)];
      specs.push({ kind: 'interval', intervalId });
      last = intervalId;
    }
  } else if (spec.randomChords) {
    specs = [];
    let last: ChordQuality | null = null;
    for (let i = 0; i < spec.randomChords; i++) {
      const pool = CHORD_QUALITIES.filter((q) => q !== last);
      const quality = pool[Math.floor(rng() * pool.length)];
      specs.push({ kind: 'chordName', quality });
      last = quality;
    }
  }
  const steps: Step[] = [];
  for (const s of specs) {
    const refMidi = spec.sharedRef ? sharedRef : pick();
    const base = { spec: s, mode, refMidi, part: 'second' as const };
    let step: Step;
    switch (s.kind) {
      case 'interval': {
        const iv = intervalById(s.intervalId);
        step = { ...base, targetMidi: refMidi + iv.semitones, label: iv.name };
        break;
      }
      case 'degree':
        step = { ...base, targetMidi: refMidi + MAJOR_SCALE[s.degree - 1], label: DEGREE_NAMES[s.degree - 1] };
        break;
      case 'chordTone': {
        const tones = CHORD_TONES[s.quality];
        const offset = s.tone === 3 ? tones[1] : s.tone === 5 ? tones[2] : tones[3];
        step = { ...base, targetMidi: refMidi + offset, label: `the ${s.tone === 3 ? 'third' : s.tone === 5 ? 'fifth' : 'seventh'} of a ${CHORD_NAMES[s.quality].toLowerCase()}` };
        break;
      }
      case 'chordName':
        step = { ...base, targetMidi: refMidi, label: CHORD_NAMES[s.quality] };
        break;
      case 'resolve':
        step = { ...base, targetMidi: refMidi, label: 'the one, home' };
        break;
    }
    // An echo of two different notes asks for both of them, in order.
    if (mode === 'echo' && step.targetMidi !== refMidi) steps.push({ ...step, part: 'first', targetMidi: refMidi, label: 'the first note' });
    steps.push(step);
  }
  return { spec, steps };
}

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
export const DEGREE_NAMES = ['degree 1, do', 'degree 2, re', 'degree 3, mi', 'degree 4, fa', 'degree 5, sol', 'degree 6, la', 'degree 7, ti', 'degree 8, do again'];

export const CHORD_TONES: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
};

export const CHORD_QUALITIES: ChordQuality[] = ['maj7', 'min7', 'dom7', 'm7b5'];

/** The chord a step is about, as semitone offsets from its reference, or null for a plain note. */
export function chordOf(step: Step): number[] | null {
  const s = step.spec;
  if (s.kind === 'chordTone' || s.kind === 'chordName') return CHORD_TONES[s.quality];
  return null;
}

/** Short names for the signs on the band stand. */
export const CHORD_SHORT: Record<ChordQuality, string> = {
  maj7: 'Major 7',
  min7: 'Minor 7',
  dom7: 'Dominant 7',
  m7b5: 'Half-dim',
};

export const CHORD_NAMES: Record<ChordQuality, string> = {
  maj7: 'Major seventh',
  min7: 'Minor seventh',
  dom7: 'Dominant seventh',
  m7b5: 'Half-diminished',
};

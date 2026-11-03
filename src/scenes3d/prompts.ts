import { AudioEngine } from '../audio/engine';
import { playCadence, playChord, playNote, playSequence } from '../audio/synth';
import type { PuzzleRunner } from '../world/puzzleRunner';
import { CHORD_NAMES, CHORD_TONES, type Step } from '../world/puzzles';

/** The sound of each kind of prompt, carried over from the 2D game. Resolves when the player may answer. */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function waitUntil(end: number): Promise<void> {
  const engine = AudioEngine.get();
  const waitMs = Math.max(0, (end - engine.now) * 1000) + 120;
  return sleep(waitMs).then(() => engine.setDuck(0.12));
}

export function playPrompt(r: PuzzleRunner, step: Step, slow: boolean, setStatus: (s: string) => void): Promise<void> {
  if (step.spec.kind === 'degree') return playDegreePrompt(r, step, slow, setStatus);
  if (step.spec.kind === 'chordTone' || step.spec.kind === 'chordName') return playChordPrompt(step, slow, setStatus);
  if (step.spec.kind === 'resolve') return playResolvePrompt(step, slow, setStatus);
  const engine = AudioEngine.get();
  engine.setDuck(1);
  // Produce mode plays only the reference. After a miss the prompt becomes an echo, slower,
  // so the player hears the answer before the ladder shows it.
  const echo = step.mode === 'echo' || slow;
  const pairJustPlayed = r.stepIndex > 0 && r.question.steps[r.stepIndex - 1].part === 'first';
  if (step.mode === 'echo' && step.part === 'second' && pairJustPlayed && !slow) {
    engine.setDuck(0.12);
    return Promise.resolve();
  }
  setStatus(slow ? 'Once more, with the answer, slower…' : echo ? 'Listen to both notes…' : 'Listen to the note…');
  const k = slow ? 1.5 : 1;
  const t0 = engine.now + 0.08;
  let end = playNote(step.refMidi, { at: t0, duration: 0.7 * k, gain: 0.55 });
  if (echo) {
    const second = step.mode === 'echo' && step.part === 'first' ? r.question.steps[r.stepIndex + 1].targetMidi : step.targetMidi;
    end = playNote(second, { at: t0 + 0.95 * k, duration: 0.7 * k, gain: 0.55 });
  }
  return waitUntil(end);
}

/** The chord as a block. After a miss, its notes one by one, slower, and the asked note last. */
function playChordPrompt(step: Step, slow: boolean, setStatus: (s: string) => void): Promise<void> {
  const engine = AudioEngine.get();
  engine.setDuck(1);
  const spec = step.spec;
  if (spec.kind !== 'chordTone' && spec.kind !== 'chordName') return Promise.resolve();
  const notes = CHORD_TONES[spec.quality].map((o) => step.refMidi + o);
  const named = spec.kind === 'chordTone';
  setStatus(slow ? 'Once more, note by note…' : named ? `Listen: ${CHORD_NAMES[spec.quality].toLowerCase()}…` : 'Listen to the chord…');
  const k = slow ? 1.4 : 1;
  const t0 = engine.now + 0.08;
  playNote(step.refMidi - 12, { timbre: 'bass', at: t0, duration: 1.3 * k, gain: 0.35 });
  let end = playChord(notes, { timbre: 'pad', at: t0, duration: 1.3 * k, gain: 0.8 });
  if (slow) {
    end = playSequence(notes, { timbre: 'pipe', at: end + 0.2, duration: 0.5 * k, gap: 0.55 * k, gain: 0.45 });
    if (named) end = playNote(step.targetMidi, { at: end + 0.3, duration: 0.8 * k, gain: 0.55 });
  }
  return waitUntil(end);
}

/** ii then V, and the room waits. After a miss, the I is played too. */
function playResolvePrompt(step: Step, slow: boolean, setStatus: (s: string) => void): Promise<void> {
  const engine = AudioEngine.get();
  engine.setDuck(1);
  setStatus(slow ? 'Once more, with the answer…' : 'Listen: two, five…');
  const k = slow ? 1.3 : 1;
  const t0 = engine.now + 0.08;
  const tonic = step.refMidi;
  const ii = CHORD_TONES.min7.map((o) => tonic + 2 + o);
  const v = CHORD_TONES.dom7.map((o) => tonic + 7 - 12 + o);
  const beat = 0.9 * k;
  playNote(tonic + 2 - 12, { timbre: 'bass', at: t0, duration: beat, gain: 0.35 });
  playChord(ii, { timbre: 'pad', at: t0, duration: beat, gain: 0.8 });
  playNote(tonic + 7 - 12, { timbre: 'bass', at: t0 + beat, duration: beat, gain: 0.35 });
  let end = playChord(v, { timbre: 'pad', at: t0 + beat, duration: beat, gain: 0.8 });
  if (slow) end = playNote(tonic, { at: end + 0.2, duration: 0.9 * k, gain: 0.55 });
  return waitUntil(end);
}

/** Cadence first, so the key is in the ear. Echo adds the note; melody adds the whole tune. */
function playDegreePrompt(r: PuzzleRunner, step: Step, slow: boolean, setStatus: (s: string) => void): Promise<void> {
  const engine = AudioEngine.get();
  engine.setDuck(1);
  const k = slow ? 1.4 : 1;
  const tonic = step.refMidi;
  let end = engine.now;
  if (step.mode === 'melody' && r.stepIndex > 0 && !slow) {
    // Mid-tune: the next note is sung without a new prompt.
    engine.setDuck(0.12);
    return Promise.resolve();
  }
  if (step.mode === 'melody' && slow) {
    const n = r.stepIndex + 1;
    setStatus(`Up to note ${n}, slower…`);
    const notes = r.question.steps.slice(0, n).map((st) => st.targetMidi);
    end = playSequence(notes, { at: engine.now + 0.08, duration: 0.55 * k, gap: 0.65 * k, gain: 0.55 });
  } else {
    setStatus(slow ? 'Once more, slower…' : 'Listen to the key…');
    end = playCadence(tonic, { at: engine.now + 0.08, speed: k });
    if (step.mode === 'echo' || slow) {
      end = playNote(step.targetMidi, { at: end + 0.25 * k, duration: 0.8 * k, gain: 0.55 });
    } else if (step.mode === 'melody') {
      const notes = r.question.steps.map((st) => st.targetMidi);
      end = playSequence(notes, { at: end + 0.25 * k, duration: 0.55 * k, gap: 0.65 * k, gain: 0.55 });
    }
  }
  return waitUntil(end);
}

/** The status line once the player may answer. */
export function listeningStatus(r: PuzzleRunner): string {
  const step = r.step;
  if (step.spec.kind === 'chordName') return `Chord ${r.stepIndex + 1} of ${r.stepCount}. Which is it?`;
  if (step.spec.kind === 'chordTone') return `Your turn: ${step.label.toLowerCase()}. Sing it, or find it on the keys, then Enter.`;
  if (step.spec.kind === 'resolve') return 'Your turn: the one. Sing it, or find it on the keys, then Enter.';
  if (step.spec.kind === 'degree') {
    if (step.mode === 'melody') return `Your turn: note ${r.stepIndex + 1} of ${r.stepCount}. Sing it, or keys then Enter.`;
    if (step.mode === 'echo' || r.misses > 0) return 'Your turn: give the note back. Sing it, or keys then Enter.';
    return `Your turn: ${step.label}. Sing it, or find it on the keys, then Enter.`;
  }
  if (step.mode === 'echo') {
    if (r.stepCount === 1) return 'Your turn: give the note back. Sing it, or keys then Enter.';
    return step.part === 'first' ? 'Your turn: give back the first note. Sing it, or keys then Enter.' : 'Your turn: now the second note. Sing it, or keys then Enter.';
  }
  if (r.misses > 0) return 'Your turn: give back the second note. Sing it, or keys then Enter.';
  return `Your turn: ${step.label.toLowerCase()} above it. Sing it, or find it on the keys, then Enter.`;
}

/** The song's harmony, one triad per bar of four notes, as offsets from the tonic. */
const SONG_BARS = [
  [0, 4, 7], // I
  [5, 9, 12], // IV
  [7, 11, 14], // V
  [0, 4, 7], // I
];

/** One note of the finale: the band layers come in bar by bar as the areas did. */
export function playSongLayers(index: number, step: Step, at?: number): void {
  const t0 = at ?? AudioEngine.get().now + 0.03;
  const tonic = step.refMidi;
  const bar = Math.min(3, Math.floor(index / 4));
  const chord = SONG_BARS[bar];
  playNote(step.targetMidi, { timbre: 'pad', at: t0, duration: 0.6, gain: 0.5 });
  if (index % 4 === 0 || at === undefined) playNote(tonic - 24 + chord[0], { timbre: 'bass', at: t0, duration: 0.9, gain: 0.35 }); // Valley
  if (bar >= 1 && (index % 4 === 0 || at === undefined)) playChord(chord.map((o) => tonic - 12 + o), { timbre: 'pad', at: t0, duration: 1.2, gain: 0.55 }); // Town
  if (bar >= 2) playNote(step.targetMidi + 12, { timbre: 'horn', at: t0, duration: 0.45, gain: 0.22 }); // Quarter
}

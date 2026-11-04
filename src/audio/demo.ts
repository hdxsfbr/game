import type { Demo } from '../world/lessons';
import { AudioEngine } from './engine';
import { playCadence, playChord, playNote } from './synth';

/** A note or chord of a demo as it sounds, so a view can light its keys. */
export type Light = (midis: number[], at: number, until: number) => void;

/**
 * Play a lesson demo from C4 (or `base`): the cadence first if asked, then the tune, the chord, or the
 * chords in a row. Returns when the last sound ends, on the audio clock. `light` is told each sound's
 * notes and span, on the same clock.
 */
export function playDemo(d: Demo, base = 60, light?: Light): number {
  const engine = AudioEngine.get();
  let t = engine.now + 0.06;
  if (d.cadence) t = playCadence(base, { at: t, speed: 1 }) + 0.3;
  if (d.notes) {
    const beat = d.gap ?? 0.42;
    d.notes.forEach((o, i) => {
      const len = (d.beats?.[i] ?? 1) * beat;
      playNote(base + o, { timbre: d.timbre ?? 'pipe', at: t, duration: Math.min(1.4, len * 0.9), gain: 0.5 });
      light?.([base + o], t, t + len * 0.9);
      t += len;
    });
  }
  if (d.chord) {
    const end = playChord(d.chord.map((o) => base + o), { timbre: d.timbre ?? 'chord', at: t, duration: 1.4, gain: 0.8 });
    light?.(d.chord.map((o) => base + o), t, end);
    t = end;
  }
  if (d.chords) {
    // Each chord stops, and a short rest passes, before the next one starts.
    const gap = d.gap ?? 1.1;
    for (const c of d.chords) {
      playNote(base - 24 + c[0], { timbre: 'bass', at: t, duration: gap - 0.35, gain: 0.22 });
      playChord(c.map((o) => base + o), { timbre: d.timbre ?? 'chord', at: t, duration: gap - 0.35, gain: 0.8 });
      light?.(c.map((o) => base + o), t, t + gap - 0.35);
      t += gap;
    }
  }
  return t;
}

import { describe, expect, it } from 'vitest';
import { StableNoteDetector, midiToHz } from '../src/ear/pitchMath';

function sing(det: StableNoteDetector, hz: number | null, fromMs: number, toMs: number, step = 16) {
  let fired = null;
  for (let t = fromMs; t <= toMs; t += step) {
    const r = det.feed(hz, t);
    if (r) fired = r;
  }
  return fired;
}

describe('StableNoteDetector', () => {
  it('fires once after holding a note for 700 ms', () => {
    const det = new StableNoteDetector();
    expect(sing(det, midiToHz(67), 0, 600)).toBeNull();
    const r = sing(det, midiToHz(67), 616, 900);
    expect(r?.midi).toBe(67);
    expect(sing(det, midiToHz(67), 916, 2000)).toBeNull();
  });

  it('reports the mean offset in cents', () => {
    const det = new StableNoteDetector();
    const r = sing(det, midiToHz(67) * Math.pow(2, 20 / 1200), 0, 800);
    expect(r?.offsetCents).toBeCloseTo(20, 1);
  });

  it('fires again when the singer moves to a new note', () => {
    const det = new StableNoteDetector();
    expect(sing(det, midiToHz(67), 0, 800)?.midi).toBe(67);
    expect(sing(det, midiToHz(69), 816, 1600)?.midi).toBe(69);
  });

  it('restarts the hold after a long silence', () => {
    const det = new StableNoteDetector();
    sing(det, midiToHz(67), 0, 400);
    sing(det, null, 416, 800);
    expect(sing(det, midiToHz(67), 816, 1300)).toBeNull();
    expect(sing(det, midiToHz(67), 1316, 1600)?.midi).toBe(67);
  });

  it('exposes a candidate with progress', () => {
    const det = new StableNoteDetector();
    sing(det, midiToHz(60), 0, 350);
    const c = det.candidate;
    expect(c?.midi).toBe(60);
    expect(c?.progress).toBeGreaterThan(0.4);
    expect(c?.progress).toBeLessThan(0.6);
  });
});

import { describe, expect, it } from 'vitest';
import {
  HoldDetector,
  centsBetween,
  checkInterval,
  checkPitch,
  foldCents,
  hzToMidi,
  median,
  midiToHz,
  noteName,
} from '../src/ear/pitchMath';

describe('conversions', () => {
  it('A4 is 440 Hz and MIDI 69', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(hzToMidi(440)).toBeCloseTo(69, 6);
  });
  it('an octave doubles frequency', () => {
    expect(midiToHz(81)).toBeCloseTo(880, 6);
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 6);
  });
  it('names notes', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(59)).toBe('B3');
  });
});

describe('foldCents', () => {
  it('leaves small values alone', () => {
    expect(foldCents(30)).toBe(30);
    expect(foldCents(-30)).toBe(-30);
  });
  it('folds octaves away', () => {
    expect(foldCents(1200)).toBe(0);
    expect(foldCents(-1200)).toBe(0);
    expect(foldCents(1230)).toBeCloseTo(30);
    expect(foldCents(-1230)).toBeCloseTo(-30);
  });
  it('maps 600 to -600 so the range is half-open', () => {
    expect(foldCents(600)).toBe(-600);
    expect(foldCents(-600)).toBe(-600);
  });
});

describe('checkPitch', () => {
  it('accepts an exact hit', () => {
    const r = checkPitch(440, 69);
    expect(r.ok).toBe(true);
    expect(r.errorCents).toBeCloseTo(0);
  });
  it('accepts within 50 cents flat and 60 cents sharp by default', () => {
    expect(checkPitch(440 * Math.pow(2, -49 / 1200), 69).ok).toBe(true);
    expect(checkPitch(440 * Math.pow(2, -51 / 1200), 69).ok).toBe(false);
    expect(checkPitch(440 * Math.pow(2, 59 / 1200), 69).ok).toBe(true);
    expect(checkPitch(440 * Math.pow(2, 61 / 1200), 69).ok).toBe(false);
  });
  it('is octave-agnostic by default and not when disabled', () => {
    expect(checkPitch(220, 69).ok).toBe(true);
    expect(checkPitch(220, 69, { toleranceCents: 50, sharpBonusCents: 10, octaveAgnostic: false }).ok).toBe(false);
  });
  it('rejects a wrong note', () => {
    expect(checkPitch(midiToHz(71), 69).ok).toBe(false);
  });
});

describe('checkInterval', () => {
  it('a fifth above C4 is G4', () => {
    expect(checkInterval(midiToHz(67), 60, 7).ok).toBe(true);
    expect(checkInterval(midiToHz(66), 60, 7).ok).toBe(false);
  });
  it('a fifth sung an octave down still passes', () => {
    expect(checkInterval(midiToHz(55), 60, 7).ok).toBe(true);
  });
});

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('HoldDetector', () => {
  const target = 69;
  const good = 440;
  const bad = midiToHz(71);

  function run(frames: Array<[number | null, number]>, det = new HoldDetector(target)) {
    let done = false;
    for (const [hz, t] of frames) done = det.feed(hz, t);
    return { done, det };
  }

  it('completes after 800 ms of correct frames at 60 fps', () => {
    const frames: Array<[number, number]> = [];
    for (let i = 0; i <= 60; i++) frames.push([good, i * (1000 / 60)]);
    const { done, det } = run(frames);
    expect(done).toBe(true);
    expect(det.progress).toBe(1);
  });

  it('does not complete on 700 ms', () => {
    const frames: Array<[number, number]> = [];
    for (let i = 0; i <= 42; i++) frames.push([good, i * (1000 / 60)]);
    expect(run(frames).done).toBe(false);
  });

  it('tolerates a short dropout but resets on a long one', () => {
    const det = new HoldDetector(target);
    let t = 0;
    for (let i = 0; i < 30; i++, t += 16) det.feed(good, t); // ~480 ms
    const before = det.progress;
    t += 100;
    det.feed(null, t); // 100 ms gap, under the 200 ms limit
    det.feed(good, t + 16);
    expect(det.progress).toBeGreaterThanOrEqual(before);
    t += 400;
    det.feed(null, t); // 400 ms gap, over the limit
    expect(det.progress).toBe(0);
  });

  it('resets on a sustained wrong note', () => {
    const det = new HoldDetector(target);
    let t = 0;
    for (let i = 0; i < 30; i++, t += 16) det.feed(good, t);
    for (let i = 0; i < 20; i++, t += 16) det.feed(bad, t);
    expect(det.progress).toBe(0);
  });

  it('reports last error in cents', () => {
    const det = new HoldDetector(target);
    det.feed(440 * Math.pow(2, 20 / 1200), 0);
    expect(det.lastErrorCents).toBeCloseTo(20, 3);
    det.feed(null, 16);
    expect(det.lastErrorCents).toBeNull();
  });
});

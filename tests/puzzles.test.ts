import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/world/areas';
import { makeQuestion, type PuzzleSpec } from '../src/world/puzzles';

/** Small deterministic generator for tests. */
function lcg(seed: number): () => number {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

const doors = (areaId: string) => AREAS[areaId].entities.filter((e) => e.kind === 'door') as Array<{ puzzle: Parameters<typeof makeQuestion>[0] }>;

describe('makeQuestion', () => {
  it('defaults to produce mode and respects echo', () => {
    const hub = makeQuestion(doors('hub')[0].puzzle, () => 0);
    expect(hub.steps[0].mode).toBe('echo');
    const fifth = makeQuestion(doors('valley').find((d) => d.puzzle.id === 'valley-fifth')!.puzzle, () => 0);
    expect(fifth.steps[0].mode).toBe('produce');
    expect(fifth.steps[0].targetMidi - fifth.steps[0].refMidi).toBe(7);
  });

  it('anchors early valley doors to C4 and moves the serpent root', () => {
    for (const d of doors('valley')) {
      const q = makeQuestion(d.puzzle, () => 0.999);
      if (d.puzzle.id === 'valley-serpent') expect(q.steps[0].refMidi).not.toBe(60);
      else expect(q.steps[0].refMidi).toBe(60);
    }
  });

  it('shares one root across the serpent steps', () => {
    const q = makeQuestion(doors('valley').find((d) => d.puzzle.id === 'valley-serpent')!.puzzle);
    const refs = new Set(q.steps.map((s) => s.refMidi));
    expect(refs.size).toBe(1);
    expect(q.steps.map((s) => s.targetMidi - s.refMidi)).toEqual([7, 4, 12]);
  });
});

describe('chord puzzles', () => {
  it('randomChords picks that many qualities with no repeats in a row', () => {
    const spec: PuzzleSpec = { id: 'x', title: '', intro: '', instruction: '', steps: [], randomChords: 6, refRange: [55, 62] };
    for (let seed = 0; seed < 20; seed++) {
      const rng = lcg(seed);
      const q = makeQuestion(spec, rng);
      expect(q.steps).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        const s = q.steps[i].spec;
        expect(s.kind).toBe('chordName');
        expect(q.steps[i].targetMidi).toBe(q.steps[i].refMidi);
        if (i > 0 && s.kind === 'chordName') expect(s).not.toEqual(q.steps[i - 1].spec);
      }
    }
  });

  it('chordTone targets the named tone of the chord', () => {
    const spec: PuzzleSpec = {
      id: 'x', title: '', intro: '', instruction: '',
      steps: [{ kind: 'chordTone', quality: 'm7b5', tone: 5 }, { kind: 'chordTone', quality: 'maj7', tone: 7 }],
      refRange: [60, 60], sharedRef: true,
    };
    const q = makeQuestion(spec, () => 0);
    expect(q.steps.map((s) => s.targetMidi)).toEqual([66, 71]);
  });

  it('resolve targets the reference itself', () => {
    const q = makeQuestion({ id: 'x', title: '', intro: '', instruction: '', steps: [{ kind: 'resolve' }], refRange: [57, 57] }, () => 0);
    expect(q.steps[0].targetMidi).toBe(57);
  });
});

describe('practice drills', () => {
  it('draws random intervals from the pool, none twice in a row', () => {
    for (let seed = 1; seed < 30; seed++) {
      const q = makeQuestion({ id: 'd', title: 'd', intro: '', instruction: '', steps: [], randomIntervals: { pool: ['P8', 'P5', 'P4'], count: 6 }, refRange: [57, 62] }, lcg(seed));
      expect(q.steps.length).toBe(6);
      for (let i = 1; i < q.steps.length; i++) {
        const a = q.steps[i - 1].spec;
        const b = q.steps[i].spec;
        expect(a.kind === 'interval' && b.kind === 'interval' && a.intervalId === b.intervalId).toBe(false);
      }
      for (const s of q.steps) expect(['Octave', 'Perfect fifth', 'Perfect fourth']).toContain(s.label);
    }
  });
});

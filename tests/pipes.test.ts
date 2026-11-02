import { describe, expect, it } from 'vitest';
import { PIANO_HIGH, PIANO_LOW, codeForMidi, keyLabelForMidi, pipeForCode } from '../src/ear/pipes';

describe('pipes', () => {
  it('maps musical typing to a fixed piano from C4', () => {
    expect(pipeForCode('KeyA')).toBe(60);
    expect(pipeForCode('KeyW')).toBe(61);
    expect(pipeForCode('KeyK')).toBe(72);
    expect(pipeForCode('Semicolon')).toBe(76);
  });
  it('covers the whole piano and nothing beyond it', () => {
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) expect(pipeForCode(codeForMidi(m)!)).toBe(m);
    expect(codeForMidi(PIANO_HIGH + 1)).toBeNull();
    expect(codeForMidi(PIANO_LOW - 1)).toBeNull();
    expect(keyLabelForMidi(67)).toBe('G');
  });
  it('ignores non-pipe keys', () => {
    expect(pipeForCode('Space')).toBeNull();
    expect(pipeForCode('Enter')).toBeNull();
  });
});

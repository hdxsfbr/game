/**
 * Cues from the sound to the band in the world. Whatever plays a bass note, a drum hit or a horn line
 * (the chord prompts, the quarter's vamp, a lick after a right answer) says so here, with the Web Audio
 * time it sounds at, and the world makes the matching player move at that moment. One listener: the
 * current World. Nothing here knows about meshes or scenes.
 */
export type BandPart = 'bass' | 'drums' | 'horn';

export interface BandCue {
  part: BandPart;
  /** AudioContext seconds at which the note sounds. */
  at: number;
  /** Seconds the note lasts. */
  dur: number;
  /** A downbeat, a held note, the answer: a bigger movement. */
  strong: boolean;
}

let listener: ((cue: BandCue) => void) | null = null;

export function setBandListener(l: ((cue: BandCue) => void) | null): void {
  listener = l;
}

export function bandCue(part: BandPart, at: number, dur: number, strong = false): void {
  listener?.({ part, at, dur, strong });
}

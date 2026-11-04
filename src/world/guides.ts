import type { Demo } from './lessons';
import narration from './narration.json';

/**
 * The guided walkthrough at each bench, for someone who has never been told what a note is: a
 * narrated step at a time (Andre's voice, public/narration, made by scripts/narrate.py from
 * narration.json), each followed by the thing it talks about, sounded and lit on the keys. The
 * text pages of the lesson stay as the reference afterwards.
 */
export interface GuideStep {
  /** The narration, also shown as the caption. */
  say: string;
  /** What sounds, and lights up, once the narration ends. */
  demo?: Demo;
}

const LINES = narration as Record<string, string[]>;

/** The demos per bench, by line; a line with none just speaks. */
const DEMOS: Record<string, Record<number, Demo>> = {
  hub: {
    1: { notes: [0], gap: 0.9 },
    2: { notes: [0, 7, 0], gap: 0.7 },
  },
  valley: {
    1: { notes: [0, 12], gap: 0.75 },
    2: { notes: [0, 7], gap: 0.75 },
    3: { notes: [0, 5], gap: 0.75 },
    4: { notes: [0, 4, 0, 3], beats: [1, 1.8, 1, 1.8], gap: 0.6 },
    5: { notes: [0, 7], gap: 0.75 },
  },
  town: {
    1: { cadence: true },
    2: { notes: [0, 2, 4, 5, 7, 9, 11, 12], beats: [1, 1, 1, 1, 1, 1, 1, 1.8], gap: 0.45 },
    3: { notes: [11, 12, 5, 4], beats: [1, 2, 1, 2], gap: 0.55 },
    4: { cadence: true, notes: [0, 2, 4], beats: [1, 1, 2.2], gap: 0.5 },
  },
  jazz: {
    1: { chord: [0, 4, 7, 11] },
    2: { chord: [0, 3, 7, 10] },
    3: { chord: [0, 4, 7, 10] },
    4: { chord: [0, 3, 6, 10] },
    5: { chords: [[0, 4, 7], [0, 3, 7]], gap: 1.2 },
    6: { chords: [[0, 4, 7, 11], [0, 4, 7, 10]], gap: 1.3 },
  },
  stage: {
    1: { notes: [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 7, 9, 7, 2, 0], beats: [1, 1, 1, 1, 1, 1, 1, 1, 1.6, 1, 1, 1, 1, 1, 2], gap: 0.42 },
  },
};

export const GUIDES: Record<string, GuideStep[]> = Object.fromEntries(Object.entries(LINES).map(([bench, lines]) => [bench, lines.map((say, i) => ({ say, demo: DEMOS[bench]?.[i] }))]));

export type InputMode = 'sing' | 'play';

export interface Progress {
  inputMode: InputMode;
  solved: string[];
  /** Misses per puzzle id, used for the hint ladder and the results screen. */
  misses: Record<string, number>;
  fragments: number;
  /** Current area id and tile position, so a reload returns the player to where they were. */
  area: string;
  x: number;
  y: number;
  /** Wrong answers per area id, for the results screen. */
  areaMisses: Record<string, number>;
  /** Wall-clock ms when the journey began and when the song was performed. */
  startedAt?: number;
  finishedAt?: number;
  /** True once the Silent Stage song has been performed. */
  finished: boolean;
  /** Notes of voice left, 0..VOICE_MAX. A miss at a door costs one; opening a door refills it. */
  voice: number;
  /** Times the voice ran out. */
  quiets: number;
  /** Areas whose story card has been shown. */
  cardsSeen: string[];
  /** Practice benches whose drill has been completed at least once. */
  drilled: string[];
  /** Benches whose guided walkthrough has been shown. */
  guidesSeen: string[];
  /** Stars per opened door, 0..3: three for first-try answers, fewer for each miss before the answer. */
  scores: Record<string, number>;
}

export const VOICE_MAX = 5;
/** Voice after going quiet. */
export const VOICE_AFTER_QUIET = 2;
/** The most a practice drill can restore to. Doors give the rest. */
export const VOICE_DRILL_CAP = 3;

const KEY = 'listening-kingdom.progress.v1';

export function defaultProgress(): Progress {
  return { inputMode: 'play', solved: [], misses: {}, fragments: 0, area: 'hub', x: 0, y: 0, areaMisses: {}, finished: false, voice: VOICE_MAX, quiets: 0, cardsSeen: [], drilled: [], guidesSeen: [], scores: {} };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    return { ...defaultProgress(), ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: play continues without saving */
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Single shared progress object for the session. */
export const progress: Progress = loadProgress();

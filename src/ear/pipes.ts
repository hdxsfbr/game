/**
 * The pipes: a fixed piano from C4 to E5, the same for every door, so an interval has to be found
 * by ear rather than counted from the root. The keys follow musical typing: A S D F G H J K are the
 * white keys from C4, W E T Y U the black keys between them, O L P ; carry on past the top C.
 */

export const PIANO_LOW = 60; // C4
export const PIANO_HIGH = 76; // E5

const CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];

/** Label printed on each key, lowest to highest. */
export const KEY_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';'];

/** Resolve a keyboard event code to a MIDI note, or null if the key is not a pipe. */
export function pipeForCode(code: string): number | null {
  const i = CODES.indexOf(code);
  return i < 0 ? null : PIANO_LOW + i;
}

/** Which key plays `midi`, or null if it is off the piano. Used by hints and tests. */
export function codeForMidi(midi: number): string | null {
  const i = midi - PIANO_LOW;
  return i >= 0 && i < CODES.length ? CODES[i] : null;
}

export function keyLabelForMidi(midi: number): string {
  return KEY_LABELS[midi - PIANO_LOW] ?? '';
}

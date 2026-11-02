# The Listening Kingdom

A browser exploration game that teaches you to hear music. You play a musician who has lost their
voice in a kingdom gone silent and grey. Every door responds only to the right note. Win your voice
back one interval at a time, and by the end you can hear intervals, scale degrees in a key, and the
four jazz chord qualities.

Built for Game Week (brief in `docs/Game_Week_Assignment.pdf`). Design in `docs/design.md`, idea
exploration in `docs/ideas.md`.

## Run

```bash
npm install
npm run dev
```

The dev server runs over HTTPS with a self-signed certificate (accept the browser warning once).
Browsers only expose the microphone on HTTPS or `localhost`, so this matters when you open the game
from another machine. The mic starts on a click. Headphones are recommended so the game's own
tones do not feed back into the mic.

## Scripts

- `npm run dev`: Vite dev server.
- `npm run build`: type-check and production build into `dist/`.
- `npm test`: unit tests for the pitch math, hold detector, and pipes input.
- `scripts/smoke.sh [url] [out.png]`: render the page in headless Chrome, save a screenshot, print console errors.

## Layout

- `src/ear/`: pitch math (pure, tested), microphone pitch detector (pitchy, McLeod method), pipes keyboard input.
- `src/audio/`: Web Audio engine, ducking, and the synth (all audio is generated at runtime).
- `src/scenes/`: Phaser scenes. `TunerScene` is the development tuner used to verify the detector on real voices.
- `src/world/`: areas, entities, and puzzles (in progress).
- `scripts/`: repeatable build and test helpers.

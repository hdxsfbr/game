# The Listening Kingdom

A browser exploration game that teaches you to hear music. You play a small wandering singer in a
kingdom gone silent and grey. Every door answers only to the right note. Win your voice back one
interval at a time: by the end you can hear intervals, scale degrees in a key, and the four jazz
chord qualities, and you sing the kingdom's song back on the Silent Stage.

Play it: https://game-production-34da.up.railway.app

Built for Game Week (brief in `docs/Game_Week_Assignment.pdf`). Design in `docs/design.md`, art and
asset plan in `docs/art-plan.md`, asset provenance in `docs/assets.md`.

## How to play

- Walk with the arrow keys or WASD. Press Space at a door to listen, M for the map.
- Answer by **singing** (microphone, headphones recommended) or by **playing**: the piano under
  every door runs from C4 to E5 and never moves. A S D F G H J K are the white keys from C, W E T
  Y U the black keys, O L P ; carry on past the top C. Press a key to hear it, Enter to answer.
- **Voice** is your resource: a wrong answer at a door costs one of five notes, opening a door
  refills them. Run out and you wake at the area's practice bench, where a short lesson and a free
  drill give voice back.
- Areas: Hearthstone (hub), the Valley of Intervals, Tonic Town (scale degrees), the Jazz Quarter
  (chord qualities), and the Silent Stage finale. About 10 to 15 minutes.

## Run

```bash
npm install
npm run dev
```

The dev server runs over HTTPS with a self-signed certificate (accept the browser warning once).
Browsers only expose the microphone on HTTPS or `localhost`, so this matters when you open the game
from another machine. The mic starts on a click.

## Scripts

- `npm run dev`: Vite dev server. `npm run build`: type-check and production build into `dist/`.
- `npm test`: unit tests for pitch math, puzzles, areas, and the piano keys.
- `node scripts/playthrough.mjs [url] [outDir]`: drives the whole game in headless Chrome through
  every door, going quiet and practising on the way, and fails on console errors or silent prompts.
- `node scripts/smoke.mjs <url>`: boot, Play and the first door on a deployed build.
- `scripts/pixellab_player.py`: the player sprite from PixelLab (token in `~/.config/agentforge/pixellab`).
- `scripts/gen_cards.py`: title backdrop and story cards with local Stable Diffusion XL.
- `node scripts/dump_textures.mjs`: dumps the code-drawn textures for review.

## Deploy

Railway serves `dist` as a static site. From the linked repo root:

```bash
railway up --service game --detach
```

## Layout

- `src/ear/`: pitch math (pure, tested), microphone pitch detector (pitchy, McLeod method), piano keys.
- `src/audio/`: Web Audio engine, ducking, synth, the sequenced area music, and sound effects. All audio is generated at runtime.
- `src/world/`: areas and maps, puzzle model and runner, lessons, palettes, code-drawn textures.
- `src/ui/`: puzzle panel with piano and ladder, map overlay, lesson overlay, story cards.
- `src/scenes/`: title, world, results. `TunerScene` is a development tuner.
- `public/`: generated assets (player sheet, cards). `scripts/`: generators and headless checks.

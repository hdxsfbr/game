# The Listening Kingdom

A browser exploration game that teaches you to hear music. You play a small wandering singer in a
kingdom gone silent and grey. Every door answers only to the right note. Win your voice back one
interval at a time: by the end you can hear intervals, scale degrees in a key, and the four jazz
chord qualities, and you sing the kingdom's song back on the Silent Stage.

Play it: https://game-production-34da.up.railway.app (the 2D version, tag `v1-2d`).

This branch is the 3D remake: the same kingdom, puzzles, voice and music, rebuilt with
Babylon.js over a world modelled by headless Blender scripts and a rigged character from Tripo.

Built for Game Week (brief in `docs/Game_Week_Assignment.pdf`). Design in `docs/design.md`, art and
asset plan in `docs/art-plan.md`, asset provenance in `docs/assets.md`.

## How to play

- Walk with the arrow keys or WASD. Press Space at a door to listen, M for the map. The kingdom
  is grey until you open doors; colour spreads out from each one.
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
- `scripts/deploy.sh`: build, upload to the Railway `game` service, wait for the build and smoke-test the live URL (`--no-smoke` skips the last step).
- `node scripts/screenshot3d.mjs [url] [outDir] [area] [x] [y]`: boots an area and walks a few
  steps each way, writing screenshots. `node scripts/inspect3d.mjs [url] [area] --eval js --shot f.png`
  dumps the scene and runs probes against it; `--query "ao=off&x=22&y=18"` adds URL parameters,
  `--progress json` seeds saved progress (to see an area in colour), `--gpu` renders on the GPU with
  vsync off for frame-rate measurements. `node scripts/mapshots.mjs [url] [outDir] [prefix] [area ...]`
  shoots the kingdom map at desktop and phone sizes; `scripts/areashots.sh <outDir> [url]` takes
  fixed-viewpoint shots of Tonic Town and the Jazz Quarter, grey and in colour.
- `scripts/blender/build.sh [area ...]`: rebuilds the world glbs (`build_area.py`) and the
  placeholder mannequin (`build_mannequin.py`) with headless Blender; `build_sky.py` renders the
  skies. Blender 4.x is expected at `~/.local/opt/blender/blender` (or `$BLENDER`).
- `scripts/gen_cards.py`: title backdrop and story cards with local Stable Diffusion XL.
- `scripts/pixellab_player.py`: the 2D player sprite from PixelLab, kept for the 2D version.

## Deploy

Railway serves `dist` as a static site. From the linked repo root:

```bash
railway up --service game --detach
```

## Layout

- `src/ear/`: pitch math (pure, tested), microphone pitch detector (pitchy, McLeod method), piano keys.
- `src/audio/`: Web Audio engine, ducking, synth, the sequenced area music, and sound effects. All audio is generated at runtime.
- `src/world/`: areas and maps (the ASCII maps are the single source for both the collision grid
  and the Blender-built scenery), puzzle model and runner, lessons, palettes.
- `src/scenes3d/`: the Babylon.js app, the world (loading, camera, sun and shadows, doors, gates,
  bench, fragment, exits, the puzzle flow), the player and rig, the grid collision, the colour
  plugins (grey-to-colour life map, water, sky) and the sky dome. Rendering: shadow map, SSAO2
  ambient occlusion at half resolution (geometry buffer, 8 samples), then bloom and FXAA. The
  occlusion costs about a third of a frame on a CPU renderer and is lost in the noise on a discrete
  GPU; on a machine that cannot hold 40 fps over the first seconds it switches itself off for the
  session. `?ao=on` and `?ao=off` on the URL force it either way.
- `src/overlay/`: the HTML overlays: title, HUD, puzzle panel with piano and ladder, map, lessons,
  story cards, results.
- `public/world/`, `public/sky/`, `public/character/`, `public/cards/`: generated assets, see
  `docs/assets.md`. `scripts/`: generators and headless checks.

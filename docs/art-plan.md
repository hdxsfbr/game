# Art and asset plan (2026-11-02)

Written after the Game Week asset lecture (game-assets-gauntlet.vercel.app). The brief needs
generated art and audio, no pre-made packs, so of the lecture's three routes (AI generation,
made with code, asset libraries) only the first two apply.

## What the lecture says that matters for us

- Decide the art direction before generating anything. Pick one style wording and reuse it in
  every prompt. The lecture's pixel wording: "coherent crisp 16-bit pixel art throughout, with
  strong hard pixel clusters and no smooth antialiasing".
- Set camera, palette and sprite scale first. Make one representative asset, check it at game
  size on the real background, then expand the set.
- Coherence beats individual quality: shared palette, edge weight, scale and detail. Good
  pictures in mixed styles still clash.
- Creator, then a separate critic, then fixes, then an in-game check. The critic gets the
  reference, the palette, the actual frames and a game-scale capture, and reports defects with
  coordinates or frame numbers.
- Cleanup pass after generation: enlarged nearest-neighbour crops on magenta, stray pixels,
  wrong-palette cells, drifting feet and scale across frames.
- Code-drawn art is a first-class route. Two of the five lecture demos (Roofline, Aftershock)
  are entirely code-drawn pixel art with code animation.
- Keep generators as scripts in the repo and record how each asset was made.

## Art direction

Top-down 16-bit pixel art. 32 px tiles, player 24 x 32, props one or two tiles. Hard pixel
edges, no antialiasing, one-pixel dark outlines on characters and props, none on ground.

Palette: five area palettes already exist in `src/world/palette.ts` (hub grey-gold, valley
green, town terracotta, jazz violet, stage gold). Each becomes a locked ramp of six to eight
colours. The world's central mechanic, grey turning to colour as doors open, stays: the world
is drawn in greyscale and tinted at runtime, so every world texture is authored as luminance.
Characters and hero props that must carry their own colours get a greyscale copy made at boot
and are cross-faded by the same life value.

## Routes by asset family

| Family | Route | Why |
| --- | --- | --- |
| Ground, walls, water, trees, bridges, house walls and roofs | Code-drawn, upgraded | Tiling seams, the tint mechanic, cohesion across five areas, no cost. Trees get a real canopy with shading and a trunk; houses get roof, eaves, window, doorstep. |
| Doors, gates, benches, fragment, serpent, bell, well, clock, band stand | Code-drawn | Small, few, and they must match the tiles pixel for pixel. |
| Player | PixelLab if an account exists, else code-drawn | Four facings and a four-frame walk is where a generator earns its keep. Code fallback: two-frame walk, flip for left/right, drawn poses as in Roofline. |
| Title backdrop, one story card per area, results painting | Local diffusers on the RTX 4090 | Large painterly set pieces, the one place a diffusion model beats code. Pixel-art prompt wording, then nearest-neighbour downscale and palette quantisation to the area ramp so they sit with the world. No account needed. |
| Sound effects, music | Already code (Web Audio synth, sequencer) | Matches the lecture's "made with code" audio route. No change. |

## Pipeline

1. **Style sheet first.** One reference board per the lecture's prompt shape, 2 x 2: a tree, a
   house, the player, a door, in the chosen wording and palette. Approve the look at game size
   before any batch. Generated locally (`scripts/gen_art.py --board`).
2. **World tiles in code.** `src/world/textures.ts` grows into pixel grids with shading and
   per-area roof and wall variants. Screenshots from `scripts/playthrough.mjs` are the in-game
   check.
3. **Player.** PixelLab route: `create-character` with four directions, then a walk animation,
   downscaled to 24 x 32, palette-checked, atlas written to `public/`. Code route: pose table
   drawn with the Graphics API, four frames.
4. **Story cards.** `scripts/gen_art.py --cards` runs SDXL locally with the style wording and one
   subject line per area, writes 960 x 540 PNGs, downscales to 240 x 135 with nearest neighbour,
   quantises to the area palette, and upscales back. Shown on entering an area for the first
   time and on the title screen.
5. **Critic round.** A separate agent gets the magnified crops on magenta, the palette, and the
   playthrough screenshots, and reports defects with coordinates. Fix, re-check in game.
6. **Provenance.** `docs/assets.md` lists every asset, its route, script, prompt or drawing
   routine, and date. The README points at it.

## Budget

| Step | Time |
| --- | --- |
| Style board and approval | 1 h |
| Tiles, houses, props in code | 3 h |
| Player (either route) | 2 h |
| Story cards pipeline and six images | 2 h |
| Critic round and fixes | 1.5 h |

Cut order if short: story cards for the areas (keep the title backdrop), then the player walk
frames (keep facings), then house variants per area.

## Decisions needed

- PixelLab account or not. Without one the player is code-drawn, which the lecture's demos
  show is fine.
- Which local model: SDXL base (about 7 GB download) or a pixel-art tuned checkpoint. SDXL
  base plus the downscale and quantise step is the safe default.

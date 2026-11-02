# Asset provenance

Every picture and sound in The Listening Kingdom is generated: either drawn by code at boot,
produced by a generation model from a prompt recorded here, or synthesised in Web Audio. No
pre-made packs are used. Dates are when the asset in the repo was made.

## Visual

| Asset | Route | Where | Notes |
| --- | --- | --- | --- |
| Ground, walls (ridge, top, face), water (two frames), bridge, tree | Code-drawn pixel art, greyscale, tinted per area at runtime | `src/world/textures.ts` | 2026-11-02. Walls pick their piece from the map: a block of walls gets a shingled top, a ridge on its upper edge and a brick face where it meets the ground. |
| Doors (closed, open), gates (closed, open), serpent, melody fragment, practice bench, glow | Code-drawn | `src/world/textures.ts` | 2026-11-02 |
| Player: four facings and a six-frame walk per facing | PixelLab API, `create-character-with-4-directions` at 32 px (48 px cells) then `animate-character` with the `walk` template, one direction per call | `public/sprites/player/player.png` + `player.json`, generator `scripts/pixellab_player.py` | 2026-11-02. Prompt: "small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, simple boots, carrying a tiny wooden flute, 16-bit pixel art game character". Low top-down view, chibi proportions, black outline, basic shading, seed 7. Character id 8a3b6a9d-49e1-4002-b2f1-1442a5370609. |
| Title backdrop, five area story cards, results backdrop | Local Stable Diffusion XL base 1.0 on an RTX 4090, then area-average downscale to 256 x 144, palette quantisation to the area's colours, nearest-neighbour upscale | `public/cards/*.png`, prompts and seeds in `public/cards/cards.json`, generator `scripts/gen_cards.py` | 2026-11-02. Style sentence on every prompt: "coherent crisp 16-bit pixel art, strong hard pixel clusters, no smooth antialiasing, limited palette, wide landscape game illustration, no text". |
| 3D player character (rigged) | Tripo Studio web app, Pro plan: text-to-3D HD model with T-pose (55 credits), Smart Mesh retopology to 18k triangles (35), humanoid auto-rig (20), exported as GLB | `public/character/listening-kingdom-singer.glb` | 2026-11-02. Prompt: "small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, simple boots, holding a tiny wooden flute, stylized low-poly game character, rounded readable shapes, bevelled simple materials, warm restrained colors, full body, standing". 51 joints, no animation clips. Task 52e1b816-6c46-408a-90b6-487bc936feae. |
| HUD, panels, map, lessons, piano, ladder | Code-drawn with the Phaser Graphics and Text APIs | `src/ui/*.ts`, `src/scenes/*.ts` | Ongoing |

## Audio

| Asset | Route | Where |
| --- | --- | --- |
| Instruments (pipe, bell, pad, bass, horn) | Web Audio oscillators and filters | `src/audio/synth.ts` |
| Area music: one sequenced track per area, three layers gated by the area's life | Code-sequenced, synthesised live | `src/audio/music.ts` |
| Footsteps, door, gate, panel, click | Filtered noise and short tones | `src/audio/sfx.ts` |
| Lesson demos (reference-song openings) | Note lists with per-note beats, synthesised | `src/world/lessons.ts` |

## Process

Per the Game Week asset lecture: one style sentence reused everywhere, one representative asset
checked at game size before a batch, and a separate critic pass over magnified crops and in-game
captures before an asset is kept. The headless playthrough (`scripts/playthrough.mjs`) produces
the in-game captures. Generators are committed; API tokens live outside the repo.

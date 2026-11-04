# Asset provenance

Every picture and sound in The Listening Kingdom is generated: either drawn by code at boot,
produced by a generation model from a prompt recorded here, or synthesised in Web Audio. No
pre-made packs are used. Dates are when the asset in the repo was made.

## Visual (3D version, branch claude/3d-c89b4d)

| Asset | Route | Where | Notes |
| --- | --- | --- | --- |
| World of each area: ground with sunken ponds, wall blocks with caps and plinths, trees, plank bridges, door frames and slabs, gate pillars and bars, the practice bench and its lantern, waymarkers at the exits, rocks and tufts | Headless Blender 4.2 (bmesh) from the ASCII maps and entity tables parsed out of `src/world/areas.ts`, colours from `src/world/palette.ts`, exported as glTF | `public/world/<area>.glb`, generator `scripts/blender/build_area.py` (`scripts/blender/build.sh`) | 2026-11-02. Stylized low poly: bevelled edges with sharp-edge normals, flat colours, per-tile vertex-colour modulation. Every build is deterministic (hashed per tile). |
| Per-area props: Tonic Town pitched roofs, lit windows, striped awnings, market crates; Jazz Quarter neon signs, the band stand's marquee and the stage deck in the square in front of it (footlights, lamp posts, a step: `Area.build_stage`, from the area's `stage` entity); the Silent Stage curtains, gilded proscenium and footlights; the hearth in Hearthstone; standing stones in the Valley | Same Blender script, `Area.area_props` | `public/world/<area>.glb` | 2026-11-02 |
| Skies, one equirectangular panorama per area | Blender Cycles, Nishita sky model at a time of day and tint per area (`SKIES` table), 1024 x 512 | `public/sky/<area>.jpg`, generator `scripts/blender/build_sky.py` | 2026-11-02 |
| 3D player character, rigged, with walk, idle and sing clips | Tripo Studio web app: text-to-3D with T-pose, retopology to 18,412 triangles, humanoid auto-rig (65 Mixamo-named joints, three textures), three text-to-motion clips of about 5 s, in place, looped and crossfaded by the game (`src/scenes3d/Player.ts`; `Rig.ts` is the procedural fallback for a rig without clips). | `public/character/singer.glb` | 2026-11-02. Motion prompts: "walk forward at a relaxed steady pace, natural arm swing, looping walk cycle, light cheerful step"; "standing idle in place, gentle breathing, slight weight shift, looks around calmly, seamless loop"; "standing in place and singing joyfully, head tilted up, chest rising, one hand raised expressively, gentle sway, loop". Model prompt: "small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, simple boots, holding a tiny wooden flute, stylized low-poly game character, rounded readable shapes, bevelled simple materials, warm restrained colors, full body, standing". |
| Jazz band: bassist, drummer, trumpeter | Tripo Studio text-to-3D (H3.1, T-pose for the standing two), quad retopology to about 10,000 faces with Smart Mesh, exported as GLB without clips (the trumpeter with an idle and a playing clip): an instrument built into the mesh does not follow retargeted arms, so the game sways the whole body and moves each player on the notes they play (`World.updateNpcs`, cues from `src/audio/bandBus.ts`). Prompts in `docs/tripo-brief.md`. | `public/character/bassist.glb`, `drummer.glb`, `hornplayer.glb` | 2026-11-03. The singer's export gained a `run` preset clip the same day. |
| The townsfolk: hearthkeeper, shepherd, two stallkeepers, mayor, two choristers, doorman; the bell tower | Tripo Studio text-to-3D with T-pose, quad retopology to about 10,000 faces, humanoid auto-rig, the idle preset plus one text motion each, exported as GLB with 1k textures (the tower unrigged, retopologised from 1.9M to 11k faces). Prompts and clip prompts in `docs/tripo-brief.md`. Each area names its people (`npc`) and props (`prop`) in `src/world/areas.ts`; the game loads those listed in `public/character/index.json` and `public/props/index.json` (`scripts/assets-index.mjs`). Houses directly south of a person stay single-storey so the camera sees them (`build_area.py`, `person_behind`). | `public/character/*.glb`, `public/props/bell-tower.glb` | 2026-11-03 night. The tower came out in dark slate and stone, darker than the town; regenerate in pale sandstone if it bothers. |
| Placeholder mannequin | Headless Blender, bevelled boxes and spheres with jointed limbs | `public/character/mannequin.glb`, generator `scripts/blender/build_mannequin.py` | 2026-11-02. Used only if the Tripo file is missing. |
| Melody fragment (floating gem), grey-to-colour, water ripple, bloom | Code: a Babylon polyhedron; material plugins in `src/scenes3d/colour.ts` (life texture, one texel per tile), `DefaultRenderingPipeline` | `src/scenes3d/` | 2026-11-02 |
| Title backdrop, five area story cards, results backdrop | Local Stable Diffusion XL base 1.0 on an RTX 4090, painted finish at 1536 x 864 | `public/cards/*.jpg`, prompts and seeds in `public/cards/cards.json`, generator `scripts/gen_cards.py` | 2026-11-02. Shared with the 2D version. |
| HUD, puzzle panel, piano, SVG ladder, chord signs, lessons, map (2D canvas), story cards, title, results | HTML and CSS overlays over the canvas | `src/overlay/*.ts`, `src/overlay/ui.css` | 2026-11-02 |

## Visual (2D version, tag v1-2d on main)

| Asset | Route | Where | Notes |
| --- | --- | --- | --- |
| Ground, walls (ridge, top, face), water (two frames), bridge, tree | Code-drawn pixel art, greyscale, tinted per area at runtime | `src/world/textures.ts` | 2026-11-02. Walls pick their piece from the map: a block of walls gets a shingled top, a ridge on its upper edge and a brick face where it meets the ground. |
| Doors (closed, open), gates (closed, open), serpent, melody fragment, practice bench, glow | Code-drawn | `src/world/textures.ts` | 2026-11-02 |
| Player: four facings and a six-frame walk per facing | PixelLab API, `create-character-with-4-directions` at 32 px (48 px cells) then `animate-character` with the `walk` template, one direction per call | `public/sprites/player/player.png` + `player.json`, generator `scripts/pixellab_player.py` | 2026-11-02. Prompt: "small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, simple boots, carrying a tiny wooden flute, 16-bit pixel art game character". Low top-down view, chibi proportions, black outline, basic shading, seed 7. Character id 8a3b6a9d-49e1-4002-b2f1-1442a5370609. |
| Title backdrop, five area story cards, results backdrop | Local Stable Diffusion XL base 1.0 on an RTX 4090, then area-average downscale to 256 x 144, palette quantisation to the area's colours, nearest-neighbour upscale | `public/cards/*.png`, prompts and seeds in `public/cards/cards.json`, generator `scripts/gen_cards.py` | 2026-11-02. Style sentence on every prompt: "coherent crisp 16-bit pixel art, strong hard pixel clusters, no smooth antialiasing, limited palette, wide landscape game illustration, no text". |
| 3D player character, rigged, with walk, idle and sing clips | Tripo Studio web app, Pro plan: text-to-3D HD model with T-pose (55 credits), Smart Mesh retopology to 18k triangles (35), humanoid auto-rig (20), three text-to-motion clips (20 each), exported as one GLB with the skeleton and all clips, animations in place | `public/character/singer.glb` | 2026-11-02. Model prompt: "small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, simple boots, holding a tiny wooden flute, stylized low-poly game character, rounded readable shapes, bevelled simple materials, warm restrained colors, full body, standing". Motion prompts: "walk forward at a relaxed steady pace, natural arm swing, looping walk cycle, light cheerful step"; "standing idle in place, gentle breathing, slight weight shift, looks around calmly, seamless loop"; "standing in place and singing joyfully, head tilted up, chest rising, one hand raised expressively, gentle sway, loop". 65 joints. Task 52e1b816-6c46-408a-90b6-487bc936feae. Pulled from the browser export through the dev server's drop box (`vite.config.ts`). |
| HUD, panels, map, lessons, piano, ladder | Code-drawn with the Phaser Graphics and Text APIs | `src/ui/*.ts`, `src/scenes/*.ts` | Ongoing |

## Audio

| Asset | Route | Where |
| --- | --- | --- |
| Instruments (pipe, bell, pad, bass, horn) | Web Audio oscillators and filters | `src/audio/synth.ts` |
| Area music: one sequenced track per area, three layers gated by the area's life | Code-sequenced, synthesised live | `src/audio/music.ts` |
| Footsteps, door, gate, panel, click | Filtered noise and short tones | `src/audio/sfx.ts` |
| Lesson demos (reference-song openings) | Note lists with per-note beats, synthesised | `src/world/lessons.ts` |
| Recorded pieces (`public/music/*.mp3`): hub, title (also the Valley), town, jazz, story (cards and the Stage), finale (also everywhere once the song is given back), credits | Suno, instrumental, C major; cover art stripped with ffmpeg. Played by `src/audio/tracks.ts`, low-passed with the area's grey, stepped aside under every prompt. | `public/music/` |

## Process

Per the Game Week asset lecture: one style sentence reused everywhere, one representative asset
checked at game size before a batch, and a separate critic pass over magnified crops and in-game
captures before an asset is kept. The headless playthrough (`scripts/playthrough.mjs`) produces
the in-game captures. Generators are committed; API tokens live outside the repo.

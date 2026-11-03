# Tripo job list (2026-11-03)

About 3000 credits to spend before the subscription ends. Everything here is set up so a file can be
dropped in and appears in the game without code changes: the areas already name each person and prop
(`src/world/areas.ts`, entities of kind `npc` and `prop`) and the game loads whatever
`public/character/index.json` and `public/props/index.json` list.

## The routine for every job

Same settings as the singer (see `docs/assets.md`): Tripo Studio, text to 3D, **T-pose** on for
characters, retopology to about 15 to 20 thousand triangles, humanoid auto-rig, then text-to-motion
clips of about 5 seconds, **in place** and **looped**. Export **glTF binary (.glb) with the rig and
the animations in one file**. Name the file exactly as below.

Every character prompt ends with the same style line, so they sit with the singer and the Blender
world:

> stylized low-poly game character, rounded readable shapes, bevelled simple materials, flat warm
> restrained colours, no fine texture detail, full body, standing

Every prop prompt ends with:

> stylized low-poly game prop, rounded readable shapes, bevelled simple materials, flat colours,
> single object on a flat base, no scene, no ground plane

Then, from the Mac, one line per file (the folder is created already):

```bash
scp ~/Downloads/<file>.glb hdx-lab:/home/hdx/code/game/.claude/worktrees/3d-c89b4d/public/character/
```

```bash
scp ~/Downloads/<file>.glb hdx-lab:/home/hdx/code/game/.claude/worktrees/3d-c89b4d/public/props/
```

and tell me the name; I run `node scripts/assets-index.mjs`, check scale and facing in a screenshot,
and commit. Characters are placed at 1.3 times model height like the singer; if one comes out a
different size I set `scale` on its entry.

## 1. The singer's run (do this first, one job)

Open the existing singer model in Tripo and add one motion clip. Clip prompt:

> running forward at a light steady jog, relaxed arms, small bounce, looping run cycle, in place

Export the singer again with all four clips (walk, idle, sing, run) as `singer.glb` and replace the
file. The game picks the run for movement when a clip whose name starts with "run" is present, and
measures its stride at load so the feet match the walking speed (`Player.ts`, `matchStride`).

## 2. People (rigged, two clips each: idle and one action)

Idle clip for everyone unless noted:

> standing idle in place, gentle breathing, slight weight shift, looks around calmly, seamless loop

| File | Where they stand | Model prompt | Action clip prompt |
| --- | --- | --- | --- |
| `hearthkeeper.glb` | Hearthstone, by the Hearth Door | an old kindly hearthkeeper in a patched brown apron and grey shawl, round spectacles, white hair in a bun, holding a small bellows | nods slowly and warmly, hands clasped, listening, gentle sway, loop |
| `shepherd.glb` | Valley, by the Chord Serpent | a young shepherd in a green cloak with a crook, straw hat, bare feet, freckles | leans on the crook and whistles, head bobbing to a tune, loop |
| `stallkeeper.glb` | Tonic Town, the first stall | a plump cheerful market stallkeeper in a striped apron and rolled sleeves, flat cap, holding a loaf | claps along to a beat, big grin, loop |
| `stallkeeper-2.glb` | Tonic Town, the second stall | a tall thin fruit seller in a yellow headscarf and blue dress, basket on hip | sways and hums with eyes closed, one hand conducting, loop |
| `mayor.glb` | Tonic Town, by the Mayor's Choir | a short round mayor in a red coat with a gold chain of office, tricorn hat, grey moustache, holding a small baton | conducts a choir with the baton, broad gestures in time, loop |
| `chorister.glb` | Town choir and the stage band | a chorister in a long cream robe with a blue collar, holding a hymn book open, calm face | singing in place, chest rising, head lifted, book held up, gentle sway, loop |
| `chorister-2.glb` | Town choir and the stage band | a second chorister, taller, in the same cream robe, dark curly hair, hands folded | singing in place, head tilted, swaying slightly, loop |
| `doorman.glb` | Jazz Quarter, the Club Door | a jazz club doorman in a violet velvet jacket and bow tie, fedora, arms folded, confident smile | snaps fingers and nods to a slow beat, loop |
| `bassist.glb` | Band stand and the stage | a jazz bassist with an upright double bass, pork-pie hat, waistcoat, fingers on the strings | plays the upright bass, plucking, bobbing in time, loop |
| `drummer.glb` | Band stand and the stage | a jazz drummer seated at a small drum kit, shirt sleeves, braces, sticks raised | plays the drum kit with brushes, relaxed, loop |
| `hornplayer.glb` | Band stand and the stage | a jazz trumpeter in a dark suit, trumpet raised to the lips, cheeks puffed, eyes closed | plays the trumpet, swaying, horn lifting on long notes, loop |

Characters with an instrument: keep the instrument in the model prompt so it is part of the mesh,
and say "seated" or "standing" so the rig matches the pose. The bassist, drummer and trumpeter are
used twice (band stand and the finale), so they are the most valuable ones to get right.

## 3. Hero props (no rig, no clips)

| File | Replaces | Prompt |
| --- | --- | --- |
| `bell-tower.glb` | stands beside the Town Bell door | a small square stone bell tower with a pointed slate roof and an open belfry holding one bronze bell |
| `serpent.glb` | the Chord Serpent (needs a generator change: it is the door itself) | a long friendly green serpent coiled in three humps with a rounded head and lit amber eyes, scales as soft bevelled bands |
| `well.glb` | the Well (needs a generator change: the well is a wall block today) | a round stone village well with a little pitched roof on two posts, a wooden bucket on a rope, mossy stones |

Scale is set per prop in `areas.ts` once the file is in; one tile is one metre, so make each about
one to two metres across.

## 4. Trees (optional, if credits remain)

Three trees for the valley and town palettes, each a separate prop: `tree-round.glb`,
`tree-tall.glb`, `bush.glb`. Prompt: "a low-poly stylized tree with a short trunk and a rounded
canopy made of a few faceted lobes, flat green, no leaves detail". These need a generator change to
use, so they come last.

## Done so far (2026-11-03 evening)
- Singer: run preset added and exported with all four clips (`singer.glb`, 7.5 MB). The game runs it at
  1.56x (five steps a second) and walks at 3.4 tiles a second.
- Band: bassist, drummer, trumpeter generated, retopologised, exported without clips. Lesson learned:
  an instrument modelled into the character cannot take Tripo's motions (the arms retarget away from
  it), so these three sway as a whole in the game. Credits left: about 2685.
- Transfer: exports download to the Mac; one `scp ~/Downloads/<names>*.glb hdx-lab:.../scratch/tripo/`
  per batch brings them over, and `scripts/assets-index.mjs` registers them.

## Budget

Check the per-job cost in the Tripo console before starting: a rigged character with two clips is
several jobs (model, retopology, rig, two motions). Order of value if credits run short: the run clip,
then bassist, drummer, hornplayer, chorister, mayor, then the rest. Keep about a quarter back for
regenerating misses.

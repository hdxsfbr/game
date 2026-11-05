# Submission notes (Game Week, due 2026-11-05)

Live: https://game-production-34da.up.railway.app (Railway, static `dist`; the domain is the service's
own and survives every deploy). Repository `main` at the commit named in the results below.

## Form copy

**Category:** Adventure (brief option 1, Exploration / Adventure).

**Description.** The Listening Kingdom is an exploration game that teaches you to hear music. You
play a small wandering singer in a kingdom gone silent and grey. Every door answers only to the
right note: in the Valley of Intervals you learn to hear the distance between two notes, in Tonic
Town the degrees of a scale, in the Jazz Quarter the four chord qualities. Each door you open
spreads colour through the world and wakes its people and its music. Three melody fragments found
across the kingdom unlock the Silent Stage, where you sing the kingdom's song back. Answer by
singing into the microphone or by playing the on-screen piano; a wrong answer costs one of five
notes of voice, and a practice bench in each area, with a narrated guide, gives it back. About
fifteen minutes end to end, on a desktop, an iPad or a phone.

**How to play.** Walk with the arrow keys or WASD (the stick at the bottom left on a touch screen).
Press Space at a door to listen, then sing the answer or play it on the keys shown (A S D F G H J K
are the white keys from C) and press Enter. M opens the map. Headphones help if you sing.

**Assets.** Everything is generated for this game: the world and props by Blender scripts written for
it, the singer, the band and the townsfolk by Tripo from prompts, the story cards and title by Stable
Diffusion XL, the music by Suno from prompts, the narration by Chatterbox in the author's cloned voice,
every puzzle sound by a Web Audio synth at runtime. Prompts and dates are in `docs/assets.md`.

## The brief, line by line

| Brief | Where it is met |
| --- | --- |
| Clear central goal, beginning-to-end story | Title, five story cards (one per area), the finale on the Silent Stage, a results screen with credits. |
| At least three distinct, connected areas, revisitable | Five: Hearthstone, Valley of Intervals, Tonic Town, Jazz Quarter, Silent Stage; exits both ways, a map (M) shows them. |
| At least three meaningful puzzles | Twenty doors, each an ear puzzle of its area's kind (intervals, scale degrees, chord qualities, melodies), plus gates that need fragments. |
| Progression opens new paths | Opening doors restores colour and music and unlocks the next street; three fragments open the Stage. |
| Consistent visual identity, resolving ending | One low-poly style across all areas, one palette per area that arrives with colour; the song sung back resolves the silence. |
| 10 to 15 minutes | Headless playthrough about 8 minutes at machine speed; Andre's own plays 12 to 15. |
| Playable by someone else | Instructions on the title screen and in every panel; the bench guide narrates the music for someone with no background. |
| Browser, no install | The live link above; mic optional (Play with keys). |
| All assets generated | See Assets above and `docs/assets.md`. |

## Deviations and known limits

- The run animation can freeze mid-run on some real devices while the singer keeps moving (seen on a
  Mac and an iPad on 2026-11-04). Not reproduced headlessly; open.
- Touch play (joystick, on-screen buttons, phone layouts) landed on 2026-11-04 and has had one evening
  of play on real devices; the desktop is the primary target.
- Music levels and the narration read were checked by measurement and by machine, not yet by ear.
- No continuous integration: the checks are the scripts below, run by hand.

## Test results, 2026-11-04

Build `db4a25d` (main), with the README and docs commits that follow it.

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npx vitest run` (16:00) | 5 files, 70 tests, 70 passed |
| Type-check and build | `npm run build` | passes; one chunk-size warning (Babylon bundle) |
| Fresh clone | `git clone -b main`, `npm ci`, `npm run build` in an empty directory | 70 packages, builds in 1.2 s, `dist` 126 MB |
| Full playthrough, dev server | `node scripts/playthrough.mjs https://localhost:5182` (15:30) | every door through `stage-song` solved, errors: none, ok |
| Deploy smoke | `scripts/deploy.sh` (15:50) | live bundle matches local build, world ready in 960 ms, errors: none |
| Full playthrough, live URL | `node scripts/playthrough.mjs https://game-production-34da.up.railway.app` (16:35) | every door through `stage-song` solved, errors: none, ok (the music checks need the dev build and are skipped on production) |
| Touch layouts | `scripts/inspect3d.mjs --size 1024x768/844x390/390x844 --touch` | stick hit-tested at its centre, screenshots reviewed |

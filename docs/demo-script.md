# Demo video: scene list

The four-minute demo for the Game Week submission, recorded by `scripts/demo.mjs` from the dev
server at the commit production runs, one clip per scene, with the game's own sound. Narration (Andre's cloned voice,
`scripts/narrate.py`) is one line per scene, read from this file by `scripts/demo-narration.py`.
Nothing is simulated: every door is opened by the keys as a player would open it. The only cuts are
the loads between areas, where the recorder is stopped and started again; a scene is one take.

Viewport 1280x720. Play mode (the keys), since a microphone cannot be recorded headless; the Sing
mode is shown on the title screen and named in the narration.

| # | Scene | On screen | What the viewer learns | Target |
| --- | --- | --- | --- | --- |
| 01 | Title card | "The Listening Kingdom", one line under it | What the game is | 5 s |
| 02 | Title screen | The painted title, "How will you answer the door?", Sing and Play; Play is chosen | Two ways to play: sing, or the keys as a piano | 10 s |
| 03 | The hearth door | The grey hub; the singer walks to the hearth door, Space, the door hums its note, the note is found on the keys, the door opens and colour floods the hearth | The core loop: a door asks for a note, you answer by ear, the kingdom comes back in colour | 35 s |
| 04 | The bench guide | The hub bench; the guided walkthrough in Andre's own voice, two steps, the piano lighting as the notes sound | A player with no music background is taught before being tested | 30 s |
| 05 | The Valley of Intervals | The walk over the bridge; the fifth door: listen, one wrong answer and the hint, then the right one | Intervals; the hint ladder; nothing is lost by trying | 40 s |
| 06 | The map | M opens the kingdom map, the five areas, the doors found so far | The scale of the kingdom | 8 s |
| 07 | Tonic Town | The bell door: a scale, then a note to place by its degree; the stall and the well | Scale degrees in a key | 35 s |
| 08 | The Jazz Quarter | The band stand: four chord qualities named from the signs, the band wakes and plays | Chord qualities; the people and music come back | 40 s |
| 09 | The Silent Stage | The kingdom's song sung back phrase by phrase, the lights, the fireworks, the results screen | The finale: everything learned, in one song | 45 s |
| 10 | Closing card | The live link and the repository | Where to play it | 6 s |

Total target: about four minutes; the cut of 2026-11-05 runs 3 min 32 s (212 s), 1280x720, H.264 and AAC, 20 MB. `scripts/demo-stitch.sh`
assembles the cards, clips and narration into `listening-kingdom-demo.mp4`.

## Narration

One line per scene, in Andre's voice. Short, so the game's sound stays audible under it; the music
scenes (08, 09) carry only an opening sentence.

- 01: The Listening Kingdom. A game that teaches you to hear music.
- 02: You can sing your answers into a microphone, or play them on the keyboard like a piano. We'll play.
- 03: Every door in this kingdom answers to one note. Listen, find it, and the colour comes back.
- 04: Never been told what a note is? Each bench walks you through it first, in my own voice.
- 05: The Valley teaches intervals. A wrong answer costs nothing but gives you a hint.
- 06: Five areas, twenty doors.
- 07: Tonic Town is about where a note sits in its key.
- 08: The Jazz Quarter is chords. Name all four and the band wakes up.
- 09: And on the Silent Stage you sing the kingdom's song back, with everything you've learned.
- 10: Play it in your browser, link in the description.

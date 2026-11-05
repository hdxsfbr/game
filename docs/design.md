# The Listening Kingdom: game design

Status: draft v1, 2026-11-01. Genre: Exploration/Adventure (brief option 1). Due 2026-11-05 midnight.

## One line

A musician who has lost their voice walks a silent, grey kingdom and wins it back one interval at a
time. Every door responds only to the right note. By the end you can hear intervals, scale degrees,
and the four jazz chord qualities, and you sing (or play) the song that wakes the kingdom.

## Player promise

- You will learn something real in 12 minutes: hearing an interval, a scale degree in a key, and the
  difference between a major seven, a minor seven, a dominant seven, and a half-diminished chord.
- You never get stuck on your ears. Every puzzle has hints that get stronger on each miss, and every
  puzzle can be answered by voice or by keys.
- The world visibly changes as you learn. Grey becomes colour, silence becomes music.

## Core loop

1. Walk to a locked thing (door, bridge, statue, creature).
2. It plays a short sound: a reference, then a target.
3. You answer by singing the target note or by playing it on the pipes (keys).
4. Correct: the thing opens, colour floods that part of the screen, a melody fragment is collected.
   Wrong: the thing plays it again with a stronger hint. Third miss: the hint shows the answer's
   direction and distance so the player can still proceed and learn.

Low input density on purpose (Rhythm Doctor principle): one listening question at a time, and the
walking between questions is where the world and art do their work.

## Input

Two tiers, both are genuine ear training. Chosen on the title screen, switchable in the pause menu.

### Sing (microphone)
- `pitchy` (McLeod Pitch Method) on an AnalyserNode buffer of 2048 samples, rAF loop.
- Gate: clarity > 0.9 and RMS above a floor set during a 5-second calibration ("hum your lowest
  comfortable note, then your highest"). Calibration also sets the player's range.
- Smoothing: median of last 5 frames, then an EMA for the on-screen voice beam.
- Mic constraints: echoCancellation false, noiseSuppression false, autoGainControl false, wrapped in
  try/catch for Safari. AudioContext created and resumed on the first click.
- Bleed: master gain ducks to 0 for the listening window. Detections within 30 cents of the
  just-played reference are ignored for the first 150 ms. A "headphones recommended" line on the
  calibration screen.
- Pass rule: cents = 1200 * log2(f / fRef). Within tolerance for 0.8 s of voiced frames, brief
  dropouts allowed. Tolerance 50 cents (hard mode 35). Octave-agnostic by default: the player sings
  the pitch class, in whatever octave is comfortable. A visible beam shows sharp/flat live.

### Play (keys)
- The pipes: eight keys, one per scale degree of the current key, laid out on A S D F G H J K, with
  the same eight pipes on screen as clickable buttons for touch and trackpad.
- Same puzzles, same pass rule, instant answer.
- In area 1 (intervals, no key context) the pipes are chromatic from the reference note: the eight
  keys are the reference and the next seven semitones, with a second row Q W E R T Y U I for the
  upper octave. Area 1 therefore teaches interval distance, which is what intervals are.

Voice answers earn a "resonance" (a bigger colour bloom and a medal on the results screen).
Key answers earn the same progress. The ending performance works either way.

### Play mode, revised 2026-11-02

The piano is fixed, C4 to E5, for every door: the root falls somewhere on it and is not marked,
so an interval has to be found by ear rather than counted from the left. Musical typing:
A S D F G H J K white keys from C, W E T Y U black keys, O L P ; above the top C. Pressing or
clicking a key only plays it and holds it; Enter (or the Answer button) submits, and only a
submitted wrong note costs voice. No degree numbers over the keys; the reference is named on the
ladder only from the third miss, when the answer is shown anyway. All roots live in C4..E4 so
every target sits on the piano; the later Town doors (well, clock, choir) use random keys so
"home is always C" stops working.

## World

Top-down, Zelda-style, 16:9 canvas 960 by 540 scaled to fit. Tile size 32. Each area is 3 to 4
screens with scrolling, not room-by-room cuts, so it feels like a place.

```
             [Tonic Town]  (area 2)
                  |
[Valley of Intervals] --- [Hearthstone] --- [Jazz Quarter]  (area 3)
     (area 1)               (hub, start)
                               |
                         [The Silent Stage]  (finale)
```

Hearthstone, the hub, is where you wake up. It has the calibration shrine, the tutorial door
(unison: sing back the same note), and three exits. The exit to the Jazz Quarter is a high wall
that needs a note you do not have yet. The exit to the Silent Stage needs all three melody fragments.

### Area 1: Valley of Intervals (about 4 minutes)
Teaches: interval distance from a reference. Order chosen for ease of hearing.

Two question forms (decided 2026-11-01 after Andre's first playtest):
- *Echo*: the door plays the reference and the target; the player gives the target back. Only the
  tutorial door and the first bridge use it, because echoing the last note heard teaches nothing
  about the interval.
- *Produce*: the door plays only the reference and names the interval; the player must find the
  note by ear. Every other door uses it. The first two misses replay the reference alone (with a
  higher/lower nudge and the tries left); from the third miss the prompt becomes an echo, slower, so
  the answer is heard before the ladder shows it (decided 2026-11-03 after Andre's second playtest).
The early doors always start from C4 so the ear anchors to one reference. The serpent moves the
root (G3 to D4) so the skill proves relative, not memorised.
1. Tutorial door in the hub: unison.
2. Bridge of Echoes: octave. (Second note is the same pitch class; easy win.)
3. Fifth gate: perfect fifth. The gate's two halves are a fifth apart in pitch and in height.
4. Fourth gate: perfect fourth. Introduces the hint system (a wrong answer shows the "distance ladder").
5. Thirds grove: major third and minor third, two trees. The first time the player must tell two
   intervals apart by quality, not just reproduce a note. Both must be sung to open the grove.
6. Boss: the Chord Serpent. Three segments play three intervals from one root (fifth, major third,
   octave). Answer all three in sequence to build the chord and the serpent becomes a bridge.
Progression reward: your range widens by a fifth upward, which lets you reach the high wall in the
hub (Jazz Quarter entrance) and the Tonic Town stairs. Melody fragment 1 collected.

### Area 2: Tonic Town (about 4 minutes)
Teaches: scale degrees in a key (Functional Ear Trainer method). Every puzzle plays a I-IV-V-I
cadence first so the key sits in the ear. Pipes switch to the scale layout: A to K are degrees 1 to 8.
Built 2026-11-01.
1. Town bell: produce degree 1 (do). Just find home. Key of C.
2. Three market stalls in series: produce degree 5 (sol), then 3 (mi), then 2 (re). Key of C.
3. The well: produce 7 (ti) then 8 (do above). Teaches tension and resolution. Key of C.
4. The clock tower: echo mode, three random degrees in a random key (G3 to D4). Degrees missed
   before anywhere in the game are weighted to come up more often (progress.misses).
5. Boss: the Mayor's Choir. Melody mode: cadence, then a four-note tune from a small set, played
   once in a random key. The player gives it back note by note; Space plays the key and the whole
   tune again, and a miss replays the whole tune slower. Correct notes are confirmed in the status
   line, not echoed (an echoed single note read as a new prompt in the 2026-11-03 playtest).
Progression reward: melody fragment 2. The key change proves the skill is relative.

### Area 3: Jazz Quarter (about 4 minutes)
Teaches: chord quality by ear. The four seventh chords that cover most of jazz, plus the ii-V-I.
Every chord prompt is a block chord on a pad with the root in the bass. Pipes use the chromatic
layout from the root. Built 2026-11-01. Entered from the hub's right wall (opens with the Valley).
Order reworked 2026-11-03: naming a quality is the easier skill and what the bench teaches, so it
comes first, and singing the chord's notes comes before picking one note out of it.
1. The club door: four chords in random keys, no two of the same quality in a row. Answered by
   pressing 1 to 4 or clicking a sign; no singing. Misses: replay note by note, then the sign lights.
2. The alley: the chord sung one note at a time, root, third, fifth, seventh, on one root: a major
   seventh, then a minor seventh (`arpeggio` steps, expanded to four chordTone steps each).
3. The cellar: major seventh, sing the third; then minor seventh, sing the third.
4. The band stand: dominant seventh, sing the seventh; major seventh, sing the seventh; minor
   seventh, sing the fifth; half-diminished, sing the fifth.
5. Boss, the Last Set: the band plays ii then V in a random key and stops; the player supplies the I.
   Twice, in two keys. On each success the band lands the I with the player's note on top.
Hint ladder here: miss 1 plays the chord note by note and then the asked note; miss 2 stacks the
chord's 1, 3, 5, 7 on the ladder; miss 3 marks the target.
Progression reward: melody fragment 3 collected.

The band (decided 2026-11-03, after Andre found three idle models on a deck). The band is part of the
ear-training, not scenery, and follows the kingdom's rule that nothing moves until it is sung to:
- Frozen, instruments down, until the player stands at the Band Stand door. Then "the band picks up
  their instruments", and every chord question from there on is theirs: the bass takes the root, the
  drums the downbeat, the horn the chord; in a replay the horn walks the notes one by one and holds
  the one that is asked. Each note moves its player (a pop, sparks over the instrument, the trumpet
  raised for the length of the note), so the chord is something to watch as well as hear.
- A right answer at the Band Stand or Last Set is answered by a lick: the horn plays the chord's
  five, three, one over a bass turn. At the Last Set the band lands the one with the player.
- Once the Band Stand is open, the quarter's background music is the band's vamp: all layers at once,
  a ride cymbal under them, every note cued to the stage. The street the player brought back sounds
  like them.
The cues travel on a small bus (`src/audio/bandBus.ts`) from the sound to the world, timed on the
audio clock, so the picture and the note land together.

Recorded music (2026-11-04, Andre's Suno credits, all spent). Seven pieces, all in C major and in the
synth's own voices, one per space: a fireside lullaby (Hearthstone), a music-box waltz (the Valley,
and the title), a market-morning guitar and glockenspiel piece (Tonic Town), a smoky night street
(the Jazz Quarter), a harp-and-pad underscore (the Silent Stage, and the story cards), a late-night
trio (the credits) and a band-and-choir celebration (the finale, and every area once the song has
been given back). Each area's piece is low-passed while the area is grey and opens as colour comes
back, and steps aside, still running, whenever a door or lesson listens, so a fixed key never sits
under a question. Andre's call: recorded music everywhere, with one exception he chose after hearing
both: when the Band Stand opens, the band's own vamp, cued note by note to the players on stage,
is the door's celebration for four rounds (about half a minute), and then the quarter's piece
returns. The chord questions and the licks stay synthesised in the puzzle's key. The finale piece takes over once the kingdom's own song and its held chord have
died away, and runs on under the results, the credits piece after it.

Touch play (2026-11-04, iPad and phones). Walking is a joystick at the bottom left: a ring with a
thumb that follows the finger, the direction and how far it is pushed giving the walk, as a game
pad would (a first version walked to a tap on the ground; Andre found that unintuitive and hard to
aim, so it went). The stick hides whenever the singer cannot walk (a door panel, the map, a
lesson). The one thing Space would do shows as a button bottom right (Listen, Sing it again,
Practise), the map has its own button, every label drops its key name, the piano answers to a
touch at once, Play asks for fullscreen where the browser allows it, and the page cannot scroll or
zoom. The door panel keeps its layout on an iPad, shrinks its keys on a phone held sideways, and
stacks on a phone held upright with a nudge to turn it sideways. Keyboard play is unchanged.

The bench guide on a phone (2026-11-04). A phone's browser lets a media element start only from
inside a tap, so the guide's first clip spoke and every later one, started by the guide's own timer,
was refused: the steps ran on without narration and out of step with the keys. The narration now
plays through the Web Audio engine (`src/audio/narration.ts`), which the first tap unlocks for good,
and a bench's clips are fetched and decoded when the guide opens.

Valley hillsides (2026-11-04). The Valley's deep wall masses were a field of bevelled blocks, one per
run of wall tiles, which read as crates. Now only the ring of wall tiles that fronts open ground is
built as rock faces; behind them the ground itself rises into a rolling hillside (`Area.hill` in
`build_area.py`, from a per-tile distance to open ground), a shade darker than the floor, and the
land outside the map carries on up. Other areas keep their blocks; `HILL_STYLES` is where to add one.

The legs that froze (found 2026-11-05). On a Mac and an iPad the singer would, after a change of
direction, keep travelling in her idle pose. Every stage checked out on the device: the keys were
held, the run clip played at weight 1 with its frames cycling, the skeleton rebuilt its matrices, and
CPU skinning changed nothing. A sampler on the one joint found the run clip's value for it equal to
the idle clip's every frame. Two things met: the stride measurement had stepped the run clip with
`goToFrame`, which Babylon applies by handing each joint the clip's own working value object, so a
joint's quaternion *was* the run clip's value; and whenever the settled crossfade weights summed to
one ulp under 1, Babylon's blend took its under-one branch, wrote idle into that shared object first,
then read it back as the run pose. Where the weights settle depends on the frame time, so the Mac hit
it and headless never did. Every joint now gets its own copy after the measurement, and a weight
within 0.001 of its target snaps to exactly 0 or 1 (`Player.ts`). `scripts/legs-repro.mjs` forces the
Mac's weight pair headlessly and measures the leg swing; it collapsed from 1.07 to 0.04 before the fix.

The bench guide (2026-11-04, for players with no music background). The first time at a bench, a
guided walkthrough instead of the text pages: a step at a time, narrated in Andre's own voice (a
Chatterbox clone, default model, from `src/world/narration.json`), the words also shown as a caption,
and each step's example sounded and lit on a large piano as it plays: one note, a higher one, an
octave, a fifth, the cadence, the climb from doh, the four chord moods, the song. Steps follow on by
themselves; the arrows move by hand, Space says one again, Enter begins the drill, P opens the text
pages, which stay as the reference (G opens the guide from them). The pages' own Hear buttons use the
same demo player.

The townsfolk (2026-11-04). Everyone on the ground turns to the singer when she comes within a few
tiles and eases back to their resting facing when she goes, so no one is met from behind. Come
closer and they speak: a line in a bubble over their head, a different one each visit, about the
thing their area teaches, short and a little daft; a new set once their own door is open
(`src/world/talk.ts`). The quarter's band says nothing while frozen. Performers
on a stage keep facing the audience. Each person acts (nods, claps, conducts, sings, snaps) while
their own door is being sung and idles otherwise.

### Finale: the Silent Stage (about 2 minutes)
Built 2026-11-01. Entered from the hub's south gate once all three fragments are held. One door,
The Song: a fifteen-note tune in C (1 3 5 8 / 6 5 3 2 / 1 3 5 6 / 5 2 1) in melody mode. The
kingdom plays it once after a cadence; the player gives it back note by note. The band joins bar
by bar as the areas did: bass from the first bar (Valley), pad chords from the second (Town), a
horn doubling the tune from the third (Quarter). On the last note the whole song plays with every
layer, colour floods the stage, and every area is coloured from then on (progress.finished).
Results screen: time from the first Sing/Play click, misses per area with gold (0-2), silver (3-6)
or bronze medals, stars per area, the one sentence each area taught, and buttons to walk the
kingdom or start over.

## Stars (added 2026-11-03)

Each step of a door is worth 3 points on the first try, 2 on the second, 1 on the third, and 0 once
the answer has been played. A door's stars are the average over its steps, rounded. They show in
the toast when the door opens, on the map beside the opened door, and summed per area on the
results. Benches award none. An opened door can be sung again (Space) with no voice at stake and
no change to its stars.

## Hint ladder (every puzzle)

At a door (`hintOffset` -2 in PuzzleRunner):
- Misses 1 and 2: the reference again, a higher/lower nudge, and the tries left. Each costs voice.
- Miss 3: replay the sound with the answer, slower.
- Miss 4: replay, and show the "distance ladder" (area 1), the scale staircase with the tonic lit
  (area 2), or the chord's notes stacked (area 3). The player's attempts are marked on it.
- Miss 5: the target lights up on the ladder. The player can now copy it. Progress continues.
At a bench (`hintOffset` 1) help comes two misses sooner and misses cost nothing.
Nothing hard-blocks. The brief wants a complete experience for a new player, not a wall.

## Voice and practice benches (decided 2026-11-02)

The player's resource is **voice**: five notes, shown under the area name in the HUD.

- A wrong answer at a door costs one note. Opening a door, or picking up a fragment, refills all five.
- At zero the player **goes quiet**: the door closes, the screen fades, and they wake beside the
  area's practice bench with two notes. No game over, no lost doors. Quiets are counted on the
  results screen.
- Voice carries across areas; it is saved with progress.

Every area has one **practice bench** (map legend: the bench is a blocked tile placed on `.`,
with a standing tile beside it). Space at the bench opens a **lesson**: a few pages of text, most
with a sound to hear (reference songs for intervals, the cadence and scale for degrees, the four
chord moods, ii–V–I). Enter starts the **drill**: three questions of the area's kind, run on the
same puzzle panel as the doors. Misses in a drill are free and the hint ladder arrives one miss
early. Each right answer restores one note of voice, up to three. Doors give the rest, so practice
gets a player back on their feet without replacing the doors.

Reference songs used in lessons: Over the Rainbow (octave), Twinkle Twinkle and Star Wars (fifth),
Here Comes the Bride and Amazing Grace (fourth), When the Saints and Kumbaya (major third),
Greensleeves and Smoke on the Water (minor third), Do-Re-Mi, Mary Had a Little Lamb, Happy Birthday
(degrees). Only the opening few notes are played, as synth motifs. Content lives in
`src/world/lessons.ts`.

## Art direction (decided 2026-11-01)

Requirement: all visuals generated, cohesive, polished.

- **In play: code-drawn flat vector art.** Every tile, sprite, and effect is drawn in code with a
  fixed palette (one grey ramp, and one saturated ramp per area that "arrives" as you clear it).
  Soft shapes, thick outlines, generous animation (squash, bloom, ripple). Cohesion is guaranteed
  and the grey-to-colour mechanic is a palette swap.
- **Story cards: AI-generated illustrations** for the title background, intro, three area reveals,
  and ending. Generated by a committed Python script using diffusers with FLUX.1-schnell (SDXL base
  as fallback) on the local RTX 4090. One style suffix, fixed seeds, then a post-process that
  quantizes to the game palette and adds an outline pass so the cards match the sprites. No ComfyUI.
- **Scheduling:** cards are a Wednesday or Thursday job after the game is playable. If the pipeline
  costs more than two hours, cut the cards; the game ships with code-drawn title and ending screens.

## Audio plan

All synthesized at runtime with Web Audio, which satisfies "generated" and keeps the bundle tiny.
- Reference tones and pipes: triangle oscillator, 2-pole lowpass, ADSR. Pipes get a breath noise layer.
- Chords: three or four detuned oscillators per voice, slow attack.
- Music (built 2026-11-02, `audio/music.ts`): a hand-rolled scheduler on the Web Audio clock,
  eighth-note steps, 80 ms tick, 300 ms lookahead, on its own `music` bus. One looping track per
  area written as data, each with three layers that come in as the area's colour returns (life 0,
  0.34, 0.74), and the bus swells from 30% to full with life. Hub: a breath on C with fifths.
  Valley: open fifths over a bass pulse, bells on 1-5-8. Town: I IV V I cadence that never
  stops. Quarter: ii V I I with a walking bass, off-beat comping, a horn riff. Stage: a low drone
  until the song is sung, then the song itself. The music ducks to silence the moment a puzzle
  opens and comes back after the door's flourish, so nothing competes with the prompt. Everything
  stays in C so the ear keeps one anchor.
- SFX (`audio/sfx.ts`): procedural footsteps (filtered noise, alternating), door opening (rising
  pad and bell shimmer), locked gate (thud), button click, panel breath. Miss thud and fragment
  chime were already in the scene.

## Tech

- Phaser 4 (same scene, tilemap, tween, and camera API as Phaser 3, new WebGL renderer) with Vite and TypeScript. Vitest for the pure modules.
- Modules: `audio/` (synth, sequencer, sfx), `ear/` (pitch detection, pass rule, hint ladder,
  question generator with adaptive weighting), `world/` (tilemaps, entities, doors), `scenes/`.
- Save progress in localStorage so a judge can reload.
- Deploy as static files (GitLab Pages or Railway static). Must be HTTPS for getUserMedia.

## Schedule

- Sun (today): design sign-off, project scaffold, ear module with a tuner test page, pipes input.
- Mon: hub and Valley of Intervals end to end, hint ladder, palette system, door bloom.
- Tue: Tonic Town, cadence engine, adaptive questions, music sequencer with layers.
- Wed: Jazz Quarter, finale performance, results, title and calibration screens, SFX pass.
- Thu: polish only. Playtest with two people who have not seen it. Fix mic edge cases. Deploy.
  Record a short walkthrough for the submission. Freeze by 9 pm.

## Risks and mitigations

- Mic fails in the judging room: keys are a first-class input, chosen on the title screen.
- Puzzles feel the same: each area has a different visual ladder, a different kind of boss, and a
  different answer form (reproduce a note, place a note in a key, name a quality).
- Scope: areas are 3 to 4 screens each; cut the clock tower or the alley before cutting a boss.
- Art cohesion: one palette file, one outline rule, one animation vocabulary. No imported assets.

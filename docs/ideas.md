# Game Week: idea exploration

Date: 2026-11-01. Due Thursday 2026-11-05 at midnight. Judged Friday morning.

## What the brief actually constrains

- Must be one of three genres: **Exploration/Adventure**, **Platformer**, or **Multiplayer Racing**.
  A trainer with points on top does not qualify. The learning topic has to be the core mechanic.
- Beginning, middle, end. Roughly 10 to 15 minutes for a new player. Varied challenges, clear progression.
- **All visual and audio assets generated** (sprites, environments, SFX, music). No pre-made packs.
- Browser-playable, shareable link, playable without the author present.
- Polish over size. Mismatched or thrown-together art fails the assignment outright.
- Judges play it Friday morning, probably in a shared room. Anything that depends on a quiet
  environment or on the judge being willing to sing out loud needs a fallback.

## Your ideas, assessed

| Idea | Learning payoff | Fit with the brief | Verdict |
|---|---|---|---|
| Chess square names | Real but narrow. No good game exists for this (Lichess trainer is a flashcard and does not adapt), so it is an open niche. | Needs a genre wrapper. Works as exploration: the board is the world, navigation is by square name, puzzles are piece-movement gates. | Viable. Visual risk: a grid world can look dry. |
| Guitar fretboard | Real for guitarists only. The mechanics that actually work (Fretuoso, Stringkick) are "find every instance of this note" and weak-spot targeting. | Weakest wrapper. Without a real guitar it is a diagram quiz. With a guitar via mic, pitch detection cannot tell which string the note came from, only its pitch. | Pass, or keep as a stretch mode inside a music game. |
| Ear training + singing intervals | High. Interval and scale-degree hearing is the single most transferable music skill. | Best fit. Pitch detection in the browser is solved (pitchy, McLeod method, 46 ms latency). The input itself becomes the core mechanic, which the brief rewards. | Strongest direction. Needs a non-voice fallback. |
| Jazz learning | High if scoped to one skill: hearing chord qualities (maj7, min7, dom7, m7b5) and the ii-V-I. | Fits as the third area of a music exploration game rather than a game of its own. | Fold in. |

## What prior art says

- Make the learned skill **the controller**, not a quiz layered on a game. Rocksmith's arcade games and
  One Hand Clapping work; Crypt of the NecroDancer and Wandersong are fun but teach almost nothing.
- **Spatialize the concept.** Scale degree as direction, piece move as path, note as a place in the world.
- **One concept per stage, low input density** (Rhythm Doctor, A Dance of Fire and Ice).
- **Anchor to context.** Play a tonic or cadence before the target note (Functional Ear Trainer). Relative
  hearing transfers; bare intervals transfer less.
- **Calibrate to the player and keep a fallback** so a bad mic or shy judge never blocks progress.
- **Ocarina of Time** is the proof that a Zelda-like can teach short melodies to millions of people.
  Its songs were shown on screen, though. Ours would be learned by ear.

## Technical feasibility of voice input (from research)

- Library: `pitchy` (McLeod Pitch Method). Tiny, pure JS, feed it an AnalyserNode buffer on a rAF loop.
  Gate on clarity above about 0.9 plus a volume floor. Median-filter the last 3 to 5 frames.
- Mic constraints: disable echo cancellation, noise suppression, and especially auto gain control.
- Start the AudioContext from a click. Handle iOS suspending it on backgrounding.
- Mic bleed: the game's own tones will be picked up. Duck the master gain while listening, ignore
  detections near the just-played reference for the first 150 ms, recommend headphones.
- Correctness check: cents = 1200 * log2(hz / refHz). Pass when within tolerance for about 0.8 s of
  voiced frames. Research on amateur singers suggests plus or minus 50 cents as the default tolerance,
  35 for a hard mode, slightly more lenient sharp than flat. Octave-agnostic matching as an option.
- Audio synthesis: OscillatorNode plus an ADSR envelope is enough for reference tones. Tone.js only if
  we want sequenced background music. ZzFX or jsfxr give procedural SFX that count as generated.
- Generated music: ElevenLabs Music and Sound Effects (API), Stable Audio (API), Suno (UI, limited API).

## New ideas

### 1. The Listening Kingdom (Exploration/Adventure, music) — recommended

You are a musician who has lost their voice. The world is silent and grey. Every door, bridge, and
creature in it responds only to sound. You recover your voice one interval at a time.

- **Three connected areas, one listening skill each.**
  1. *The Valley of Intervals.* Doors play a reference note and a target. You reproduce the target.
     Starts with octave and fifth, then fourth, thirds, seconds. Each new interval is a "found" ability.
  2. *The Tonic Town.* Every puzzle first plays a short cadence so the key is in your ear, then a single
     note. You answer with the scale degree, by singing it or by playing it. This is the Functional Ear
     Trainer method, and it is what actually transfers to real music.
  3. *The Jazz Quarter.* Four kinds of door: major seven, minor seven, dominant seven, half-diminished.
     Identify the chord quality by ear to open it. The final gate is a ii-V-I you must complete.
- **Progression item:** your range. You start with two notes and unlock more as you clear areas, which
  physically opens new paths (a high ledge needs a high note; a deep well needs a low one).
- **Input, two tiers, both are real ear training:**
  - *Sing it* (mic, pitchy). The character's "voice beam" rises and falls with your pitch. Holding the
    right note for about a second opens the door.
  - *Play it* (keyboard or on-screen pipes, one key per scale degree). Same puzzle, no mic. This is
    the fallback for judges in a loud room and for people who will not sing in public.
  - Singing gives a bonus resonance effect and a better medal. Nobody is locked out.
- **Ending:** the fragments of melody you collected in each area assemble into the one song that
  wakes the kingdom. You perform it (sing or play), and the world fills with colour and the full
  generated soundtrack.
- **Why it wins on the brief:** silence-to-sound is a visual identity that the art can carry (grey to
  colour as you progress); three areas and three puzzle types are required anyway; the
  progression item is literally the thing you learn; the ending is a performance, not a screen.
- **Risks:** the three puzzle types must feel different in play, not just in audio. Mic UX must be
  bulletproof or it hurts more than it helps. Scope the world small: three screens per area.

### 2. Voice Climb (Platformer, music)

One Hand Clapping meets Celeste. Your pitch is your altitude. Level 1: any sound lifts you. Level 2:
platforms are tuned, you must hold the note they play to solidify them. Level 3: platforms play an
interval and only the target note holds. Final climb: a melody you ascend one note at a time.

- Strongest "core mechanic built on through the game" story of all the options.
- Risk: pitch-steered movement is hard to make feel good (One Hand Clapping reviews split on this),
  and a platformer with a keyboard fallback is just a normal platformer. Mic is not optional here.
  That is a real problem for a Friday-morning judging room.

### 3. Knight Errant (Exploration/Adventure, chess)

The world is a kingdom laid over an 8 by 8 board that has been scrambled by a usurper. You are a knight.
Three areas (queenside, centre, kingside) each introduce a piece's movement rule as a gate.

- Navigation is by coordinate: townsfolk say "the smith is at g6", the map is unlabeled, and the
  fast-travel mechanic requires you to type a square name. This is the memorization, spatialized.
- Puzzles: a knight's tour room (visit every tile once), a "bishop corridor" you can only cross on one
  colour, a rook gate that opens when a rook could see you from the far wall, a mate-in-one finale.
- Progression item: you learn to move like other pieces (an "amulet of the bishop" opens diagonals).
- Adapts: squares you get wrong come back more often, the gap Lichess leaves open.
- Risk: a grid world must be dressed heavily to not look like a chessboard with sprites on it.

### 4. Circle of Fifths Grand Prix (Multiplayer racing, music)

Tracks are laid out on the circle of fifths. Hitting the correct next chord (by ear) gives a boost,
a wrong one spins you out. Two tracks: one that goes clockwise through fifths, one through the
relative minors.

- Fun on paper and a real jazz skill (hearing key movement).
- Risk: networked multiplayer in four days on top of audio assets and generated art is the biggest
  schedule risk on the list. Not recommended unless the netcode is something we already have.

### 5. Swing Street (Platformer, rhythm)

Rhythm Doctor style, one button, jump on the beat. Stages teach straight eighths, then swing, then
triplets, then a 7/8 bar. The jazz hook is swing feel, which most people never learn to hear.

- Simple to build, low risk, rhythm is easy to judge in a loud room.
- Teaches less that the user wanted (rhythm rather than ear and interval knowledge).

## Recommendation

Build **The Listening Kingdom** (idea 1). It uses the ear-training and singing idea, folds in the jazz
chord-quality skill, fits the Exploration/Adventure checklist almost line for line, and has a visual
story (silent and grey to loud and colourful) that will carry the generated-art requirement. The
keyboard fallback keeps the judging room safe.

If the chess direction is preferred, **Knight Errant** is the second choice. Avoid the racing option.

## Open decisions before building

1. Which direction (ideas 1 to 5, or a blend).
2. Art direction for the world: hand-painted storybook, flat geometric, or pixel art.
   Generated pixel art at a fixed palette is the easiest to keep cohesive in four days.
3. Whether singing is the default input with keys as fallback, or the reverse.
4. Engine: Phaser 3 (fast tilemaps, built-in scenes) versus plain canvas. Phaser is the safer pick.

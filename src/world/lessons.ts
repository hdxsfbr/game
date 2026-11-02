import type { PuzzleSpec } from './puzzles';

/**
 * A short sound played from a lesson page. Offsets are semitones from C4 (MIDI 60).
 * notes: a tune, one after another. chord: a block chord. cadence: the key established first.
 */
export interface Demo {
  notes?: number[];
  /** Length of each note of the tune in beats (default 1 each), so a song keeps its rhythm. */
  beats?: number[];
  chord?: number[];
  /** Several chords in a row, each a block. */
  chords?: number[][];
  cadence?: boolean;
  /** Seconds per beat of a tune, or between chords. Default 0.42. */
  gap?: number;
  timbre?: 'pipe' | 'bell' | 'pad' | 'bass' | 'horn';
}

export interface LessonPage {
  heading: string;
  text: string;
  /** Shown as the name of what Space plays, e.g. a song title. */
  demoLabel?: string;
  demo?: Demo;
}

export interface LessonDef {
  id: string;
  title: string;
  pages: LessonPage[];
  /** The drill run after the pages. Misses cost nothing; each right answer restores voice. */
  drill: PuzzleSpec;
}

const C4: [number, number] = [60, 60];

export const LESSONS: Record<string, LessonDef> = {
  hub: {
    id: 'practice-hub',
    title: 'The Warm-up Bench',
    pages: [
      {
        heading: 'Your voice',
        text: 'Your voice is what brings the kingdom back. Every wrong answer at a door costs one note of it, and opening a door fills it again. If it runs out you go quiet and wake at a bench like this one, with enough voice to practise.',
      },
      {
        heading: 'Singing',
        text: 'Wear headphones, so the game hears you and not itself. Sing one steady note, any note, and hold it for about a second. The marker on the ladder follows your pitch, and the ring around it fills while you hold. Humming works as well as singing.',
        demoLabel: 'a note to match',
        demo: { notes: [0], gap: 0.9 },
      },
      {
        heading: 'Playing',
        text: 'The piano under every door runs from C4 to E5 and never moves. On the keyboard, A S D F G H J K are the white keys from C, W E T Y U the black keys between them, and O L P ; carry on past the top C. Or click the keys. Press a key to hear it; press Enter when it sounds right.',
        demoLabel: 'the piano',
        demo: { notes: [0, 2, 4, 5, 7, 9, 11, 12], gap: 0.22 },
      },
      {
        heading: 'Practice is free',
        text: 'Misses at a bench cost nothing, and the answer is shown after two tries. Every right answer gives back a note of voice, up to three. Doors give the rest. The drill here is the simplest one: give a note back.',
      },
    ],
    drill: {
      id: 'drill-hub',
      title: 'Warm-up',
      intro: 'A note plays. Give it back.',
      instruction: 'Listen, then sing or play the same note.',
      mode: 'echo',
      steps: [
        { kind: 'interval', intervalId: 'P1' },
        { kind: 'interval', intervalId: 'P1' },
        { kind: 'interval', intervalId: 'P1' },
      ],
      refRange: [60, 67],
    },
  },

  valley: {
    id: 'practice-valley',
    title: 'The Interval Bench',
    pages: [
      {
        heading: 'Distances',
        text: 'An interval is the distance between two notes. Each door in the valley hums a note and asks for another at a fixed distance above it. Your ear already knows these distances from songs it has heard a thousand times. Each page here names one.',
        demoLabel: 'a note, then a fifth above',
        demo: { notes: [0, 7], gap: 0.6 },
      },
      {
        heading: 'The octave',
        text: 'The same note, higher. Somewhere Over the Rainbow leaps an octave on its first two notes: "Some-where". The Bridge of Echoes asks for this one.',
        demoLabel: 'Over the Rainbow',
        demo: { notes: [0, 12, 11, 7, 9, 11, 12], beats: [2, 2, 1, 0.5, 0.5, 1, 2], gap: 0.4 },
      },
      {
        heading: 'The fifth',
        text: 'Open and strong. Twinkle Twinkle: the first two different notes, "Twin-kle twin-kle", are a fifth apart. The Star Wars theme leaps the same distance. The Fifth Gate wants it.',
        demoLabel: 'Twinkle Twinkle',
        demo: { notes: [0, 0, 7, 7, 9, 9, 7], beats: [1, 1, 1, 1, 1, 1, 2], gap: 0.4 },
      },
      {
        heading: 'The fourth',
        text: 'One step short of the fifth, and it sounds like an arrival. Here Comes the Bride rises a fourth on "Here comes". Amazing Grace opens with the same leap. The Fourth Gate wants it.',
        demoLabel: 'Here Comes the Bride',
        demo: { notes: [0, 5, 5, 5], beats: [1, 1.5, 0.5, 2], gap: 0.5 },
      },
      {
        heading: 'The major third',
        text: 'Bright. Oh When the Saints starts with a major third, "Oh when", and so does Kumbaya. The Bright Tree wants it.',
        demoLabel: 'When the Saints',
        demo: { notes: [0, 4, 5, 7], beats: [1, 1, 1, 3], gap: 0.36 },
      },
      {
        heading: 'The minor third',
        text: 'One step closer than the major third, and darker. Greensleeves opens with it, "A-las", and so does the riff from Smoke on the Water. The Shaded Tree wants it.',
        demoLabel: 'Greensleeves',
        demo: { notes: [0, 3, 5, 7, 8, 7, 5], beats: [1, 2, 1, 1.5, 0.5, 1, 2], gap: 0.36 },
      },
      {
        heading: 'The drill',
        text: 'A note plays and a distance is named. Sing the note that far above it, or try keys until one sounds right and press Enter. After a miss you hear both notes, slower, and after two the answer is marked.',
      },
    ],
    drill: {
      id: 'drill-valley',
      title: 'Interval drill',
      intro: 'A note, then a named distance above it.',
      instruction: 'Listen, then sing or play the note that far above.',
      steps: [],
      randomIntervals: { pool: ['P8', 'P5', 'P4', 'M3', 'm3'], count: 3 },
      refRange: [60, 64],
    },
  },

  town: {
    id: 'practice-town',
    title: 'The Scale Bench',
    pages: [
      {
        heading: 'Home',
        text: 'A key is a family of seven notes gathered round one home note. Every door in the town first plays a cadence, a few chords that say "this is home", and then asks for a note by its number in the family.',
        demoLabel: 'a cadence',
        demo: { cadence: true },
      },
      {
        heading: 'Counting up',
        text: 'From home, the family climbs: do re mi fa sol la ti, and do again. Degree 1 is home. Degree 8 is home again, higher. Do-Re-Mi from The Sound of Music walks up exactly this ladder.',
        demoLabel: 'the scale',
        demo: { notes: [0, 2, 4, 5, 7, 9, 11, 12], gap: 0.3 },
      },
      {
        heading: 'Resting and leaning',
        text: 'Degrees 1, 3 and 5 sit still. The others lean: 7 leans up to 8, 4 leans down to 3, 2 leans down to 1. Hear each lean, then hear it settle.',
        demoLabel: '7 to 8, 4 to 3, 2 to 1',
        demo: { notes: [11, 12, 5, 4, 2, 0], beats: [1, 2.5, 1, 2.5, 1, 2.5], gap: 0.45 },
      },
      {
        heading: 'Songs that start there',
        text: 'Twinkle Twinkle starts on 1 and jumps to 5. Mary Had a Little Lamb starts on 3 and falls to 1. Happy Birthday starts on 5. When a door asks for a degree, think of a song that begins on it.',
        demoLabel: 'Mary Had a Little Lamb',
        demo: { notes: [4, 2, 0, 2, 4, 4, 4], beats: [1, 1, 1, 1, 1, 1, 2], gap: 0.36 },
      },
      {
        heading: 'The drill',
        text: 'The cadence plays, then a degree is named. Sing or play it. After a miss you hear the key and the note again, slower, and after two the answer is marked.',
      },
    ],
    drill: {
      id: 'drill-town',
      title: 'Scale drill',
      intro: 'The key, then a degree by number.',
      instruction: 'Listen to the chords, then sing or play the degree asked for.',
      steps: [],
      randomDegrees: 3,
      refRange: C4,
      sharedRef: true,
    },
  },

  jazz: {
    id: 'practice-jazz',
    title: 'The Harmony Bench',
    pages: [
      {
        heading: 'Four moods',
        text: 'A chord is notes stacked up and played together. Four kinds live in the quarter, and each has a mood. Learn the moods first and the names follow.',
        demoLabel: 'all four, in a row',
        demo: { chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 6, 10]], gap: 1.1 },
      },
      {
        heading: 'Bright and soft',
        text: 'Major seventh: bright, dreamy, at rest. Minor seventh: soft, a little sad, also at rest. The difference between them is the third note of the stack.',
        demoLabel: 'major seventh, then minor seventh',
        demo: { chords: [[0, 4, 7, 11], [0, 3, 7, 10]], gap: 1.2 },
      },
      {
        heading: 'Restless and uneasy',
        text: 'Dominant seventh: bluesy and restless, it wants to go somewhere. Half-diminished: uneasy, like a held breath. Both are unfinished on purpose.',
        demoLabel: 'dominant seventh, then half-diminished',
        demo: { chords: [[0, 4, 7, 10], [0, 3, 6, 10]], gap: 1.2 },
      },
      {
        heading: 'Two things to listen for',
        text: 'The third sets the mood: major is bright, minor is dark. The seventh sets the colour: a major seventh stays put, a flat seventh pulls. Major seventh and dominant seventh share a bright third and differ only in that pull.',
        demoLabel: 'major seventh, then dominant seventh',
        demo: { chords: [[0, 4, 7, 11], [0, 4, 7, 10]], gap: 1.2 },
      },
      {
        heading: 'The trip home',
        text: 'The band\'s favourite journey is two, five, one: a minor seventh, a dominant seventh, then home on the major seventh. The Last Set asks you to sing that home note.',
        demoLabel: 'two, five, one',
        demo: { chords: [[2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11]], gap: 1.0 },
      },
    ],
    drill: {
      id: 'drill-jazz',
      title: 'Chord drill',
      intro: 'A chord plays. Name its mood.',
      instruction: 'Listen, then pick the sign that names the chord.',
      steps: [],
      randomChords: 3,
      refRange: [60, 64],
    },
  },

  stage: {
    id: 'practice-stage',
    title: 'The Rehearsal Bench',
    pages: [
      {
        heading: 'The song',
        text: 'The song is fifteen notes, sung back one at a time while the band plays under you. Hear it as degrees of the key: it starts on home, climbs to the octave, and finds its way back down.',
        demoLabel: 'the first bar',
        demo: { cadence: true, notes: [0, 4, 7, 12], gap: 0.42 },
      },
      {
        heading: 'Rehearsing',
        text: 'Sing the tune in your head before you sing it aloud. If a note slips, the band plays the tune up to that note again, slower, and you carry on from there. The drill here is short tunes of the same kind.',
      },
    ],
    drill: {
      id: 'drill-stage',
      title: 'Short tunes',
      intro: 'The key, then a short tune.',
      instruction: 'Listen, then sing or play it back note by note.',
      mode: 'melody',
      steps: [],
      melodies: [
        [1, 2, 3],
        [3, 2, 1],
        [1, 3, 5],
        [5, 3, 1],
        [1, 5, 8],
      ],
      refRange: C4,
      sharedRef: true,
    },
  },
};

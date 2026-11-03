import type { PuzzleSpec } from './puzzles';

/**
 * Map legend: # wall, . ground, ~ water, T tree, = bridge, D door tile (blocked until its puzzle
 * is solved), X exit tile, G gate tile (blocked until its flag is set).
 */
export interface DoorDef {
  kind: 'door';
  /** Tiles this door occupies. All are blocked until solved. */
  tiles: Array<{ x: number; y: number }>;
  puzzle: PuzzleSpec;
  /** Texture for the closed state. */
  texture?: 'door-closed' | 'serpent' | 'tile-tree';
}

export interface GateDef {
  kind: 'gate';
  tiles: Array<{ x: number; y: number }>;
  /** Flag that opens the gate. */
  flag: string;
  /** Shown when the player bumps into it while locked. */
  lockedLine: string;
}

export interface ExitDef {
  kind: 'exit';
  tiles: Array<{ x: number; y: number }>;
  to: string;
  /** Tile the player appears on in the destination. */
  at: { x: number; y: number };
}

export interface PickupDef {
  kind: 'fragment';
  tile: { x: number; y: number };
  id: string;
}

/** A practice bench: a lesson and a free drill that restores voice. One per area. */
export interface PracticeDef {
  kind: 'practice';
  /** The bench tile, blocked like a door. */
  tile: { x: number; y: number };
  /** Where the player stands after going quiet. */
  at: { x: number; y: number };
  lesson: string;
}

/**
 * A character standing in the world: a rigged Tripo model in public/character/<model>.glb with an idle
 * clip and, usually, one action clip. Loaded only when public/character/index.json lists the model, so
 * an area can name its people before their files exist. The action clip plays while `door` is being sung.
 */
export interface NpcDef {
  kind: 'npc';
  tile: { x: number; y: number };
  model: string;
  /** Which way they face. Default south, toward the camera. */
  face?: 'north' | 'south' | 'east' | 'west';
  /** The door whose puzzle makes them act (sing, play, nod). */
  door?: string;
  /** Height in tiles. Default 1.3, the singer's. */
  scale?: number;
}

/** A hero prop from public/props/<model>.glb, loaded when public/props/index.json lists it. */
export interface PropDef {
  kind: 'prop';
  tile: { x: number; y: number };
  model: string;
  /** Turn, in quarter turns clockwise seen from above. Default 0. */
  turn?: number;
  /** Uniform scale. Default 1. */
  scale?: number;
  /** Whether the player can walk through its tile. Default blocked. */
  walkable?: boolean;
}

export type EntityDef = DoorDef | GateDef | ExitDef | PickupDef | PracticeDef | NpcDef | PropDef;

export interface AreaDef {
  id: string;
  name: string;
  palette: string;
  map: string[];
  /** Default start tile when entering without an exit target. */
  start: { x: number; y: number };
  entities: EntityDef[];
}

// Early doors always start from C so the ear anchors to one reference. The serpent moves the root.
const C4: [number, number] = [60, 60];
const ROOTS: [number, number] = [60, 64]; // C4..E4, so every answer sits on the fixed piano

export const HUB: AreaDef = {
  id: 'hub',
  name: 'Hearthstone',
  palette: 'hub',
  map: [
    '##############X###############',
    '#.....#.......G..............#',
    '#..TT.#...................TT.#',
    '#..T..#.....~~~~~.........T..#',
    '#.....#.....~~~~~............#',
    '#.....#.....~~~~~............#',
    '#.....#................T.....#',
    '#.....#......................#',
    'X.....D.....................GX',
    '#.....#......................#',
    '#.....#......................#',
    '#...T.#...................T..#',
    '#..TT.#......~~~..........TT.#',
    '#.....#......~~~.............#',
    '#.....#......................#',
    '#.....#.......G..............#',
    '##############X###############',
  ],
  start: { x: 14, y: 8 },
  entities: [
    {
      kind: 'door',
      tiles: [{ x: 6, y: 8 }],
      puzzle: {
        id: 'hub-unison',
        title: 'The Hearth Door',
        intro: 'The door hums a note and waits for the same note back.',
        instruction: 'Listen, then sing or play the note you heard.',
        mode: 'echo',
        steps: [{ kind: 'interval', intervalId: 'P1' }],
        refRange: C4,
      },
    },
    { kind: 'practice', tile: { x: 18, y: 10 }, at: { x: 18, y: 11 }, lesson: 'hub' },
    { kind: 'npc', tile: { x: 8, y: 7 }, model: 'hearthkeeper', face: 'east', door: 'hub-unison' },
    { kind: 'exit', tiles: [{ x: 0, y: 8 }], to: 'valley', at: { x: 57, y: 16 } },
    { kind: 'gate', tiles: [{ x: 14, y: 1 }], flag: 'valley-complete', lockedLine: 'The stairs to the town are too steep for a voice this small. Come back when it has grown.' },
    { kind: 'exit', tiles: [{ x: 14, y: 0 }], to: 'town', at: { x: 22, y: 33 } },
    { kind: 'gate', tiles: [{ x: 28, y: 8 }], flag: 'valley-complete', lockedLine: 'A high wall. You need a higher note than you have.' },
    { kind: 'exit', tiles: [{ x: 29, y: 8 }], to: 'jazz', at: { x: 2, y: 15 } },
    { kind: 'gate', tiles: [{ x: 14, y: 15 }], flag: 'all-fragments', lockedLine: 'The Silent Stage. It needs the whole song, and you have only pieces.' },
    { kind: 'exit', tiles: [{ x: 14, y: 16 }], to: 'stage', at: { x: 14, y: 14 } },
  ],
};

export const VALLEY: AreaDef = {
  id: 'valley',
  name: 'Valley of Intervals',
  palette: 'valley',
  map: [
  '############################################################',
  '#......T........T.T.................~~~#####################',
  '#...............T.T.................~~~#####################',
  '#...............T.D.................~~~#####################',
  '#........T......D.T.............T...~~~#####################',
  '#...............T.T.................~~~#####################',
  '#..T.T..........T.T.................~~~#####################',
  '#.............##########D###########~~~#####################',
  '#...T.....T...######........#.......~~~#####################',
  '#..T..........######........#.......~~~..................T.#',
  '#T............######.T......#.......~~~....................#',
  '#.............######...T....#T......~~~....................#',
  '#.............######........#.......~~~...............T....#',
  '#...T.........######........#.......~~~....................#',
  '#.............######........#....T..~~~.T..................#',
  '#...T.....T...######........#.......~~~....................#',
  '#.............######........D.......==D....................X',
  '#.............######........#.......~~~....................X',
  '#.............######........#.......~~~.................T..#',
  '#~~~~~~D~~~~~~######........#.......~~~....................#',
  '#~~~~~~D~~~~~~######....T...#.......~~~....................#',
  '#~~~~~~D~~~~~~######........#.......~~~.T........TT........#',
  '#..........T..######........#.......~~~..................T.#',
  '#.............######..T.....#.......~~~..................T.#',
  '#.............######.......T#.......~~~....................#',
  '#.............######...T....#.......~~~....................#',
  '#.............######......T.#TTT....~~~#####################',
  '#......X......######################~~~#####################',
  '#.............######################~~~#####################',
  '#.............######################~~~#####################',
  '#.T...........######################~~~#####################',
  '#.............######################~~~#####################',
  '#T........T...######################~~~#####################',
  '############################################################',
  ],
  start: { x: 57, y: 16 },
  entities: [
    { kind: 'exit', tiles: [{ x: 59, y: 16 }, { x: 59, y: 17 }], to: 'hub', at: { x: 1, y: 8 } },
    { kind: 'practice', tile: { x: 52, y: 13 }, at: { x: 52, y: 14 }, lesson: 'valley' },
    {
      kind: 'door',
      tiles: [{ x: 38, y: 16 }],
      puzzle: {
        id: 'valley-octave',
        title: 'Bridge of Echoes',
        intro: 'The far bank answers every note an octave higher: the same note, lifted.',
        instruction: 'Listen to both notes, then give back the second one.',
        mode: 'echo',
        steps: [{ kind: 'interval', intervalId: 'P8' }],
        refRange: C4,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 28, y: 16 }],
      puzzle: {
        id: 'valley-fifth',
        title: 'The Fifth Gate',
        intro: 'Two halves of a gate, a fifth apart. Only the lower half still sounds.',
        instruction: 'Listen to the note, then sing or play a perfect fifth above it.',
        steps: [{ kind: 'interval', intervalId: 'P5' }],
        refRange: C4,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 24, y: 7 }],
      puzzle: {
        id: 'valley-fourth',
        title: 'The Fourth Gate',
        intro: 'A narrower gate. Its note sits a fourth above, one step short of the fifth.',
        instruction: 'Listen to the note, then sing or play a perfect fourth above it.',
        steps: [{ kind: 'interval', intervalId: 'P4' }],
        refRange: C4,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 18, y: 3 }],
      texture: 'tile-tree',
      puzzle: {
        id: 'valley-major-third',
        title: 'The Bright Tree',
        intro: 'This tree wants a major third: bright, open, the start of a major chord.',
        instruction: 'Listen to the note, then sing or play a major third above it.',
        steps: [{ kind: 'interval', intervalId: 'M3' }],
        refRange: C4,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 16, y: 4 }],
      texture: 'tile-tree',
      puzzle: {
        id: 'valley-minor-third',
        title: 'The Shaded Tree',
        intro: 'This tree wants a minor third: one step closer, darker, the start of a minor chord.',
        instruction: 'Listen to the note, then sing or play a minor third above it.',
        steps: [{ kind: 'interval', intervalId: 'm3' }],
        refRange: C4,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 7, y: 19 }, { x: 7, y: 20 }, { x: 7, y: 21 }],
      texture: 'serpent',
      puzzle: {
        id: 'valley-serpent',
        title: 'The Chord Serpent',
        intro: 'Three segments, three intervals above one root, and the root is not C this time.',
        instruction: 'Each segment plays the root. Sing or play a fifth, then a major third, then an octave above it.',
        steps: [
          { kind: 'interval', intervalId: 'P5' },
          { kind: 'interval', intervalId: 'M3' },
          { kind: 'interval', intervalId: 'P8' },
        ],
        refRange: ROOTS,
        sharedRef: true,
      },
    },
    { kind: 'npc', tile: { x: 9, y: 18 }, model: 'shepherd', face: 'west', door: 'valley-serpent' },
    { kind: 'fragment', tile: { x: 7, y: 25 }, id: 'fragment-valley' },
    { kind: 'exit', tiles: [{ x: 7, y: 27 }], to: 'hub', at: { x: 14, y: 8 } },
  ],
};

const KEYS: [number, number] = [60, 64]; // C4..E4, the tonic of a random key, so degree 8 stays on the piano

export const TOWN: AreaDef = {
  id: 'town',
  name: 'Tonic Town',
  palette: 'town',
  map: [
  '############################################',
  '##########........................##########',
  '##########..............X.........##########',
  '##########........................##########',
  '######################D#####################',
  '########............................########',
  '########............................########',
  '######################D#####################',
  '##########........................##########',
  '##########..................###...##########',
  '##########..................###...##########',
  '########....................###.....########',
  '########............................########',
  '######################D#####################',
  '##########........................##########',
  '##########..TT.............~~~~~..##########',
  '##########..TT.............~~~~~..##########',
  '########...................~~~~~....########',
  '########............................########',
  '##########........................##########',
  '######################D#####################',
  '##########..TT....................##########',
  '##########..TT....................##########',
  '######################D#####################',
  '########......................TT....########',
  '########......................TT....########',
  '######################D#####################',
  '##########........................##########',
  '######################D#####################',
  '##########........................##########',
  '##########........................##########',
  '########............................########',
  '########............................########',
  '##########........................##########',
  '##########........................##########',
  '######################X#####################',
  ],
  start: { x: 22, y: 33 },
  entities: [
    { kind: 'exit', tiles: [{ x: 22, y: 35 }], to: 'hub', at: { x: 14, y: 2 } },
    { kind: 'practice', tile: { x: 16, y: 31 }, at: { x: 16, y: 32 }, lesson: 'town' },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 28 }],
      puzzle: {
        id: 'town-bell',
        title: 'The Town Bell',
        intro: 'Every tune in this town comes home to one note. The bell plays the key, then asks for home.',
        instruction: 'Listen to the chords, then sing or play the home note: degree 1, do.',
        steps: [{ kind: 'degree', degree: 1 }],
        refRange: C4,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 26 }],
      puzzle: {
        id: 'town-stall-sol',
        title: 'The First Stall',
        intro: 'The stallkeeper wants the strongest note after home: the fifth degree, sol.',
        instruction: 'Listen to the chords, then sing or play degree 5, sol.',
        steps: [{ kind: 'degree', degree: 5 }],
        refRange: C4,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 23 }],
      puzzle: {
        id: 'town-stall-mi',
        title: 'The Second Stall',
        intro: 'This one wants the note that makes the key sound happy: the third degree, mi.',
        instruction: 'Listen to the chords, then sing or play degree 3, mi.',
        steps: [{ kind: 'degree', degree: 3 }],
        refRange: C4,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 20 }],
      puzzle: {
        id: 'town-stall-re',
        title: 'The Third Stall',
        intro: 'One step above home, leaning back toward it: the second degree, re.',
        instruction: 'Listen to the chords, then sing or play degree 2, re.',
        steps: [{ kind: 'degree', degree: 2 }],
        refRange: C4,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 13 }],
      puzzle: {
        id: 'town-well',
        title: 'The Well',
        intro: 'The well holds the tensest note in the key: ti, which pulls up toward home.',
        instruction: 'Listen to the chords, then sing or play degree 7, ti. Then let it land on degree 8, do.',
        steps: [
          { kind: 'degree', degree: 7 },
          { kind: 'degree', degree: 8 },
        ],
        refRange: ROOTS,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 7 }],
      puzzle: {
        id: 'town-clock',
        title: 'The Clock Tower',
        intro: 'The clock plays the key, then one note. Three times. And the key is no longer C.',
        instruction: 'Listen to the chords and the note, then give the note back.',
        mode: 'echo',
        steps: [],
        randomDegrees: 3,
        refRange: KEYS,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 4 }],
      puzzle: {
        id: 'town-choir',
        title: 'The Mayor\'s Choir',
        intro: 'The choir sings a short tune in a new key, once. Sing it back, one note at a time, and they will join you.',
        instruction: 'Listen to the chords and the tune, then sing or play the tune note by note.',
        mode: 'melody',
        steps: [],
        melodies: [
          [1, 3, 5, 3],
          [5, 3, 2, 1],
          [1, 2, 3, 1],
          [3, 5, 8, 5],
          [5, 6, 5, 3],
        ],
        refRange: KEYS,
        sharedRef: true,
      },
    },
    { kind: 'npc', tile: { x: 20, y: 29 }, model: 'stallkeeper', face: 'east', door: 'town-bell' },
    { kind: 'npc', tile: { x: 24, y: 24 }, model: 'stallkeeper-2', face: 'west', door: 'town-stall-mi' },
    { kind: 'npc', tile: { x: 20, y: 5 }, model: 'mayor', face: 'east', door: 'town-choir' },
    { kind: 'npc', tile: { x: 24, y: 5 }, model: 'chorister', face: 'west', door: 'town-choir' },
    { kind: 'npc', tile: { x: 25, y: 6 }, model: 'chorister-2', face: 'west', door: 'town-choir' },
    { kind: 'prop', tile: { x: 25, y: 27 }, model: 'bell-tower' },
    { kind: 'fragment', tile: { x: 22, y: 2 }, id: 'fragment-town' },
    { kind: 'exit', tiles: [{ x: 24, y: 2 }], to: 'hub', at: { x: 14, y: 8 } },
  ],
};

// Jazz Quarter, generated by scripts/gen_jazz_map.py. One street, five doors, the way home at the end.
// The doors go from naming a chord's mood to singing its notes: the easier skill first.
export const JAZZ: AreaDef = {
  id: 'jazz',
  name: 'Jazz Quarter',
  palette: 'jazz',
  map: [
  '############################################################',
  '############################################################',
  '############################################################',
  '#############T.#############################################',
  '#############..#############################################',
  '############################################################',
  '############################################################',
  '############################################################',
  '############################################################',
  '####..###..#####..#..#####..#..#####..#..#####..######..####',
  '####..###..#####..#..#####..#..#####..#..#####..######..####',
  '#...........###########.........#.........#.TTTT..#........#',
  '#...........###########.........#...####..#.TTTT..#........#',
  '#...........###########.........#...####..#.......#........#',
  '#...........#..T......#.........#.........#.......#........#',
  'X...........D.........D.........D.........D.......D........X',
  '#...........#.........#...~~~~..#.........#.......#........#',
  '#...........###########...~~~~..#...####..#.......#........#',
  '#...........###########...~~~~..#...####..#.......#........#',
  '####..###..#####..#..#####..#..#####..#..#####..######..####',
  '####..###..#####..#..#####..#..#####..#..#####..######..####',
  '############################################################',
  '############################################################',
  '############################################################',
  '#################################..#########################',
  '#################################.T#########################',
  '############################################################',
  '############################################################',
  '############################################################',
  '############################################################',
  ],
  start: { x: 2, y: 15 },
  entities: [
    { kind: 'exit', tiles: [{ x: 0, y: 15 }], to: 'hub', at: { x: 27, y: 8 } },
    { kind: 'practice', tile: { x: 6, y: 12 }, at: { x: 6, y: 13 }, lesson: 'jazz' },
    {
      kind: 'door',
      tiles: [{ x: 12, y: 15 }],
      puzzle: {
        id: 'jazz-club',
        title: 'The Club Door',
        intro: 'Four moods behind one door, and the doorman wants them named. Four chords, four signs.',
        instruction: 'Listen to the chord, then press 1 to 4 for its quality.',
        steps: [],
        randomChords: 4,
        refRange: ROOTS,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 22, y: 15 }],
      puzzle: {
        id: 'jazz-alley',
        title: 'The Alley',
        intro: 'A singer warms up in the alley: one chord, one note at a time, bottom to top. Bright first, then soft.',
        instruction: 'Listen to the chord, then sing or play its root, third, fifth and seventh in turn.',
        steps: [
          { kind: 'arpeggio', quality: 'maj7' },
          { kind: 'arpeggio', quality: 'min7' },
        ],
        refRange: ROOTS,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 32, y: 15 }],
      puzzle: {
        id: 'jazz-cellar',
        title: 'The Cellar',
        intro: 'Two chords on the same root. One is bright, one is blue. The third is what tells them apart.',
        instruction: 'Listen to the chord, then sing or play its third.',
        steps: [
          { kind: 'chordTone', quality: 'maj7', tone: 3 },
          { kind: 'chordTone', quality: 'min7', tone: 3 },
        ],
        refRange: ROOTS,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 42, y: 15 }],
      puzzle: {
        id: 'jazz-bandstand',
        title: 'The Band Stand',
        intro: 'The band tests you on the small differences: a seventh that pulls or stays, a fifth that stands or slips.',
        instruction: 'Listen to the chord, then sing or play the note it asks for.',
        steps: [
          { kind: 'chordTone', quality: 'dom7', tone: 7 },
          { kind: 'chordTone', quality: 'maj7', tone: 7 },
          { kind: 'chordTone', quality: 'min7', tone: 5 },
          { kind: 'chordTone', quality: 'm7b5', tone: 5 },
        ],
        refRange: ROOTS,
        sharedRef: true,
      },
    },
    {
      kind: 'door',
      tiles: [{ x: 50, y: 15 }],
      puzzle: {
        id: 'jazz-boss',
        title: 'The Last Set',
        intro: 'The band plays two chords and stops. Two, five... and the room waits for one. Give them home.',
        instruction: 'Listen to ii and V, then sing or play the note the band is leaning on.',
        steps: [{ kind: 'resolve' }, { kind: 'resolve' }],
        refRange: ROOTS,
      },
    },
    { kind: 'npc', tile: { x: 10, y: 14 }, model: 'doorman', face: 'east', door: 'jazz-club' },
    { kind: 'npc', tile: { x: 34, y: 12 }, model: 'bassist', face: 'south', door: 'jazz-bandstand' },
    { kind: 'npc', tile: { x: 35, y: 13 }, model: 'drummer', face: 'south', door: 'jazz-bandstand' },
    { kind: 'npc', tile: { x: 41, y: 12 }, model: 'hornplayer', face: 'south', door: 'jazz-boss' },
    { kind: 'fragment', tile: { x: 55, y: 15 }, id: 'fragment-jazz' },
    { kind: 'exit', tiles: [{ x: 59, y: 15 }], to: 'hub', at: { x: 27, y: 8 } },
  ],
};

// The Silent Stage: one door, one song. Entered from the hub's south gate once all three fragments are held.
export const STAGE: AreaDef = {
  id: 'stage',
  name: 'The Silent Stage',
  palette: 'stage',
  map: [
    '##############################',
    '#.....##################.....#',
    '#.....##################.....#',
    '#........#####D######........#',
    '#............................#',
    '#.~~~......=======.......~~~.#',
    '#.~~~....................~~~.#',
    '#.~~~....................~~~.#',
    '#............................#',
    '#............................#',
    '#.T.......................T..#',
    '#............................#',
    '#..T.......................T.#',
    '#............................#',
    '#....T..................T....#',
    '#............................#',
    '##############X###############',
  ],
  start: { x: 14, y: 14 },
  entities: [
    { kind: 'exit', tiles: [{ x: 14, y: 16 }], to: 'hub', at: { x: 14, y: 14 } },
    { kind: 'practice', tile: { x: 22, y: 12 }, at: { x: 22, y: 13 }, lesson: 'stage' },
    { kind: 'npc', tile: { x: 10, y: 4 }, model: 'bassist', face: 'south', door: 'stage-song' },
    { kind: 'npc', tile: { x: 11, y: 4 }, model: 'drummer', face: 'south', door: 'stage-song' },
    { kind: 'npc', tile: { x: 18, y: 4 }, model: 'hornplayer', face: 'south', door: 'stage-song' },
    { kind: 'npc', tile: { x: 19, y: 4 }, model: 'chorister', face: 'south', door: 'stage-song' },
    { kind: 'npc', tile: { x: 20, y: 4 }, model: 'chorister-2', face: 'south', door: 'stage-song' },
    {
      kind: 'door',
      tiles: [{ x: 14, y: 3 }],
      puzzle: {
        id: 'stage-song',
        title: 'The Song',
        intro: 'Three fragments, one tune: the leap from the valley, the home note from the town, the colour from the quarter. The kingdom plays it once.',
        instruction: 'Listen, then sing or play it back note by note. The band joins you bar by bar.',
        mode: 'melody',
        steps: [],
        melodies: [[1, 3, 5, 8, 6, 5, 3, 2, 1, 3, 5, 6, 5, 2, 1]],
        refRange: C4,
        sharedRef: true,
      },
    },
  ],
};

export const AREAS: Record<string, AreaDef> = { hub: HUB, valley: VALLEY, town: TOWN, jazz: JAZZ, stage: STAGE };

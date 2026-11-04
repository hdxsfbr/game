/**
 * What the people say when the singer walks up: a line in a bubble over their head, a different one
 * each time, and a different set once their own door is open. Short, a little daft, and about the
 * thing their area teaches. Keyed by area and model; a model alone is the fallback for people who
 * stand in more than one place.
 */
export interface Talk {
  /** Before their door is open. */
  before: string[];
  /** After. */
  after: string[];
}

const TALK: Record<string, Talk> = {
  'hub/hearthkeeper': {
    before: ['The hearth hums one note. Hum it back and it lets you in. It is shy.', 'The same note, mind. Not a cousin of it.', 'Forty years I have kept this fire. Never once in tune.'],
    after: ['There she goes. Told you it was shy.', 'Mind the gates. The town stairs are steep on a small voice.', 'Warm your hands. The kingdom gets colder before it gets louder.'],
  },
  'valley/shepherd': {
    before: ['The serpent asks for distances. A note, then another a certain way up.', 'My sheep only know the unison. Woolly ears.', 'The big leaps are the easy ones. The wee ones bite.'],
    after: ['The serpent is purring. That is as happy as it gets.', 'Off to town with you. Tell the bell I said nothing.', 'Fifths all morning now. The sheep are furious.'],
  },
  'town/stallkeeper': {
    before: ['Fresh bread, two notes a loaf. No notes? Thought not.', 'The bell sings the key. Every tune here crawls home to it.', 'Doh is the loaf. The rest is crumbs.'],
    after: ['Bell has rung. Whole street is in tune. Prices unchanged.', 'Home is doh. Everything else is just visiting.'],
  },
  'town/stallkeeper-2': {
    before: ['Mi, mi, mi. No, I am not warming up. That is the price.', 'Plums! Pears! Perfect thirds!', 'Third from the bell. Count on your fingers, I will not look.'],
    after: ['You found the third. Have a pear. In spirit.', 'Mi. Just so you know I remember.'],
  },
  'town/mayor': {
    before: ['Order! The choir sings its tune ONCE. Twice is for tourists.', 'I conduct. They sing. Nobody else does either job. Mostly.', 'Every note has a post in this town. I gave them out myself.'],
    after: ['Splendid. The minutes will say you sang in tune. Roughly.', 'A hum of approval. Not from me. From the clock.'],
  },
  'town/chorister': {
    before: ['We are one short. Alto. Or anything, honestly.', 'Listen for home first. Then the tune makes sense.'],
    after: ['That was almost pretty. Almost is our best.', 'Sing with us any time. Bring a hymn book, mine is full of crumbs.'],
  },
  'town/chorister-2': {
    before: ['I sing the high bits. Someone has to.', 'The clock keeps the key. I keep the sandwiches.'],
    after: ['Encore? No? Thank goodness.', 'Highest note in town. Unless the bell is feeling clever.'],
  },
  'jazz/doorman': {
    before: ['Four moods, four signs. Name them and you are in. Fedora optional.', 'Major seven smiles. Minor seven sighs. Dominant winks. Half-diminished shrugs.', 'Listen to the third and the seventh. The rest is furniture.'],
    after: ['You are in. Do not touch the piano.', 'Sighs and winks, kid. That is the whole quarter.'],
  },
  'jazz/bassist': {
    before: [],
    after: ['Root is on me. You find the rest.', 'Walk it. Never run it.'],
  },
  'jazz/drummer': {
    before: [],
    after: ['One, two, you know what to do.', 'I only play the downbeat for people I like.'],
  },
  'jazz/hornplayer': {
    before: ['Last set is mine. Sing me the seventh and I will give you a lick.', 'Hear the chord. Find its top. That is the job.'],
    after: ['You have got ears, kid.', 'Two, five, one. Everything else is a detour.'],
  },
  'stage/bassist': {
    before: ['Three fragments, one song. We play it once.', 'Hum the bass if you get lost. I will not tell.'],
    after: ['Listen to that. The whole kingdom is humming.', 'Best house we have had in years. Only house, but still.'],
  },
  'stage/drummer': {
    before: ['Count it in your head. Out loud is fine too. Nobody here can hear.', 'The silence is the drummer tonight. Rude.'],
    after: ['Lights, song, fireworks. I would clap but I am holding sticks.'],
  },
  'stage/hornplayer': {
    before: ['When you have the tune, sing it like you mean it.', 'Valley bass, town chords, quarter horn. All of it at once.'],
    after: ['That last note. I felt it in my hat.'],
  },
  'stage/chorister': {
    before: ['Breathe from the belly. Or wherever you keep it.', 'We came all the way from town for this. Sing nicely.'],
    after: ['Almost pretty again. We are on a streak.'],
  },
  'stage/chorister-2': {
    before: ['If you go sharp I will go sharper. Fair warning.', 'High bits are mine. The tune is yours.'],
    after: ['Encore? Oh. All right then. Just the once.'],
  },
};

/** The lines for a person in an area, or none. */
export function talkFor(areaId: string, model: string): Talk | null {
  return TALK[`${areaId}/${model}`] ?? TALK[model] ?? null;
}

/** Every area and model with lines, for the tests. */
export function talkKeys(): string[] {
  return Object.keys(TALK);
}

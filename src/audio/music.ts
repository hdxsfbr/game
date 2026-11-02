import { AudioEngine } from './engine';
import { playNote, type Timbre } from './synth';

/**
 * Looping area music, scheduled a little ahead on the Web Audio clock.
 * Each track has three layers that come in as the area regains colour (life 0..1), and the whole
 * thing steps aside while a puzzle listens, so nothing competes with the note in the player's ear.
 */

interface Ev {
  /** Step index (eighth notes). */
  s: number;
  midi: number;
  timbre: Timbre;
  /** Seconds. */
  dur: number;
  gain: number;
  /** 0 always, 1 from a third of life, 2 from three quarters. */
  layer: number;
}

interface Track {
  /** Beats per minute; a step is an eighth note. */
  tempo: number;
  steps: number;
  events: Ev[];
}

const LAYER_LIFE = [0, 0.34, 0.74];

function pad(s: number, midis: number[], dur: number, gain = 0.18, layer = 0): Ev[] {
  return midis.map((midi) => ({ s, midi, timbre: 'pad', dur, gain: gain / Math.sqrt(midis.length), layer }));
}
function one(s: number, midi: number, timbre: Timbre, dur: number, gain: number, layer: number): Ev {
  return { s, midi, timbre, dur, gain, layer };
}

/** A slow breath on the tonic: fifths in the pad, a bell now and then. */
function hubTrack(): Track {
  const ev: Ev[] = [];
  ev.push(...pad(0, [48, 55], 6.2, 0.3, 0));
  ev.push(...pad(16, [48, 55, 60], 6.2, 0.3, 0));
  ev.push(one(6, 76, 'bell', 0.8, 0.12, 1), one(22, 79, 'bell', 0.8, 0.1, 1), one(28, 72, 'bell', 0.8, 0.1, 1));
  ev.push(one(12, 64, 'pipe', 1.2, 0.08, 2), one(14, 67, 'pipe', 1.4, 0.08, 2));
  return { tempo: 66, steps: 32, events: ev };
}

/** Open fifths and a walking pulse; the bells sing the intervals the valley teaches. */
function valleyTrack(): Track {
  const ev: Ev[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 8;
    const root = bar === 2 ? 53 : bar === 3 ? 55 : 48;
    ev.push(...pad(b, [root, root + 7, root + 12], 3.4, 0.24, 0));
    ev.push(one(b, root - 12, 'bass', 0.5, 0.2, 1), one(b + 3, root - 12, 'bass', 0.3, 0.14, 1), one(b + 6, root - 5, 'bass', 0.4, 0.16, 1));
  }
  const tune = [72, 79, 84, 79, 76, 72, 74, 79];
  tune.forEach((m, i) => ev.push(one(i * 4 + 1, m, 'bell', 0.7, 0.1, 2)));
  return { tempo: 92, steps: 32, events: ev };
}

/** A cadence that never stops: I IV V I in the pad, roots underneath, a do-re-mi over the top. */
function townTrack(): Track {
  const ev: Ev[] = [];
  const chords = [
    [60, 64, 67],
    [60, 65, 69],
    [59, 62, 67],
    [60, 64, 67],
  ];
  const roots = [48, 53, 55, 48];
  chords.forEach((c, bar) => {
    const b = bar * 8;
    ev.push(...pad(b, c.map((m) => m - 12), 3.2, 0.24, 0));
    ev.push(one(b, roots[bar] - 12, 'bass', 0.6, 0.18, 1), one(b + 4, roots[bar] - 12, 'bass', 0.4, 0.14, 1));
  });
  const tune = [72, 74, 76, 72, 77, 76, 74, 72, 79, 77, 74, 71, 72, 72];
  const at = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28];
  tune.forEach((m, i) => ev.push(one(at[i], m, 'pipe', 0.5, 0.09, 2)));
  return { tempo: 100, steps: 32, events: ev };
}

/** ii V I I with a walking bass, comping on the off-beats, a horn riff once the colour is back. */
function jazzTrack(): Track {
  const ev: Ev[] = [];
  const chords = [
    [62, 65, 69, 72], // Dm7
    [59, 62, 65, 67], // G7
    [60, 64, 67, 71], // Cmaj7
    [60, 64, 67, 71],
  ];
  const walk = [
    [38, 41, 45, 43],
    [43, 47, 50, 41],
    [36, 40, 43, 45],
    [47, 45, 43, 41],
  ];
  chords.forEach((c, bar) => {
    const b = bar * 8;
    walk[bar].forEach((m, i) => ev.push(one(b + i * 2, m, 'bass', 0.45, 0.28, 0)));
    ev.push(...pad(b + 1, c, 0.5, 0.14, 1), ...pad(b + 5, c, 0.9, 0.14, 1));
  });
  const riff = [
    [1, 72], [3, 74], [4, 77], [10, 76], [12, 74], [19, 71], [22, 72], [27, 76], [29, 74], [30, 72],
  ];
  riff.forEach(([s, m]) => ev.push(one(s, m, 'horn', 0.4, 0.09, 2)));
  return { tempo: 118, steps: 32, events: ev };
}

/** Silence, then the song itself once it has been sung. */
function stageTrack(finished: boolean): Track {
  const ev: Ev[] = [];
  if (!finished) {
    ev.push(...pad(0, [36, 43], 7, 0.18, 0));
    return { tempo: 60, steps: 32, events: ev };
  }
  const song = [1, 3, 5, 8, 6, 5, 3, 2, 1, 3, 5, 6, 5, 2, 1];
  const scale = [0, 2, 4, 5, 7, 9, 11, 12];
  const chords = [
    [48, 52, 55],
    [53, 57, 60],
    [55, 59, 62],
    [48, 52, 55],
  ];
  song.forEach((d, i) => ev.push(one(i * 2, 72 + scale[d - 1], 'bell', 0.6, 0.12, 0)));
  chords.forEach((c, bar) => {
    ev.push(...pad(bar * 8, c, 3.2, 0.16, 1));
    ev.push(one(bar * 8, c[0] - 12, 'bass', 0.8, 0.18, 1));
  });
  song.forEach((d, i) => {
    if (i >= 8) ev.push(one(i * 2, 84 + scale[d - 1], 'horn', 0.4, 0.07, 2));
  });
  return { tempo: 110, steps: 32, events: ev };
}

export class MusicPlayer {
  private static _instance: MusicPlayer | null = null;
  static get(): MusicPlayer {
    if (!MusicPlayer._instance) {
      MusicPlayer._instance = new MusicPlayer();
      if (import.meta.env.DEV) (window as unknown as { __lkMusic: MusicPlayer }).__lkMusic = MusicPlayer._instance;
    }
    return MusicPlayer._instance;
  }

  private track: Track | null = null;
  private trackId = '';
  private timer: number | null = null;
  private nextStep = 0;
  private nextTime = 0;
  private life = 0;
  private paused = false;

  /** Start (or switch to) the music for an area. Restarts from the top only when the track changes. */
  play(areaId: string, finished = false): void {
    const id = `${areaId}:${finished ? 'song' : 'quiet'}`;
    if (id === this.trackId && this.timer !== null) return;
    this.trackId = id;
    this.track = areaId === 'hub' ? hubTrack() : areaId === 'valley' ? valleyTrack() : areaId === 'town' ? townTrack() : areaId === 'jazz' ? jazzTrack() : stageTrack(finished);
    const engine = AudioEngine.get();
    this.nextStep = 0;
    this.nextTime = engine.now + 0.15;
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 80);
    this.applyGain();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    this.trackId = '';
    AudioEngine.get().music.gain.setTargetAtTime(0, AudioEngine.get().now, 0.25);
  }

  /** 0 grey .. 1 full colour. Brings the layers in and swells the bus. */
  setLife(life: number): void {
    const l = Math.max(0, Math.min(1, life));
    if (Math.abs(l - this.life) < 0.01) return;
    this.life = l;
    this.applyGain();
  }

  /** Step aside while a puzzle listens. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.applyGain();
  }

  private applyGain(): void {
    const engine = AudioEngine.get();
    const target = this.paused || !this.track ? 0 : 0.55 + 0.45 * this.life;
    engine.music.gain.setTargetAtTime(target, engine.now, this.paused ? 0.15 : 0.6);
  }

  private tick(): void {
    const t = this.track;
    if (!t) return;
    const engine = AudioEngine.get();
    const stepLen = 30 / t.tempo;
    const horizon = engine.now + 0.3;
    // While paused, keep the clock moving so the loop resumes in time rather than in a burst.
    while (this.nextTime < horizon) {
      const step = this.nextStep % t.steps;
      if (!this.paused && this.nextTime >= engine.now - 0.05) {
        for (const ev of t.events) {
          if (ev.s !== step) continue;
          if (this.life < LAYER_LIFE[ev.layer]) continue;
          playNote(ev.midi, { timbre: ev.timbre, at: this.nextTime, duration: ev.dur, gain: ev.gain, out: engine.music });
        }
      }
      this.nextStep++;
      this.nextTime += stepLen;
    }
  }
}

import { midiToHz } from '../ear/pitchMath';
import { AudioEngine } from './engine';

export type Timbre = 'pipe' | 'bell' | 'pad' | 'bass' | 'horn' | 'chord';

export interface NoteOptions {
  timbre?: Timbre;
  /** Seconds. Default 1. */
  duration?: number;
  /** 0..1. Default 0.6. */
  gain?: number;
  /** Start time in AudioContext seconds. Default now. */
  at?: number;
  /** Where the note goes. Default the master bus. */
  out?: AudioNode;
}

interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const TIMBRES: Record<Timbre, { wave: OscillatorType; env: Envelope; cutoff: number; detune: number[]; breath: number; level?: number }> = {
  pipe: { wave: 'triangle', env: { attack: 0.03, decay: 0.1, sustain: 0.8, release: 0.15 }, cutoff: 2200, detune: [0], breath: 0.05 },
  bell: { wave: 'sine', env: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 0.6 }, cutoff: 6000, detune: [0, 1201], breath: 0 },
  pad: { wave: 'sawtooth', env: { attack: 0.25, decay: 0.3, sustain: 0.7, release: 0.5 }, cutoff: 1200, detune: [-7, 0, 7], breath: 0 },
  bass: { wave: 'square', env: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.2 }, cutoff: 500, detune: [0], breath: 0 },
  horn: { wave: 'sawtooth', env: { attack: 0.06, decay: 0.2, sustain: 0.6, release: 0.3 }, cutoff: 2600, detune: [-4, 4], breath: 0.02 },
  // Block chords: one clean voice per note, a quick attack and a short tail, so stacked notes stay
  // separate and one chord has stopped before the next begins. The pad's detuned saws beat against
  // each other and ring for half a second, which blurred chord after chord into one.
  // level: a clean triangle loses little to the filter, so four of them at the pad's gains would clip.
  chord: { wave: 'triangle', env: { attack: 0.03, decay: 0.35, sustain: 0.55, release: 0.12 }, cutoff: 3600, detune: [0], breath: 0, level: 0.45 },
};

let noiseBuffer: AudioBuffer | null = null;
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate; // 1 s
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Play one note. Returns the time (AudioContext seconds) at which the note fully ends. */
export function playNote(midi: number, opts: NoteOptions = {}): number {
  const engine = AudioEngine.get();
  const { ctx } = engine;
  const timbre = TIMBRES[opts.timbre ?? 'pipe'];
  const duration = opts.duration ?? 1;
  const peak = (opts.gain ?? 0.6) * (timbre.level ?? 1);
  const t0 = opts.at ?? ctx.currentTime;
  const { attack, decay, sustain, release } = timbre.env;
  const hz = midiToHz(midi);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + attack);
  amp.gain.linearRampToValueAtTime(peak * sustain, t0 + attack + decay);
  const tEnd = t0 + duration;
  amp.gain.setValueAtTime(peak * sustain, Math.max(tEnd, t0 + attack + decay));
  amp.gain.linearRampToValueAtTime(0, tEnd + release);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = timbre.cutoff;
  filter.Q.value = 0.7;

  const voiceGain = 1 / timbre.detune.length;
  for (const cents of timbre.detune) {
    const osc = ctx.createOscillator();
    osc.type = timbre.wave;
    osc.frequency.value = hz;
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = voiceGain;
    osc.connect(g).connect(filter);
    osc.start(t0);
    osc.stop(tEnd + release + 0.05);
  }

  if (timbre.breath > 0) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoise(ctx);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz * 2;
    bp.Q.value = 4;
    const ng = ctx.createGain();
    ng.gain.value = timbre.breath;
    noise.connect(bp).connect(ng).connect(filter);
    noise.start(t0);
    noise.stop(tEnd + release + 0.05);
  }

  filter.connect(amp).connect(opts.out ?? engine.master);
  return tEnd + release;
}

/** Play several notes together. */
export function playChord(midis: number[], opts: NoteOptions = {}): number {
  let end = 0;
  const gain = (opts.gain ?? 0.6) / Math.sqrt(midis.length);
  for (const m of midis) end = Math.max(end, playNote(m, { ...opts, gain }));
  return end;
}

/** Play notes one after another with `gap` seconds between onsets. Returns end time. */
export function playSequence(midis: number[], opts: NoteOptions & { gap?: number } = {}): number {
  const engine = AudioEngine.get();
  const gap = opts.gap ?? (opts.duration ?? 0.6) + 0.1;
  let t = opts.at ?? engine.now;
  let end = t;
  for (const m of midis) {
    end = playNote(m, { ...opts, at: t });
    t += gap;
  }
  return end;
}

/**
 * I, IV, V, I in the key of `tonicMidi`, as block chords. Returns the end time.
 * Voiced in close position around the tonic itself (the IV and V in inversion), with a quiet bass an
 * octave below each root: an octave lower the whole cadence sounded muddy and the tonic was hard to pick out.
 */
export function playCadence(tonicMidi: number, opts: { at?: number; gain?: number; speed?: number } = {}): number {
  const engine = AudioEngine.get();
  const k = opts.speed ?? 1;
  const beat = 0.55 * k;
  const t0 = opts.at ?? engine.now;
  // Loud enough to sit beside the prompt notes (0.55 each): the chord voice is scaled down and spread
  // over three notes, so the cadence needs a higher figure to come out at the same level.
  const gain = opts.gain ?? 0.8;
  const chords: Array<{ notes: number[]; root: number }> = [
    { notes: [0, 4, 7], root: 0 }, // I
    { notes: [0, 5, 9], root: 5 }, // IV, second inversion
    { notes: [-1, 2, 7], root: 7 }, // V, first inversion
    { notes: [0, 4, 7], root: 0 }, // I
  ];
  let end = t0;
  chords.forEach((c, i) => {
    playNote(tonicMidi + c.root - 24, { timbre: 'bass', at: t0 + i * beat, duration: beat * 0.7, gain: gain * 0.4 });
    end = playChord(c.notes.map((n) => tonicMidi + n), { timbre: 'chord', at: t0 + i * beat, duration: beat * 0.72, gain });
  });
  return end;
}

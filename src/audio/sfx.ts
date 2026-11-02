import { AudioEngine } from './engine';
import { playChord, playNote } from './synth';

/** Small procedural sounds for the world. Nothing here is a pitch the player has to answer. */

let stepToggle = false;

/** A soft footfall: a short burst of filtered noise. */
export function footstep(): void {
  const engine = AudioEngine.get();
  const { ctx } = engine;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = stepToggle ? 900 : 700;
  stepToggle = !stepToggle;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.09, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
  src.connect(f).connect(g).connect(engine.master);
  src.start(t0);
  src.stop(t0 + 0.08);
}

/** A door giving way: a rising pad and a shimmer of bells. */
export function doorOpen(rootMidi = 60): void {
  const engine = AudioEngine.get();
  const t0 = engine.now + 0.02;
  playChord([rootMidi - 12, rootMidi - 5, rootMidi], { timbre: 'pad', at: t0, duration: 1.1, gain: 0.5 });
  [12, 16, 19, 24].forEach((o, i) => playNote(rootMidi + o, { timbre: 'bell', at: t0 + 0.45 + i * 0.07, duration: 0.5, gain: 0.18 }));
}

/** A locked gate: a low thud. */
export function gateLocked(): void {
  const engine = AudioEngine.get();
  const { ctx } = engine;
  const t0 = ctx.currentTime;
  playNote(31, { timbre: 'bass', at: t0, duration: 0.12, gain: 0.35 });
  const src = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.value = 0.25;
  src.connect(f).connect(g).connect(engine.master);
  src.start(t0);
}

/** A click for buttons. */
export function uiClick(): void {
  playNote(84, { timbre: 'bell', duration: 0.05, gain: 0.12 });
}

/** The panel opening: a listening breath. */
export function panelOpen(): void {
  playNote(60, { timbre: 'pipe', duration: 0.18, gain: 0.08 });
}

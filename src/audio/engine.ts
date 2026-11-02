/**
 * Shared Web Audio context, master gain, and ducking.
 * The context is created lazily and must be resumed from a user gesture (call `unlock()` in a click handler).
 */
export class AudioEngine {
  private static _instance: AudioEngine | null = null;
  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** Gain between master and destination used to duck playback while listening to the mic. */
  readonly duck: GainNode;
  /** Bus for the area music, so it can swell with colour and step aside for a puzzle. */
  readonly music: GainNode;
  /** The player's own keys: straight to the output, never ducked, so a tried note is heard at full volume. */
  readonly keys: GainNode;

  private constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.duck = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.keys = this.ctx.createGain();
    this.keys.gain.value = 0.8;
    this.keys.connect(this.ctx.destination);
    this.master.gain.value = 0.8;
    this.music.gain.value = 0;
    this.master.connect(this.duck).connect(this.ctx.destination);
    this.music.connect(this.master);
    if (import.meta.env.DEV) (window as unknown as { __lkAudio: AudioEngine }).__lkAudio = this;
  }

  static get(): AudioEngine {
    if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine();
    return AudioEngine._instance;
  }

  /** Resume the context. Safe to call repeatedly; call it from a user gesture. */
  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Smoothly duck playback to `level` (0 = silent). Used while the mic listens. */
  setDuck(level: number, timeConstant = 0.03): void {
    this.duck.gain.setTargetAtTime(level, this.ctx.currentTime, timeConstant);
  }
}

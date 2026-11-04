import { AudioEngine } from './engine';

/**
 * The recorded pieces (public/music/*.mp3). Each area has one as its background, a piece under the
 * story cards, and the finale and credits at the end. A piece steps aside (fades to nothing, still
 * running) while a door or lesson listens, so a fixed key never sits under a question, and comes
 * back after; the synth takes over only where the music is itself part of the play: the Jazz
 * Quarter once its band is on stage, and the Silent Stage once the song has been given back.
 *
 * Each piece is an audio element through a low-pass filter and a gain into the engine's master, so
 * the mic duck and the master level apply to it as to everything else. The filter closes while the
 * area is grey and opens as colour comes back. Starting a piece before the player's first gesture
 * is refused by the browser; the title retries on the first click or key.
 */
export type TrackName = 'title' | 'story' | 'finale' | 'credits' | 'hub' | 'valley' | 'town' | 'jazz';

/**
 * Which piece each area plays. One each; the valley's is the title waltz and the stage's the story
 * underscore, since the Suno credits ran out before those two. A missing file falls back to the synth.
 */
export const AREA_PIECE: Record<string, TrackName> = { hub: 'hub', valley: 'title', town: 'town', jazz: 'jazz', stage: 'story' };

const LEVEL: Record<TrackName, number> = { title: 0.55, story: 0.4, finale: 0.7, credits: 0.5, hub: 0.5, valley: 0.5, town: 0.5, jazz: 0.5 };
/** An area piece sits lower than the same piece on the title or the results. */
const AREA_LEVEL = 0.75;

interface Slot {
  el: HTMLAudioElement;
  filter: BiquadFilterNode;
  gain: GainNode;
  level: number;
  failed: boolean;
}

export class Tracks {
  private static _instance: Tracks | null = null;
  static get(): Tracks {
    if (!Tracks._instance) {
      Tracks._instance = new Tracks();
      if (import.meta.env.DEV) (window as unknown as { __lkTracks: Tracks }).__lkTracks = Tracks._instance;
    }
    return Tracks._instance;
  }

  private slots = new Map<TrackName, Slot>();
  /** The pieces meant to be sounding now; a late play() after a stop() checks this. */
  private wanted = new Set<TrackName>();
  private retry: (() => void) | null = null;
  /** The area's piece, kept through the story card and the map; stop() leaves it alone. */
  area: TrackName | null = null;
  /** Stepped aside for a prompt or lesson. */
  paused = false;
  private life = 1;

  /** What is playing, for the headless checks. */
  get playing(): TrackName[] {
    return [...this.slots].filter(([n, s]) => !s.el.paused && this.wanted.has(n)).map(([n]) => n);
  }

  /** Start a piece from the top, fading in; a piece already sounding is left running. `then`: a piece to follow it when it ends. */
  play(name: TrackName, opts: { loop?: boolean; fade?: number; then?: TrackName; level?: number } = {}): void {
    const engine = AudioEngine.get();
    const s = this.slot(name);
    const fade = (opts.fade ?? 600) / 1000;
    const already = this.wanted.has(name) && !s.el.paused;
    this.wanted.add(name);
    s.level = LEVEL[name] * (opts.level ?? 1);
    s.el.loop = !!opts.loop && !opts.then;
    s.el.onended = opts.then ? () => this.play(opts.then!, { loop: true, fade: 1200 }) : null;
    this.ramp(s, this.paused ? 0 : s.level, already ? 0.3 : fade, already ? engine.now : undefined, !already);
    if (already) return;
    s.el.currentTime = 0;
    void engine.unlock().catch(() => undefined);
    s.el.play().catch(() => {
      // Before the first gesture the browser refuses; try again on the first click or key, if still wanted.
      if (this.retry) return;
      const again = () => {
        this.retry = null;
        window.removeEventListener('pointerdown', again);
        window.removeEventListener('keydown', again);
        if (this.wanted.has(name)) this.play(name, opts);
      };
      this.retry = again;
      window.addEventListener('pointerdown', again);
      window.addEventListener('keydown', again);
    });
  }

  /** The area's background. Resolves false when its file is missing, so the caller can fall back to the synth. */
  playArea(name: TrackName): Promise<boolean> {
    const s = this.slot(name);
    if (s.failed) return Promise.resolve(false);
    if (this.area && this.area !== name) this.stopArea();
    this.area = name;
    this.play(name, { loop: true, fade: 1200, level: AREA_LEVEL });
    return new Promise((resolve) => {
      if (s.el.readyState >= 3) return resolve(true);
      const done = (ok: boolean) => {
        s.el.removeEventListener('canplay', onOk);
        s.el.removeEventListener('error', onErr);
        if (!ok) {
          s.failed = true;
          if (this.area === name) this.area = null;
          this.wanted.delete(name);
        }
        resolve(ok);
      };
      const onOk = () => done(true);
      const onErr = () => done(false);
      s.el.addEventListener('canplay', onOk);
      s.el.addEventListener('error', onErr);
    });
  }

  stopArea(fade = 900): void {
    const a = this.area;
    this.area = null;
    if (a) this.stop(a, fade);
  }

  /** Fade a piece out and pause it. The area's own piece is left to stopArea. */
  stop(name: TrackName, fade = 600): void {
    if (name === this.area) return;
    this.wanted.delete(name);
    const s = this.slots.get(name);
    if (!s) return;
    s.el.onended = null;
    this.ramp(s, 0, fade / 1000);
    const el = s.el;
    window.setTimeout(() => {
      if (!this.wanted.has(name)) el.pause();
    }, fade + 50);
  }

  stopAll(fade = 600): void {
    this.area = null;
    for (const name of this.slots.keys()) this.stop(name, fade);
  }

  /** Step aside while a door or lesson listens, and back after. The piece keeps running underneath. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const name of this.wanted) {
      const s = this.slots.get(name);
      if (s) this.ramp(s, paused ? 0 : s.level, paused ? 0.25 : 1.2);
    }
  }

  /** 0 grey .. 1 full colour: the filter opens with the area. */
  setLife(life: number): void {
    const l = Math.max(0, Math.min(1, life));
    if (Math.abs(l - this.life) < 0.01) return;
    this.life = l;
    const engine = AudioEngine.get();
    for (const s of this.slots.values()) s.filter.frequency.setTargetAtTime(this.cutoff(), engine.now, 0.8);
  }

  private cutoff(): number {
    return 700 * Math.pow(28, this.life);
  }

  private ramp(s: Slot, to: number, seconds: number, from?: number, fromZero = false): void {
    const engine = AudioEngine.get();
    const now = from ?? engine.now;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(fromZero ? 0 : s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  private slot(name: TrackName): Slot {
    let s = this.slots.get(name);
    if (s) return s;
    const engine = AudioEngine.get();
    const el = new Audio(`music/${name}.mp3`);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.cutoff();
    filter.Q.value = 0.5;
    const gain = engine.ctx.createGain();
    gain.gain.value = 0;
    engine.ctx.createMediaElementSource(el).connect(filter).connect(gain).connect(engine.master);
    s = { el, filter, gain, level: LEVEL[name], failed: false };
    this.slots.set(name, s);
    return s;
  }
}

import { AudioEngine } from './engine';

/**
 * The recorded pieces (public/music/*.mp3): the title, the story cards and the map, the finale and
 * the credits. They play only where no note is being asked for, so a fixed key never sits under a
 * question: the area music stays the synth, which follows each puzzle's key.
 *
 * Each piece is an audio element routed through the engine's master, so the mic duck and the master
 * level apply to it as to everything else. Starting a piece before the player's first gesture is
 * refused by the browser; the title retries on the first click or key.
 */
export type TrackName = 'title' | 'story' | 'finale' | 'credits';

const LEVEL: Record<TrackName, number> = { title: 0.55, story: 0.4, finale: 0.7, credits: 0.55 };

interface Slot {
  el: HTMLAudioElement;
  gain: GainNode;
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

  /** What is playing, for the headless checks. */
  get playing(): TrackName[] {
    return [...this.slots].filter(([, s]) => !s.el.paused).map(([n]) => n);
  }

  /** Start a piece from the top, fading in. `then`: a piece to follow it when it ends (it does not loop then). */
  play(name: TrackName, opts: { loop?: boolean; fade?: number; then?: TrackName } = {}): void {
    const engine = AudioEngine.get();
    const s = this.slot(name);
    const fade = (opts.fade ?? 600) / 1000;
    this.wanted.add(name);
    s.el.loop = !!opts.loop && !opts.then;
    s.el.onended = opts.then ? () => this.play(opts.then!, { loop: true, fade: 1200 }) : null;
    s.el.currentTime = 0;
    s.gain.gain.cancelScheduledValues(engine.now);
    s.gain.gain.setValueAtTime(0, engine.now);
    s.gain.gain.linearRampToValueAtTime(LEVEL[name], engine.now + fade);
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

  /** Fade a piece out and pause it. */
  stop(name: TrackName, fade = 600): void {
    this.wanted.delete(name);
    const s = this.slots.get(name);
    if (!s) return;
    const engine = AudioEngine.get();
    s.el.onended = null;
    s.gain.gain.cancelScheduledValues(engine.now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, engine.now);
    s.gain.gain.linearRampToValueAtTime(0, engine.now + fade / 1000);
    const el = s.el;
    window.setTimeout(() => {
      if (!this.wanted.has(name)) el.pause();
    }, fade + 50);
  }

  stopAll(fade = 600): void {
    for (const name of this.slots.keys()) this.stop(name, fade);
  }

  private slot(name: TrackName): Slot {
    let s = this.slots.get(name);
    if (s) return s;
    const engine = AudioEngine.get();
    const el = new Audio(`music/${name}.mp3`);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const gain = engine.ctx.createGain();
    gain.gain.value = 0;
    engine.ctx.createMediaElementSource(el).connect(gain).connect(engine.master);
    s = { el, gain };
    this.slots.set(name, s);
    return s;
  }
}

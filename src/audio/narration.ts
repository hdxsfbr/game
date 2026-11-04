import { AudioEngine } from './engine';

/**
 * The bench guides' narration clips (public/narration/<bench>-<n>.mp3), played through the Web Audio
 * engine rather than a media element: a phone lets a media element start only from inside a tap, so
 * the guide's own timers could not start the second clip, while the engine, once unlocked by the first
 * tap, plays whatever it is given. Clips are fetched and decoded once and kept.
 */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`narration/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((data) => AudioEngine.get().ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

/** Fetch and decode a bench's clips ahead of time, so each step speaks the moment it is reached. */
export function preloadNarration(bench: string, count: number): void {
  for (let i = 0; i < count; i++) void load(`${bench}-${i}`);
}

export interface Speech {
  /** Resolves when the clip ends, or at once when there is no clip to play. */
  done: Promise<void>;
  stop(): void;
}

/** Say one clip. A clip that is missing or will not decode counts as already said. */
export function speak(bench: string, i: number): Speech {
  const engine = AudioEngine.get();
  void engine.unlock();
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let finish = () => undefined as void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
    void load(`${bench}-${i}`).then((buf) => {
      if (stopped || !buf) return resolve();
      source = engine.ctx.createBufferSource();
      source.buffer = buf;
      source.connect(engine.master);
      source.onended = () => resolve();
      source.start();
    });
  });
  return {
    done,
    stop() {
      stopped = true;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // Already ended.
        }
        source = null;
      }
      finish();
    },
  };
}

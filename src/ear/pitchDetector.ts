import { PitchDetector as Pitchy } from 'pitchy';
import { AudioEngine } from '../audio/engine';
import { median } from './pitchMath';

export interface PitchFrame {
  /** Smoothed fundamental in Hz, or null when unvoiced. */
  hz: number | null;
  /** Raw detector output before smoothing, or null. */
  rawHz: number | null;
  /** 0..1 confidence from the detector. */
  clarity: number;
  /** RMS level 0..1. */
  rms: number;
}

export interface DetectorOptions {
  /** FFT/analysis window size. Default 2048. */
  bufferSize: number;
  /** Minimum clarity to accept a frame. Default 0.9. */
  minClarity: number;
  /** Minimum RMS to accept a frame. Default 0.01. */
  minRms: number;
  /** Median window in frames. Default 5. */
  medianFrames: number;
  /** Ignore frequencies outside this range (Hz). */
  minHz: number;
  maxHz: number;
}

export const DEFAULT_DETECTOR: DetectorOptions = {
  bufferSize: 2048,
  minClarity: 0.9,
  minRms: 0.01,
  medianFrames: 5,
  minHz: 60,
  maxHz: 1200,
};

export type MicStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'error';

/**
 * Wraps getUserMedia + AnalyserNode + pitchy.
 * Call `start()` from a user gesture. Then call `read()` once per animation frame.
 */
export class MicPitchDetector {
  status: MicStatus = 'idle';
  lastError: string | null = null;
  readonly opts: DetectorOptions;

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private detector: Pitchy<Float32Array<ArrayBuffer>> | null = null;
  private recent: number[] = [];

  constructor(opts: Partial<DetectorOptions> = {}) {
    this.opts = { ...DEFAULT_DETECTOR, ...opts };
  }

  get isLive(): boolean {
    return this.status === 'live';
  }

  async start(): Promise<boolean> {
    if (this.status === 'live') return true;
    this.status = 'requesting';
    const engine = AudioEngine.get();
    await engine.unlock();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'error';
      this.lastError = window.isSecureContext
        ? 'This browser does not support microphone input.'
        : 'Microphone needs a secure page: open the game over HTTPS or on localhost.';
      console.error('[mic]', this.lastError);
      return false;
    }

    const constraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      } catch (e) {
        if ((e as DOMException).name === 'OverconstrainedError') {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else throw e;
      }
    } catch (e) {
      const err = e as DOMException;
      this.status = err.name === 'NotAllowedError' ? 'denied' : 'error';
      this.lastError = `${err.name}: ${err.message}`;
      console.error('[mic]', this.lastError, err);
      return false;
    }

    const { ctx } = engine;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = this.opts.bufferSize;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.detector = Pitchy.forFloat32Array(this.analyser.fftSize);
    this.recent = [];
    this.status = 'live';
    return true;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.status = 'idle';
    this.recent = [];
  }

  /** Current settings reported by the browser, for the diagnostics view. */
  trackSettings(): MediaTrackSettings | null {
    const track = this.stream?.getAudioTracks()[0];
    return track ? track.getSettings() : null;
  }

  read(): PitchFrame {
    if (!this.analyser || !this.buffer || !this.detector) {
      return { hz: null, rawHz: null, clarity: 0, rms: 0 };
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    const rms = Math.sqrt(sum / this.buffer.length);

    const [pitch, clarity] = this.detector.findPitch(this.buffer, AudioEngine.get().ctx.sampleRate);
    const voiced =
      rms >= this.opts.minRms && clarity >= this.opts.minClarity && pitch >= this.opts.minHz && pitch <= this.opts.maxHz;

    if (!voiced) {
      this.recent = [];
      return { hz: null, rawHz: Number.isFinite(pitch) ? pitch : null, clarity, rms };
    }
    this.recent.push(pitch);
    if (this.recent.length > this.opts.medianFrames) this.recent.shift();
    return { hz: median(this.recent), rawHz: pitch, clarity, rms };
  }
}

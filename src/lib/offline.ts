import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
  type InputVideoTrack,
  type WrappedCanvas,
} from 'mediabunny';
import type { Timeline } from './timeline';

const SAMPLE_RATE = 48000;
const MAX_VIDEO_SIDE = 1080; // decoded background frames are scaled down to this
const JUMP_RESTART = 2; // seconds; a forward jump bigger than this re-seeks instead of decoding through

/** Sync best-effort check: WebCodecs exists. renderOffline also verifies H.264/AAC support. */
export function canExportOffline(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  );
}

/**
 * Mix every segment at its start into one stereo 48kHz buffer of timeline.duration seconds,
 * with the same 0.8s fade-out as live playback when the last ayah is cut.
 */
export async function mixTimeline(timeline: Timeline): Promise<AudioBuffer> {
  const { duration } = timeline;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  for (const s of timeline.segments) {
    if (s.start >= duration) continue;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.connect(gain);
    src.start(s.start);
    src.stop(Math.min(s.end, duration));
  }
  if (timeline.cut) {
    gain.gain.setValueAtTime(1, Math.max(0, duration - 0.8));
    gain.gain.linearRampToValueAtTime(0, duration);
  }
  return ctx.startRendering();
}

export interface FrameRequest {
  video: number;
  time: number;
}
export interface Frame {
  src: CanvasImageSource;
  w: number;
  h: number;
}

export interface OfflineOptions {
  width: number;
  height: number;
  fps?: number;
  duration: number;
  audio: AudioBuffer;
  videos: string[];
  plan: (t: number) => FrameRequest[];
  draw: (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    t: number,
    frames: (Frame | null)[],
  ) => void;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
  videoBitrate?: number;
}

/** A decoded background video; shared by all readers of that video. */
interface Source {
  input: Input;
  track: InputVideoTrack;
  start: number; // first timestamp
  length: number; // loop length in seconds
  w: number;
  h: number;
}

/**
 * Sequential frame reader for one video. Keeps a forward iterator and only re-seeks when
 * the requested time goes backwards (loop) or jumps far ahead.
 */
class Reader {
  private sink: CanvasSink;
  private iter: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private cur: WrappedCanvas | null = null;
  private next: WrappedCanvas | null = null;
  private done = false;
  private src: Source;
  failed = false;

  constructor(src: Source) {
    this.src = src;
    // Pool of 3 > the 2 canvases we hold (cur + next), so a held canvas is never overwritten.
    this.sink = new CanvasSink(src.track, { width: src.w, height: src.h, fit: 'fill', poolSize: 3 });
  }

  async get(time: number): Promise<Frame | null> {
    if (this.failed) return null;
    try {
      const { start, length, w, h } = this.src;
      const local = start + (length > 0 ? ((time % length) + length) % length : 0);
      const at = this.cur?.timestamp;
      if (!this.iter || at === undefined || local < at - 1e-3 || local > at + JUMP_RESTART) await this.seek(local);
      // Advance while the following frame starts at or before `local`.
      for (;;) {
        if (!this.next && !this.done) {
          const r = await this.iter!.next();
          if (r.done) this.done = true;
          else this.next = r.value;
        }
        if (this.next && (!this.cur || this.next.timestamp <= local + 1e-6)) {
          this.cur = this.next;
          this.next = null;
        } else break;
      }
      return this.cur ? { src: this.cur.canvas, w, h } : null;
    } catch (err) {
      console.warn('Background video decode failed; drawing without it.', err);
      this.failed = true;
      await this.close();
      return null;
    }
  }

  private async seek(local: number) {
    await this.iter?.return();
    this.cur = this.next = null;
    this.done = false;
    this.iter = this.sink.canvases(local);
  }

  async close() {
    const it = this.iter;
    this.iter = null;
    this.cur = this.next = null;
    try {
      await it?.return();
    } catch {
      /* already finished */
    }
  }
}

async function openSource(url: string): Promise<Source | null> {
  let input: Input | null = null;
  try {
    const blob = await (await fetch(url)).blob();
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('No decodable video track');
    const [start, end, dw, dh] = await Promise.all([
      track.getFirstTimestamp(),
      track.computeDuration(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);
    const scale = Math.min(1, MAX_VIDEO_SIDE / Math.max(dw, dh));
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    return { input, track, start, length: end - start, w: even(dw), h: even(dh) };
  } catch (err) {
    console.warn(`Couldn't open background video ${url}`, err);
    input?.dispose();
    return null;
  }
}

/** Yield to the event loop. MessageChannel isn't throttled in background tabs like setTimeout. */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

/**
 * Render the reel frame by frame at t = i/fps (not real time) and mux H.264 + AAC into an MP4.
 * Faster than real time on most machines, and immune to tab throttling / dropped frames.
 */
export async function renderOffline(opts: OfflineOptions): Promise<{ blob: Blob; ext: 'mp4' }> {
  const { width, height, duration, audio, plan, draw, onProgress, signal } = opts;
  const fps = opts.fps ?? 30;
  const videoBitrate = opts.videoBitrate ?? 6_000_000;
  const cancelled = () => new Error('cancelled');
  if (signal?.aborted) throw cancelled();
  if (width % 2 || height % 2) throw new Error('Width and height must be even for H.264.');

  const videoQuality = new Quality({ bitrate: videoBitrate });
  const audioQuality = new Quality({ bitrate: 160_000 });
  if (
    !canExportOffline() ||
    !(await canEncodeVideo('avc', { width, height, quality: videoQuality })) ||
    !(await canEncodeAudio('aac', { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, quality: audioQuality }))
  ) {
    throw new Error("This browser can't encode H.264/AAC video.");
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: videoQuality,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  });
  const audioSource = new AudioBufferSource({ codec: 'aac', quality: audioQuality });
  output.addVideoTrack(videoSource, { frameRate: fps });
  output.addAudioTrack(audioSource);

  const sources = await Promise.all(opts.videos.map(openSource));
  const readers = new Map<string, Reader>(); // key: `${video}:${nth request of that video in the frame}`
  const total = Math.max(1, Math.round(duration * fps));
  let finished = false;

  try {
    if (signal?.aborted) throw cancelled();
    await output.start();
    // Whole audio up front: AAC for a few minutes is tiny, and the muxer interleaves on finalize.
    await audioSource.add(audio);
    audioSource.close();

    let lastYield = performance.now();
    let lastProgress = 0;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw cancelled();
      const t = i / fps;

      const seen = new Map<number, number>();
      const frames = await Promise.all(
        plan(t).map((req) => {
          const src = sources[req.video];
          if (!src) return null;
          const nth = seen.get(req.video) ?? 0;
          seen.set(req.video, nth + 1);
          const key = `${req.video}:${nth}`;
          let reader = readers.get(key);
          if (!reader) readers.set(key, (reader = new Reader(src)));
          return reader.get(req.time);
        }),
      );

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      draw(ctx, t, frames);
      ctx.restore();

      await videoSource.add(t, 1 / fps); // awaits encoder/muxer backpressure

      const now = performance.now();
      if (onProgress && now - lastProgress > 100) {
        lastProgress = now;
        onProgress((i + 1) / total);
      }
      if (now - lastYield > 30) {
        await yieldToLoop();
        lastYield = performance.now();
      }
    }

    if (signal?.aborted) throw cancelled();
    videoSource.close();
    await output.finalize();
    finished = true;
    onProgress?.(1);
    const buffer = (output.target as BufferTarget).buffer!;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), ext: 'mp4' };
  } finally {
    if (!finished) await output.cancel().catch(() => {});
    await Promise.all([...readers.values()].map((r) => r.close()));
    sources.forEach((s) => s?.input.dispose());
  }
}

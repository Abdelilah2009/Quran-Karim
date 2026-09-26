import { getAudioContext } from './audio';
import type { Timeline } from './timeline';

export interface Playback {
  /** Current reel time in seconds, driven by the audio clock. */
  time(): number;
  stop(): void;
  done: Promise<void>;
}

/**
 * Schedule every ayah buffer back-to-back on the AudioContext clock. The audio
 * clock (not setTimeout / rAF) is the source of truth, so text stays in sync
 * with the recitation even if frames drop.
 */
export function playTimeline(timeline: Timeline, extraDest?: AudioNode): Playback {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  if (extraDest) gain.connect(extraDest);

  const t0 = ctx.currentTime + 0.2;
  const end = t0 + timeline.duration;
  const sources = timeline.segments.map((s) => {
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.connect(gain);
    src.start(t0 + s.start);
    src.stop(Math.min(t0 + s.end, end));
    return src;
  });
  if (timeline.cut) {
    gain.gain.setValueAtTime(1, end - 0.8);
    gain.gain.linearRampToValueAtTime(0, end);
  }

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const timer = setInterval(() => ctx.currentTime >= end && finish(), 50);
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    gain.disconnect();
    resolve();
  }

  return { time: () => ctx.currentTime - t0, stop: finish, done };
}

function pickMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/**
 * Record the canvas + recitation in real time. A 60s reel takes ~60s to
 * export; the tab must stay visible or the browser throttles frames.
 */
export async function recordReel(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  onStart: (p: Playback) => void,
): Promise<{ blob: Blob; ext: string }> {
  const ctx = getAudioContext();
  const audioDest = ctx.createMediaStreamDestination();
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  rec.start(250);
  const playback = playTimeline(timeline, audioDest);
  onStart(playback);
  await playback.done;
  await new Promise((r) => setTimeout(r, 300)); // let the final black frame land
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const type = rec.mimeType || mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

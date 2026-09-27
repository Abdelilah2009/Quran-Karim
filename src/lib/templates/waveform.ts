import { drawHeader, drawIntro, drawOutro, drawProgress, drawVerse } from '../draw';
import type { FrameInfo, Template } from './types';

const RATE = 60; // envelope windows per second
const envCache = new WeakMap<AudioBuffer, Float32Array>();

// Loudness per 1/60 s window (RMS of channel 0, strided), normalised to 0..1.
function envelope(buffer: AudioBuffer): Float32Array {
  const hit = envCache.get(buffer);
  if (hit) return hit;
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.floor(buffer.sampleRate / RATE));
  const stride = Math.max(1, Math.floor(win / 160));
  const env = new Float32Array(Math.ceil(data.length / win));
  let peak = 0;
  for (let w = 0; w < env.length; w++) {
    const end = Math.min(data.length, (w + 1) * win);
    let sum = 0;
    let n = 0;
    for (let i = w * win; i < end; i += stride, n++) sum += data[i] * data[i];
    env[w] = n ? Math.sqrt(sum / n) : 0;
    if (env[w] > peak) peak = env[w];
  }
  // Leave headroom at the top and lift quiet passages a little.
  const ref = peak * 0.95 || 1;
  for (let w = 0; w < env.length; w++) env[w] = Math.min(1, env[w] / ref) ** 0.9;
  envCache.set(buffer, env);
  return env;
}

// Envelope at time `s`, averaged over ~80 ms so the bars don't flicker.
function levelAt(env: Float32Array, s: number): number {
  const c = s * RATE;
  let sum = 0;
  for (let d = -2; d <= 2; d++) {
    const i = Math.floor(c) + d;
    if (i >= 0 && i < env.length) sum += env[i];
  }
  return sum / 5;
}

// Fixed per-bar texture (deterministic pseudo-random in 0..1).
const grain = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Symmetric bars around (cx, cy); the centre is "now", older levels ripple outward. */
function drawBars(f: FrameInfo, cx: number, cy: number, width: number, maxHalf: number) {
  const { ctx, t, style, idle, seg, phase } = f;
  const n = f.W > f.H ? 64 : 44;
  const half = n / 2;
  const step = width / n;
  const barW = Math.max(4, step * 0.56);
  const env = !idle && phase === 'verse' && seg ? envelope(seg.buffer) : null;
  const rest = maxHalf * 0.05;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const side = i < half ? half - 1 - i : i - half; // 0 at the centre
    const d = side / (half - 1);
    const bell = 1 - 0.55 * d * d;
    const tex = 0.72 + 0.28 * grain(side);
    const idleWave = 0.06 + 0.04 * Math.sin(t * 2.2 - side * 0.45);
    let lvl: number;
    if (idle) lvl = 0.15 + 0.7 * Math.abs(Math.sin(side * 0.7 + 0.4)) * bell * tex;
    else if (env) {
      const live = levelAt(env, f.local - d * 0.9) * bell * tex;
      lvl = Math.max(idleWave, live * (0.9 + 0.1 * Math.sin(t * 7 + side)));
    } else lvl = idleWave;
    const h = rest + lvl * (maxHalf - rest);
    const x = cx - width / 2 + (i + 0.5) * step - barW / 2;
    ctx.roundRect(x, cy - h, barW, h * 2, barW / 2);
  }
  const g = ctx.createLinearGradient(0, cy - maxHalf, 0, cy + maxHalf);
  g.addColorStop(0, style.accentColor);
  g.addColorStop(0.5, style.highlightColor);
  g.addColorStop(1, style.accentColor);
  ctx.fillStyle = g;
  ctx.globalAlpha = phase === 'verse' ? 1 : 0.55;
  ctx.shadowColor = style.accentColor;
  ctx.shadowBlur = 28;
  ctx.fill();
  // Crisp second pass without the glow so the bars stay sharp.
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.6;
  ctx.fill();
  ctx.restore();
}

function layout(W: number, H: number, header: boolean) {
  const tall = H / W > 1.6;
  const top = header ? H * 0.12 + 140 : H * 0.07;
  const maxHalf = tall ? H * 0.085 : H * 0.075;
  const cy = tall ? H * 0.34 : top + maxHalf + H * 0.03;
  return { cy, maxHalf, width: Math.min(W * 0.82, 1400) };
}

// Resting bars during the title/outro cards, clear of the centered text.
const drawCardBars = (f: FrameInfo) => drawBars(f, f.W / 2, f.H * 0.78, Math.min(f.W * 0.7, 1200), f.H * 0.05);

export const waveform: Template = {
  id: 'waveform',
  name: 'Waveform',
  description: 'The recitation as a moving waveform, the verse beneath.',
  defaults: { showHeader: true },
  draw(f) {
    const { ctx, W, H, style, meta, timeline, phase } = f;
    if (phase === 'intro') {
      drawCardBars(f);
      drawIntro(ctx, f.t, timeline, meta, style);
    } else if (phase === 'outro') {
      drawCardBars(f);
      if (style.outro) drawOutro(ctx, f.t - f.audioEnd, style);
    } else {
      if (style.showHeader) drawHeader(ctx, meta, style);
      const { cy, maxHalf, width } = layout(W, H, style.showHeader);
      drawBars(f, W / 2, cy, width, maxHalf);
      if (f.seg) {
        const top = cy + maxHalf + H * 0.04;
        drawVerse(ctx, f.seg, f.local, style, f.idle, { top, bottom: H * 0.9, y: (top + H * 0.9) / 2 });
      }
    }
    if (style.showProgress) drawProgress(ctx, f.t, timeline, style.accentColor);
  },
};

import { beginFrame, type Background, type Ctx, type Layer, type Meta, type Style } from './draw';
import { BASMALA } from './quran';
import { getTemplate, type FrameInfo } from './templates';
import type { Timeline } from './timeline';

export * from './draw';

let W = 1080;
let H = 1920;

// ---------- background ----------

function drawLayer(ctx: Ctx, { src, w, h, alpha }: Layer, t: number, style: Style) {
  if (!w || !h || alpha <= 0) return;
  let scale = Math.max(W / w, H / h);
  let dx = 0;
  let dy = 0;
  if (style.kenBurns) {
    scale *= 1.1 + 0.04 * Math.sin(t * 0.13);
    dx = Math.sin(t * 0.07) * W * 0.02;
    dy = Math.cos(t * 0.09) * H * 0.015;
  }
  // Blur samples past the edges; overscan so the borders don't go dark.
  if (style.blur > 0) scale *= 1 + (style.blur * 4) / Math.min(W, H);
  const dw = w * scale;
  const dh = h * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (style.blur > 0) ctx.filter = `blur(${style.blur}px)`;
  ctx.drawImage(src, (W - dw) / 2 + dx, (H - dh) / 2 + dy, dw, dh);
  ctx.restore();
}

function drawGradient(ctx: Ctx, [a, b]: [string, string], t: number) {
  const ang = t * 0.15;
  const dx = Math.cos(ang) * H * 0.6;
  const dy = Math.sin(ang) * H * 0.6;
  const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Soft drifting light particles (deterministic, so export == preview).
  ctx.save();
  for (let i = 0; i < 40; i++) {
    const seed = Math.sin(i * 91.7) * 10000;
    const r = seed - Math.floor(seed);
    const x = (r * W + Math.sin(t * 0.3 + i) * 40 + W) % W;
    const y = (H - ((t * (15 + r * 30) + r * H * 3) % (H + 40))) | 0;
    ctx.globalAlpha = 0.08 + r * 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2 + r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx: Ctx, bg: Background, t: number, style: Style) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (bg.kind === 'gradient') drawGradient(ctx, bg.colors, t);
  else bg.layers.forEach((l) => drawLayer(ctx, l, t, style));
}

// ---------- frame ----------

// Shown in the editor before any recitation is loaded, so styles are visible.
let sample: Timeline | null = null;
function sampleTimeline(): Timeline {
  if (!sample) {
    const buffer = new AudioBuffer({ length: 48000 * 5, sampleRate: 48000 });
    sample = {
      segments: [{ surah: 1, ayah: 1, text: BASMALA, buffer, start: 0, end: 5 }],
      duration: 5,
      cut: false,
      intro: 0,
      outro: 0,
    };
  }
  return sample;
}

/**
 * Draw one frame at reel time `t`: background, dim, then the style's template.
 * `idle` shows a static sample (first verse, fully visible) for the editor
 * preview when nothing is playing.
 */
export function drawFrame(
  ctx: Ctx,
  t: number,
  timeline: Timeline | null,
  bg: Background,
  style: Style,
  meta: Meta,
  bgTime = t,
  idle = false,
) {
  beginFrame(ctx);
  W = ctx.canvas.width;
  H = ctx.canvas.height;
  drawBackground(ctx, bg, bgTime, style);
  ctx.fillStyle = `rgba(0,0,0,${style.overlay})`;
  ctx.fillRect(0, 0, W, H);

  const tl = timeline ?? sampleTimeline();
  const still = idle || !timeline;
  const audioEnd = tl.duration - tl.outro;
  const phase = !still && tl.intro > 0 && t < tl.intro ? 'intro' : !still && tl.outro > 0 && t >= audioEnd ? 'outro' : 'verse';
  const seg = phase !== 'verse' ? null : still ? tl.segments[0] : (tl.segments.find((s) => t >= s.start && t < s.end) ?? null);
  const template = getTemplate(style.template);
  const f: FrameInfo = { ctx, W, H, t, idle: still, timeline: tl, style, meta, phase, seg, local: seg ? (still ? 0 : t - seg.start) : 0, audioEnd };
  ctx.save();
  template.draw(f);
  ctx.restore();

  // Fade to black over the last 0.6s.
  const tail = tl.duration - t;
  if (!still && tail < 0.6 && t > 0) {
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, tail) / 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (style.watermark) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `32px "Noto Naskh Arabic", sans-serif`;
    ctx.fillText(style.watermark, W / 2, H * (template.watermarkY ?? 0.953));
    ctx.restore();
  }
}

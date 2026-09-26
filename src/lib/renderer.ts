import type { ClipState } from './playlist';
import { toArabicDigits } from './quran';
import type { Segment, Timeline } from './timeline';

export const W = 1080;
export const H = 1920;

export interface Style {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  accentColor: string;
  overlay: number; // 0..1 darkening over the background
  position: 'center' | 'lower';
  translationFont: string;
  showTranslation: boolean;
  showHeader: boolean;
  showAyahNumber: boolean;
  showProgress: boolean;
  watermark: string;
}

export type Background =
  | { kind: 'gradient'; colors: [string, string] }
  | { kind: 'video'; el: HTMLVideoElement }
  | { kind: 'image'; el: HTMLImageElement }
  | { kind: 'playlist'; els: HTMLVideoElement[]; clip: ClipState };

export interface Meta {
  surahName: string;
  reciterName: string;
}

const FADE_IN = 0.35;
const FADE_OUT = 0.25;
const MAX_LINES = 5;
const TEXT_WIDTH = W * 0.84;

// ---------- background ----------

function drawCover(ctx: CanvasRenderingContext2D, el: CanvasImageSource, sw: number, sh: number) {
  if (!sw || !sh) return;
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawGradient(ctx: CanvasRenderingContext2D, [a, b]: [string, string], t: number) {
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

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, t: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (bg.kind === 'gradient') drawGradient(ctx, bg.colors, t);
  else if (bg.kind === 'video') drawCover(ctx, bg.el, bg.el.videoWidth, bg.el.videoHeight);
  else if (bg.kind === 'image') drawCover(ctx, bg.el, bg.el.naturalWidth, bg.el.naturalHeight);
  else {
    const cur = bg.els[bg.clip.index];
    drawCover(ctx, cur, cur.videoWidth, cur.videoHeight);
    if (bg.clip.mix > 0) {
      const next = bg.els[bg.clip.next];
      ctx.save();
      ctx.globalAlpha = bg.clip.mix;
      drawCover(ctx, next, next.videoWidth, next.videoHeight);
      ctx.restore();
    }
  }
}

// ---------- text layout ----------

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

interface Page {
  lines: string[];
  fontSize: number;
  from: number; // fraction 0..1 of the segment duration
  to: number;
}

const layoutCache = new Map<string, Page[]>();

// Shrink the font down to 70% to fit; if the ayah is still too long, split it
// into pages timed by word count (a rough proxy for recitation time).
function layoutAyah(ctx: CanvasRenderingContext2D, text: string, style: Style): Page[] {
  const key = `${style.fontFamily}|${style.fontSize}|${text}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;

  let size = style.fontSize;
  let lines: string[] = [];
  for (; size >= style.fontSize * 0.7; size -= 4) {
    ctx.font = `${size}px "${style.fontFamily}"`;
    lines = wrap(ctx, text, TEXT_WIDTH);
    if (lines.length <= MAX_LINES) break;
  }
  size = Math.max(size, style.fontSize * 0.7);

  const totalWords = text.split(/\s+/).length;
  const pages: Page[] = [];
  let done = 0;
  for (let i = 0; i < lines.length; i += MAX_LINES) {
    const chunk = lines.slice(i, i + MAX_LINES);
    const words = chunk.join(' ').split(/\s+/).length;
    pages.push({ lines: chunk, fontSize: size, from: done / totalWords, to: (done + words) / totalWords });
    done += words;
  }
  pages[pages.length - 1].to = 1;
  layoutCache.set(key, pages);
  return pages;
}

function fadeAlpha(local: number, len: number): number {
  return Math.max(0, Math.min(1, local / FADE_IN, (len - local) / FADE_OUT));
}

function drawSegment(ctx: CanvasRenderingContext2D, seg: Segment, t: number, style: Style) {
  const segLen = seg.end - seg.start;
  const p = (t - seg.start) / segLen;
  const text =
    style.showAyahNumber && seg.ayah > 0 ? `${seg.text} ﴿${toArabicDigits(seg.ayah)}﴾` : seg.text;
  const pages = layoutAyah(ctx, text, style);
  const page = pages.find((pg) => p >= pg.from && p < pg.to) ?? pages[pages.length - 1];
  const pageStart = seg.start + page.from * segLen;
  const pageLen = (page.to - page.from) * segLen;
  const alpha = fadeAlpha(t - pageStart, pageLen);

  const lineH = page.fontSize * 1.75;
  let transLines: string[] = [];
  const transSize = 38;
  if (style.showTranslation && seg.translation) {
    ctx.font = `${transSize}px "${style.translationFont}"`;
    transLines = wrap(ctx, seg.translation, TEXT_WIDTH).slice(0, 6);
  }
  const transH = transLines.length ? transLines.length * transSize * 1.4 + 50 : 0;
  const blockH = page.lines.length * lineH + transH;
  const centerY = style.position === 'center' ? H / 2 : H * 0.66;
  let y = centerY - blockH / 2 + lineH / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;

  ctx.direction = 'rtl';
  ctx.fillStyle = style.textColor;
  ctx.font = `${page.fontSize}px "${style.fontFamily}"`;
  for (const line of page.lines) {
    ctx.fillText(line, W / 2, y);
    y += lineH;
  }

  if (transLines.length) {
    y += 50 - lineH / 2 + (transSize * 1.4) / 2;
    ctx.direction = 'ltr';
    ctx.font = `${transSize}px "${style.translationFont}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const line of transLines) {
      ctx.fillText(line, W / 2, y);
      y += transSize * 1.4;
    }
  }
  ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D, meta: Meta, style: Style) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = style.accentColor;
  ctx.font = `64px "${style.fontFamily}"`;
  ctx.fillText(meta.surahName, W / 2, 230);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `36px "Noto Naskh Arabic"`;
  ctx.fillText(`بصوت القارئ ${meta.reciterName}`, W / 2, 310);
  ctx.restore();
}

// ---------- frame ----------

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  timeline: Timeline | null,
  bg: Background,
  style: Style,
  meta: Meta,
  bgTime = t,
) {
  drawBackground(ctx, bg, bgTime);
  ctx.fillStyle = `rgba(0,0,0,${style.overlay})`;
  ctx.fillRect(0, 0, W, H);

  if (style.showHeader) drawHeader(ctx, meta, style);

  if (timeline) {
    const seg =
      timeline.segments.find((s) => t >= s.start && t < s.end) ?? (t <= 0 ? timeline.segments[0] : null);
    if (seg) drawSegment(ctx, seg, Math.max(t, seg.start + FADE_IN), style);

    if (style.showProgress && timeline.duration > 0) {
      const w = (Math.min(t, timeline.duration) / timeline.duration) * (W - 160);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(80, H - 150, W - 160, 6);
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(W - 80 - w, H - 150, w, 6);
    }

    // Fade to black over the last 0.6s.
    const tail = timeline.duration - t;
    if (tail < 0.6 && t > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, tail) / 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (style.watermark) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `32px "Noto Naskh Arabic", sans-serif`;
    ctx.fillText(style.watermark, W / 2, H - 90);
    ctx.restore();
  }
}

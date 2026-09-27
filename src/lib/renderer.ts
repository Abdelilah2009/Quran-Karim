import { toArabicDigits } from './quran';
import type { Segment, Timeline } from './timeline';

export type Format = '9:16' | '4:5' | '1:1' | '16:9';
export type TextAnimation = 'fade' | 'slide' | 'zoom' | 'reveal';

export const FORMATS: Record<Format, { w: number; h: number; hint: string }> = {
  '9:16': { w: 1080, h: 1920, hint: 'Reels, TikTok, Shorts' },
  '4:5': { w: 1080, h: 1350, hint: 'Instagram feed' },
  '1:1': { w: 1080, h: 1080, hint: 'Square post' },
  '16:9': { w: 1920, h: 1080, hint: 'YouTube' },
};

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
  animation: TextAnimation;
  karaoke: boolean; // highlight each word as it is recited
  highlightColor: string;
  format: Format;
  intro: boolean; // title card before the first verse
  outro: string; // closing card text, '' = none
  blur: number; // background blur in px
  kenBurns: boolean; // slow zoom and drift on the background
}

/** One drawable background source; several layers crossfade in multi-clip mode. */
export interface Layer {
  src: CanvasImageSource;
  w: number;
  h: number;
  alpha: number;
}

export type Background = { kind: 'gradient'; colors: [string, string] } | { kind: 'layers'; layers: Layer[] };

export interface Meta {
  surahName: string;
  reciterName: string;
  part?: { index: number; total: number };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Canvas size of the frame being drawn; set at the top of drawFrame.
let W = 1080;
let H = 1920;

const FADE_IN = 0.35;
const FADE_OUT = 0.25;
const maxLines = () => (H >= 1900 ? 5 : H >= 1300 ? 4 : 3);
const textWidth = () => Math.min(W * 0.84, 1500);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const RTL = /[֐-ࣿ]/;

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

// ---------- text layout ----------

interface Token {
  text: string;
  start: number; // seconds from the segment start
  end: number;
  marker?: boolean; // the ﴿n﴾ verse number
}

interface Page {
  lines: number[][]; // token indices per line
  fontSize: number;
  first: number; // first token index
}

interface Layout {
  tokens: Token[];
  widths: number[];
  space: number;
  pages: Page[];
}

function wrapTokens(widths: number[], space: number, maxW: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let lw = 0;
  widths.forEach((w, i) => {
    const next = line.length ? lw + space + w : w;
    if (line.length && next > maxW) {
      lines.push(line);
      line = [i];
      lw = w;
    } else {
      line.push(i);
      lw = next;
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

// Real word timings when the reciter has them, otherwise spread by letter count
// (a rough proxy for recitation time).
function timeTokens(seg: Segment, texts: string[], showNumber: boolean): Token[] {
  const len = seg.buffer.duration;
  let tokens: Token[];
  if (seg.words?.length === texts.length) {
    tokens = seg.words.map((w) => ({ ...w }));
  } else {
    const total = texts.reduce((n, w) => n + w.length, 0) || 1;
    let done = 0;
    tokens = texts.map((text) => {
      const start = (done / total) * len;
      done += text.length;
      return { text, start, end: (done / total) * len };
    });
  }
  if (showNumber && seg.ayah > 0) {
    const at = tokens[tokens.length - 1]?.end ?? len;
    tokens.push({ text: `﴿${toArabicDigits(seg.ayah)}﴾`, start: at, end: at, marker: true });
  }
  return tokens;
}

const layoutCache = new WeakMap<Segment, { key: string; layout: Layout }>();

// Shrink the font down to 70% to fit; if the ayah is still too long, split it
// into pages that turn when their first word is recited.
function layoutFor(ctx: Ctx, seg: Segment, style: Style): Layout {
  const key = `${style.fontFamily}|${style.fontSize}|${W}x${H}|${style.showAyahNumber}`;
  const hit = layoutCache.get(seg);
  if (hit?.key === key) return hit.layout;

  const texts = seg.words?.length ? seg.words.map((w) => w.text) : seg.text.split(/\s+/).filter(Boolean);
  const tokens = timeTokens(seg, texts, style.showAyahNumber);
  const min = style.fontSize * 0.7;
  let size = style.fontSize;
  let widths: number[] = [];
  let space = 0;
  let lines: number[][] = [];
  for (; ; size -= 4) {
    size = Math.max(size, min);
    ctx.font = `${size}px "${style.fontFamily}"`;
    widths = tokens.map((tk) => ctx.measureText(tk.text).width);
    space = ctx.measureText(' ').width;
    lines = wrapTokens(widths, space, textWidth());
    if (lines.length <= maxLines() || size <= min) break;
  }

  const pages: Page[] = [];
  for (let i = 0; i < lines.length; i += maxLines()) {
    const chunk = lines.slice(i, i + maxLines());
    pages.push({ lines: chunk, fontSize: size, first: chunk[0][0] });
  }
  const layout = { tokens, widths, space, pages };
  layoutCache.set(seg, { key, layout });
  return layout;
}

function translationLines(ctx: Ctx, text: string, rtl: boolean, size: number, font: string): string[] {
  ctx.font = `${size}px ${font}`;
  const words = text.split(/\s+/).filter(Boolean);
  const widths = words.map((w) => ctx.measureText(w).width);
  const lines = wrapTokens(widths, ctx.measureText(' ').width, textWidth()).map((l) =>
    l.map((i) => words[i]).join(' '),
  );
  const max = H >= 1900 ? 6 : H >= 1300 ? 4 : 3;
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = rtl ? `${lines[max - 1]} …` : `${lines[max - 1]}…`;
  }
  return lines;
}

function drawSegment(ctx: Ctx, seg: Segment, local: number, style: Style, idle: boolean) {
  const len = seg.end - seg.start;
  const { tokens, widths, space, pages } = layoutFor(ctx, seg, style);
  // Turn the page slightly before its first word so the fade-in doesn't swallow it.
  const pageStart = (i: number) => (i === 0 ? 0 : Math.max(0, tokens[pages[i].first].start - 0.15));
  let pi = 0;
  if (!idle) while (pi + 1 < pages.length && local >= pageStart(pi + 1)) pi++;
  const page = pages[pi];
  const pStart = pageStart(pi);
  const pEnd = pi + 1 < pages.length ? pageStart(pi + 1) : len;
  const inT = local - pStart;
  const alpha = idle ? 1 : clamp01(Math.min(inT / FADE_IN, (pEnd - pStart - inT) / FADE_OUT));

  const lineH = page.fontSize * 1.75;
  let transLines: string[] = [];
  const transRtl = !!seg.translation && RTL.test(seg.translation);
  const transSize = transRtl ? 40 : 38;
  const transFont = transRtl ? '"Noto Naskh Arabic"' : style.translationFont;
  if (style.showTranslation && seg.translation) {
    transLines = translationLines(ctx, seg.translation, transRtl, transSize, transFont);
  }
  const transLineH = transSize * (transRtl ? 1.6 : 1.4);
  const transH = transLines.length ? transLines.length * transLineH + 50 : 0;
  const blockH = page.lines.length * lineH + transH;
  // Keep the block between the header and the progress bar; shrink it if needed
  // (long tafsir in the square and landscape formats).
  const top = style.showHeader ? H * 0.12 + 130 : H * 0.06;
  const bottom = H * 0.9;
  const fit = Math.min(1, (bottom - top) / blockH);
  const half = (blockH * fit) / 2;
  const wanted = style.position === 'center' ? H / 2 : H * 0.66;
  const centerY = Math.max(top + half, Math.min(bottom - half, wanted));
  let y = centerY - blockH / 2 + lineH / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;

  if (fit < 1) {
    ctx.translate(W / 2, centerY);
    ctx.scale(fit, fit);
    ctx.translate(-W / 2, -centerY);
  }
  const k = idle ? 1 : easeOut(inT / 0.6);
  if (style.animation === 'slide') ctx.translate(0, (1 - k) * 60);
  if (style.animation === 'zoom') {
    const s = 0.9 + 0.1 * k;
    ctx.translate(W / 2, centerY);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -centerY);
  }

  // Karaoke cursor: the last word whose recitation has started.
  const words = tokens.filter((tk) => !tk.marker);
  let cur = -1;
  if (style.karaoke) {
    if (idle) cur = Math.floor(words.length / 3);
    else {
      for (let i = 0; i < words.length && words[i].start <= local; i++) cur = i;
      if (cur >= 0 && local > words[cur].end + 0.6) cur = words.length; // long pause after the last word
    }
  }
  const wordMode = style.karaoke || style.animation === 'reveal';

  ctx.direction = 'rtl';
  ctx.fillStyle = style.textColor;
  ctx.font = `${page.fontSize}px "${style.fontFamily}"`;
  for (const line of page.lines) {
    if (!wordMode) {
      ctx.fillText(line.map((i) => tokens[i].text).join(' '), W / 2, y);
    } else {
      const lw = line.reduce((n, i) => n + widths[i], 0) + space * (line.length - 1);
      let x = W / 2 + lw / 2;
      ctx.textAlign = 'right';
      for (const i of line) {
        const tk = tokens[i];
        let a = 1;
        let color = style.textColor;
        if (style.animation === 'reveal' && !idle) a = clamp01((local - tk.start) / 0.3);
        if (style.karaoke && !tk.marker) {
          const wi = words.indexOf(tk);
          if (wi === cur) color = style.highlightColor;
          else if (wi > cur) a *= 0.45;
        }
        ctx.globalAlpha = alpha * a;
        ctx.fillStyle = color;
        ctx.fillText(tk.text, x, y);
        x -= widths[i] + space;
      }
      ctx.textAlign = 'center';
      ctx.globalAlpha = alpha;
    }
    y += lineH;
  }

  if (transLines.length) {
    y += 50 - lineH / 2 + transLineH / 2;
    ctx.direction = transRtl ? 'rtl' : 'ltr';
    ctx.font = `${transSize}px ${transFont}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const line of transLines) {
      ctx.fillText(line, W / 2, y);
      y += transLineH;
    }
  }
  ctx.restore();
}

// ---------- cards ----------

const partLabel = (meta: Meta) => (meta.part ? `الجزء ${toArabicDigits(meta.part.index)}` : '');

function drawHeader(ctx: Ctx, meta: Meta, style: Style) {
  const top = H * 0.12;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = style.accentColor;
  ctx.font = `64px "${style.fontFamily}"`;
  ctx.fillText(meta.surahName, W / 2, top);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `36px "Noto Naskh Arabic"`;
  const sub = [`بصوت القارئ ${meta.reciterName}`, partLabel(meta)].filter(Boolean).join('  ·  ');
  ctx.fillText(sub, W / 2, top + 80);
  ctx.restore();
}

function drawRule(ctx: Ctx, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - 90, y - 1.5, 180, 3);
  ctx.beginPath();
  ctx.arc(W / 2, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function cardText(ctx: Ctx, alpha: number, draw: () => void) {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 20;
  draw();
  ctx.restore();
}

function drawIntro(ctx: Ctx, t: number, tl: Timeline, meta: Meta, style: Style) {
  const cy = H / 2;
  const part = partLabel(meta);
  cardText(ctx, Math.min(t / 0.4, (tl.intro - t) / 0.4), () => {
    drawRule(ctx, cy - 175, style.accentColor);
    ctx.fillStyle = style.accentColor;
    ctx.font = `120px "${style.fontFamily}"`;
    ctx.fillText(meta.surahName, W / 2, cy - 40);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = `44px "Noto Naskh Arabic"`;
    ctx.fillText(`بصوت القارئ ${meta.reciterName}`, W / 2, cy + 70);
    if (part) {
      ctx.fillStyle = style.accentColor;
      ctx.fillText(part, W / 2, cy + 140);
    }
    drawRule(ctx, cy + (part ? 210 : 150), style.accentColor);
  });
}

function drawOutro(ctx: Ctx, since: number, style: Style) {
  cardText(ctx, since / 0.5, () => {
    drawRule(ctx, H / 2 - 110, style.accentColor);
    ctx.fillStyle = style.accentColor;
    ctx.font = `${Math.round(style.fontSize * 1.15)}px "${style.fontFamily}"`;
    ctx.fillText(style.outro, W / 2, H / 2);
    drawRule(ctx, H / 2 + 110, style.accentColor);
  });
}

// ---------- frame ----------

/**
 * Draw one frame at reel time `t`. `idle` shows a static sample (first verse,
 * fully visible) for the editor preview when nothing is playing.
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
  W = ctx.canvas.width;
  H = ctx.canvas.height;
  drawBackground(ctx, bg, bgTime, style);
  ctx.fillStyle = `rgba(0,0,0,${style.overlay})`;
  ctx.fillRect(0, 0, W, H);

  const audioEnd = timeline ? timeline.duration - timeline.outro : 0;
  const inIntro = !!timeline && !idle && timeline.intro > 0 && t < timeline.intro;
  const inOutro = !!timeline && !idle && timeline.outro > 0 && t >= audioEnd;

  if (style.showHeader && !inIntro && !inOutro) drawHeader(ctx, meta, style);

  if (timeline) {
    if (inIntro) drawIntro(ctx, t, timeline, meta, style);
    else if (inOutro && style.outro) drawOutro(ctx, t - audioEnd, style);
    else {
      const seg = idle ? timeline.segments[0] : timeline.segments.find((s) => t >= s.start && t < s.end);
      if (seg) drawSegment(ctx, seg, idle ? 0 : t - seg.start, style, idle);
    }

    if (style.showProgress && timeline.duration > 0) {
      const y = H - H * 0.078;
      const w = (clamp01(t / timeline.duration) * (W - 160)) | 0;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(80, y, W - 160, 6);
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(W - 80 - w, y, w, 6);
    }

    // Fade to black over the last 0.6s.
    const tail = timeline.duration - t;
    if (!idle && tail < 0.6 && t > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, tail) / 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (style.watermark) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `32px "Noto Naskh Arabic", sans-serif`;
    ctx.fillText(style.watermark, W / 2, H - H * 0.047);
    ctx.restore();
  }
}

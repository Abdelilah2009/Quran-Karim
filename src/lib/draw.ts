import { toArabicDigits } from './quran';
import type { Segment, Timeline } from './timeline';

export type Format = '9:16' | '4:5' | '1:1' | '16:9';
export type TextAnimation = 'fade' | 'slide' | 'zoom' | 'reveal';
export type HookStyle = 'plain' | 'box' | 'marker' | 'glow' | 'outline' | 'bubble' | '3d' | 'gradient';
export type HookPosition = 'top' | 'center' | 'above';

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
  template: string; // id of the layout template (see templates/index.ts)
  hook: string; // headline some templates show above the verse
  hookStyle: HookStyle; // how that headline is drawn
  hookPosition: HookPosition; // where it sits (Challenge)
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

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Canvas size of the frame being drawn; set by beginFrame at the top of drawFrame.
let W = 1080;
let H = 1920;

export function beginFrame(ctx: Ctx) {
  W = ctx.canvas.width;
  H = ctx.canvas.height;
}

export const FADE_IN = 0.35;
export const FADE_OUT = 0.25;
const defaultMaxLines = () => (H >= 1900 ? 5 : H >= 1300 ? 4 : 3);
const defaultTextWidth = () => Math.min(W * 0.84, 1500);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const isRtl = (s: string) => /[\u0590-\u08FF]/.test(s);
export { toArabicDigits };

// ---------- text layout ----------

export interface Token {
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

export function wrapTokens(widths: number[], space: number, maxW: number): number[][] {
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

/** The verse split into words, each with its recitation time (real or estimated). */
export function verseTokens(seg: Segment, style: Style): Token[] {
  const texts = seg.words?.length ? seg.words.map((w) => w.text) : seg.text.split(/\s+/).filter(Boolean);
  return timeTokens(seg, texts, style.showAyahNumber);
}

/** Index (among non-marker tokens) of the word being recited at `local`, -1 before the first. */
export function wordAt(tokens: Token[], local: number): number {
  const words = tokens.filter((tk) => !tk.marker);
  let cur = -1;
  for (let i = 0; i < words.length && words[i].start <= local; i++) cur = i;
  if (cur >= 0 && local > words[cur].end + 0.6) cur = words.length; // long pause after the last word
  return cur;
}

interface LayoutOpts {
  scale: number;
  maxLines: number;
  width: number;
}

const layoutCache = new WeakMap<Segment, Map<string, Layout>>();

// Shrink the font down to 70% to fit; if the ayah is still too long, split it
// into pages that turn when their first word is recited.
function layoutFor(ctx: Ctx, seg: Segment, style: Style, opts: LayoutOpts): Layout {
  const key = `${style.fontFamily}|${style.fontSize}|${style.showAyahNumber}|${opts.scale}|${opts.maxLines}|${opts.width}`;
  let byKey = layoutCache.get(seg);
  if (!byKey) layoutCache.set(seg, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;

  const tokens = verseTokens(seg, style);
  const base = style.fontSize * opts.scale;
  const min = base * 0.7;
  let size = base;
  let widths: number[] = [];
  let space = 0;
  let lines: number[][] = [];
  for (; ; size -= 4) {
    size = Math.max(size, min);
    ctx.font = `${size}px "${style.fontFamily}"`;
    widths = tokens.map((tk) => ctx.measureText(tk.text).width);
    space = ctx.measureText(' ').width;
    lines = wrapTokens(widths, space, opts.width);
    if (lines.length <= opts.maxLines || size <= min) break;
  }

  const pages: Page[] = [];
  for (let i = 0; i < lines.length; i += opts.maxLines) {
    const chunk = lines.slice(i, i + opts.maxLines);
    pages.push({ lines: chunk, fontSize: size, first: chunk[0][0] });
  }
  const layout = { tokens, widths, space, pages };
  byKey.set(key, layout);
  return layout;
}

/** Wrap plain text (font = size + family) into at most `max` lines, ending with an ellipsis. */
export function wrapText(ctx: Ctx, text: string, font: string, maxW: number, max: number): string[] {
  ctx.font = font;
  const rtl = isRtl(text);
  const words = text.split(/\s+/).filter(Boolean);
  const widths = words.map((w) => ctx.measureText(w).width);
  const lines = wrapTokens(widths, ctx.measureText(' ').width, maxW).map((l) =>
    l.map((i) => words[i]).join(' '),
  );
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = rtl ? `${lines[max - 1]} …` : `${lines[max - 1]}…`;
  }
  return lines;
}

/** Where and how a template wants the verse block drawn. Everything is optional. */
export interface VerseBox {
  top?: number; // block stays below this y (default: under the header)
  bottom?: number; // and above this y (default: above the progress bar)
  y?: number; // preferred center y (default: from style.position)
  width?: number; // max line width (default: 84% of the frame)
  scale?: number; // multiplier on style.fontSize
  maxLines?: number; // lines per page before paging
  color?: string; // verse color (default style.textColor)
  translationColor?: string;
  translationScale?: number;
  translationLines?: number; // max translation lines
  showTranslation?: boolean; // default style.showTranslation
  shadow?: boolean; // default true
  lineHeight?: number; // multiple of the font size (default 1.75)
  upcomingAlpha?: number; // karaoke: opacity of words not yet recited (default 0.45)
  translationItalic?: boolean;
}

/**
 * Draw the verse (paged, animated, karaoke) with its translation beneath,
 * fitted inside the box. Returns the block's vertical extent.
 */
export function drawVerse(
  ctx: Ctx,
  seg: Segment,
  local: number,
  style: Style,
  idle: boolean,
  box: VerseBox = {},
): { top: number; bottom: number } {
  const len = seg.end - seg.start;
  const width = box.width ?? defaultTextWidth();
  const { tokens, widths, space, pages } = layoutFor(ctx, seg, style, {
    scale: box.scale ?? 1,
    maxLines: box.maxLines ?? defaultMaxLines(),
    width,
  });
  // Turn the page slightly before its first word so the fade-in doesn't swallow it.
  const pageStart = (i: number) => (i === 0 ? 0 : Math.max(0, tokens[pages[i].first].start - 0.15));
  let pi = 0;
  if (!idle) while (pi + 1 < pages.length && local >= pageStart(pi + 1)) pi++;
  const page = pages[pi];
  const pStart = pageStart(pi);
  const pEnd = pi + 1 < pages.length ? pageStart(pi + 1) : len;
  const inT = local - pStart;
  const alpha = idle ? 1 : clamp01(Math.min(inT / FADE_IN, (pEnd - pStart - inT) / FADE_OUT));

  const lineH = page.fontSize * (box.lineHeight ?? 1.75);
  let transLines: string[] = [];
  const transRtl = !!seg.translation && isRtl(seg.translation);
  const transSize = (transRtl ? 40 : 38) * (box.translationScale ?? 1);
  const transFont = transRtl ? '"Noto Naskh Arabic"' : style.translationFont;
  const transPrefix = box.translationItalic && !transRtl ? 'italic ' : '';
  if ((box.showTranslation ?? style.showTranslation) && seg.translation) {
    const max = box.translationLines ?? (H >= 1900 ? 6 : H >= 1300 ? 4 : 3);
    transLines = wrapText(ctx, seg.translation, `${transPrefix}${transSize}px ${transFont}`, width, max);
  }
  const transLineH = transSize * (transRtl ? 1.6 : 1.4);
  const transH = transLines.length ? transLines.length * transLineH + 50 : 0;
  const blockH = page.lines.length * lineH + transH;
  // Keep the block between the header and the progress bar; shrink it if needed
  // (long tafsir in the square and landscape formats).
  const top = box.top ?? (style.showHeader ? H * 0.12 + 130 : H * 0.06);
  const bottom = box.bottom ?? H * 0.9;
  const fit = Math.min(1, (bottom - top) / blockH);
  const half = (blockH * fit) / 2;
  const wanted = box.y ?? (style.position === 'center' ? H / 2 : H * 0.66);
  const centerY = Math.max(top + half, Math.min(bottom - half, wanted));
  let y = centerY - blockH / 2 + lineH / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (box.shadow ?? true) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
  }

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
  const cur = !style.karaoke ? -1 : idle ? Math.floor(words.length / 3) : wordAt(tokens, local);
  const wordMode = style.karaoke || style.animation === 'reveal';
  const color = box.color ?? style.textColor;

  ctx.direction = 'rtl';
  ctx.fillStyle = color;
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
        let fill = color;
        if (style.animation === 'reveal' && !idle) a = clamp01((local - tk.start) / 0.3);
        if (style.karaoke && !tk.marker) {
          const wi = words.indexOf(tk);
          if (wi === cur) fill = style.highlightColor;
          else if (wi > cur) a *= box.upcomingAlpha ?? 0.45;
        }
        ctx.globalAlpha = alpha * a;
        ctx.fillStyle = fill;
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
    ctx.font = `${transPrefix}${transSize}px ${transFont}`;
    ctx.fillStyle = box.translationColor ?? 'rgba(255,255,255,0.85)';
    for (const line of transLines) {
      ctx.fillText(line, W / 2, y);
      y += transLineH;
    }
  }
  ctx.restore();
  return { top: centerY - half, bottom: centerY + half };
}

// ---------- cards ----------

export const partLabel = (meta: Meta) => (meta.part ? `الجزء ${toArabicDigits(meta.part.index)}` : '');

export function drawHeader(ctx: Ctx, meta: Meta, style: Style) {
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

export function drawRule(ctx: Ctx, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - 90, y - 1.5, 180, 3);
  ctx.beginPath();
  ctx.arc(W / 2, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

export function cardText(ctx: Ctx, alpha: number, draw: () => void) {
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

export function drawIntro(ctx: Ctx, t: number, tl: Timeline, meta: Meta, style: Style) {
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

export function drawOutro(ctx: Ctx, since: number, style: Style) {
  cardText(ctx, since / 0.5, () => {
    drawRule(ctx, H / 2 - 110, style.accentColor);
    ctx.fillStyle = style.accentColor;
    ctx.font = `${Math.round(style.fontSize * 1.15)}px "${style.fontFamily}"`;
    ctx.fillText(style.outro, W / 2, H / 2);
    drawRule(ctx, H / 2 + 110, style.accentColor);
  });
}

/** Thin progress bar filling right-to-left (Arabic reading direction). */
export function drawProgress(
  ctx: Ctx,
  t: number,
  tl: Timeline,
  color: string,
  y = H - H * 0.078,
  x0 = 80,
  x1 = W - 80,
) {
  if (tl.duration <= 0) return;
  const w = (clamp01(t / tl.duration) * (x1 - x0)) | 0;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x0, y, x1 - x0, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x1 - w, y, w, 6);
}

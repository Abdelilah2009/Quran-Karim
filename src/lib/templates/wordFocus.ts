import { clamp01, drawHeader, drawIntro, drawOutro, drawProgress, easeOut, isRtl, verseTokens, wordAt, wrapText, type Ctx, type Style } from '../draw';
import type { Segment } from '../timeline';
import type { FrameInfo, Template } from './types';

const WORD_IN = 0.14; // seconds for a word to scale/fade in

// Translation fitted to at most `max` lines, shrinking the font before truncating.
function translationLayout(ctx: Ctx, text: string, style: Style, W: number, H: number) {
  const rtl = isRtl(text);
  const family = rtl ? '"Noto Naskh Arabic"' : style.translationFont;
  const max = H >= 1900 ? 5 : H >= 1300 ? 4 : 3;
  const width = Math.min(W * 0.84, 1500);
  let size = rtl ? 40 : 38;
  let lines: string[] = [];
  for (; size >= 28; size -= 2) {
    lines = wrapText(ctx, text, `${size}px ${family}`, width, 99);
    if (lines.length <= max) break;
  }
  if (lines.length > max) lines = wrapText(ctx, text, `${size}px ${family}`, width, max);
  return { lines, size, family, rtl, lineH: size * (rtl ? 1.6 : 1.4) };
}

function drawSegment(f: FrameInfo, seg: Segment) {
  const { ctx, W, H, style, idle } = f;
  const local = idle ? 0 : f.local;
  const len = seg.end - seg.start;
  const tokens = verseTokens(seg, style);
  const words = tokens.filter((tk) => !tk.marker);
  const marker = tokens.find((tk) => tk.marker);
  if (!words.length) return;

  // The word on screen: the one being recited, or the last one during pauses.
  let idx = idle ? Math.min(2, words.length - 1) : wordAt(tokens, local);
  idx = Math.max(0, Math.min(words.length - 1, idx));
  const since = idle ? 1 : local - (idx === 0 ? Math.min(0, words[0].start) : words[idx].start);
  const k = easeOut(since / WORD_IN);
  // Whole-verse fade at the segment edges (secondary elements fade in too).
  const segIn = idle ? 1 : clamp01(local / 0.3);
  const segOut = idle ? 1 : clamp01((len - local) / 0.22);

  // Vertical space between the header and the translation block.
  const top = style.showHeader ? H * 0.12 + 150 : H * 0.07;
  let bottom = H * 0.89;
  const trans = style.showTranslation && seg.translation ? translationLayout(ctx, seg.translation, style, W, H) : null;
  const transH = trans ? trans.lines.length * trans.lineH : 0;
  if (trans) bottom -= transH + H * 0.03;

  // Hero size: up to 2.2x the verse size, shrunk to 86% of the width.
  const base = Math.min(style.fontSize * (H / W > 1.6 ? 2.5 : 2.2), H * 0.15, (bottom - top) * 0.42);
  const fit = (text: string, max: number) => {
    ctx.font = `${max}px "${style.fontFamily}"`;
    const w = ctx.measureText(text).width;
    return w > W * 0.86 ? (max * W * 0.86) / w : max;
  };
  const size = fit(words[idx].text, base);
  const cy = Math.max(top + base * 1.5, Math.min(bottom - base * 1.5, H * 0.46));
  const prevY = cy - base * 1.18;
  const numberY = cy + base * 1.08;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 22;

  // The previous word lingers above as a small, faded echo.
  if (idx > 0) {
    ctx.globalAlpha = segIn * segOut * 0.4 * k;
    ctx.fillStyle = style.textColor;
    ctx.font = `${fit(words[idx - 1].text, base * 0.42)}px "${style.fontFamily}"`;
    ctx.fillText(words[idx - 1].text, W / 2, prevY + (1 - k) * base * 0.12);
  }

  // The hero word.
  ctx.globalAlpha = k * segOut;
  ctx.fillStyle = style.karaoke ? style.highlightColor : style.textColor;
  ctx.font = `${size}px "${style.fontFamily}"`;
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k);
  ctx.fillText(words[idx].text, 0, 0);
  ctx.restore();

  // Verse number ornament and a word counter underneath.
  ctx.shadowBlur = 12;
  ctx.globalAlpha = segIn * segOut;
  if (marker) {
    ctx.fillStyle = style.accentColor;
    ctx.font = `${Math.round(base * 0.34)}px "${style.fontFamily}"`;
    ctx.fillText(marker.text, W / 2, numberY);
  }
  drawTicks(ctx, W / 2, numberY + base * (marker ? 0.42 : 0.1), words.length, idx, k, style, Math.min(W * 0.5, 560));

  if (trans) {
    ctx.shadowBlur = 16;
    ctx.globalAlpha = segIn * segOut;
    ctx.direction = trans.rtl ? 'rtl' : 'ltr';
    ctx.font = `${trans.size}px ${trans.family}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    let y = H * 0.89 - transH + trans.lineH / 2;
    for (const line of trans.lines) {
      ctx.fillText(line, W / 2, y);
      y += trans.lineH;
    }
  }
  ctx.restore();
}

// A row of small dots, one per word (right to left), the current one lit.
// Long verses collapse into a thin bar that fills instead.
function drawTicks(ctx: Ctx, cx: number, y: number, n: number, cur: number, k: number, style: Style, maxW: number) {
  if (n < 2) return;
  const gap = maxW / (n - 1);
  if (gap >= 14) {
    const w = gap * (n - 1);
    for (let i = 0; i < n; i++) {
      const x = cx + w / 2 - i * gap;
      const on = i === cur;
      ctx.fillStyle = i <= cur ? style.accentColor : 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(x, y, on ? 4 + 2.5 * k : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const w = maxW;
  const p = (cur + k) / n;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - w / 2, y - 2, w, 4);
  ctx.fillStyle = style.accentColor;
  ctx.fillRect(cx + w / 2 - w * p, y - 2, w * p, 4);
}

export const wordFocus: Template = {
  id: 'word-focus',
  name: 'Word focus',
  description: 'One big word at a time, as it is recited.',
  defaults: { showHeader: true, karaoke: false },
  draw(f) {
    const { ctx, style, meta, timeline, phase } = f;
    if (style.showHeader && phase === 'verse') drawHeader(ctx, meta, style);
    if (phase === 'intro') drawIntro(ctx, f.t, timeline, meta, style);
    else if (phase === 'outro') {
      if (style.outro) drawOutro(ctx, f.t - f.audioEnd, style);
    } else if (f.seg) drawSegment(f, f.seg);
    if (style.showProgress) drawProgress(ctx, f.t, timeline, style.accentColor);
  },
};

import { cardText, clamp01, drawHeader, drawProgress, drawRule, drawVerse, easeOut, isRtl, wrapText, type Ctx } from '../draw';
import type { FrameInfo, Template } from './types';

const UI_AR = '"Noto Kufi Arabic", "Noto Naskh Arabic", sans-serif';
const UI_LTR = 'Figtree, system-ui, sans-serif';

// Shrink `base` until the wrapped text fits both `maxLines` and `maxH`.
function fitText(ctx: Ctx, text: string, font: (s: number) => string, lh: number, maxW: number, maxH: number, maxLines: number, base: number, min: number) {
  let size = base;
  let lines: string[] = [];
  for (; ; size -= 2) {
    size = Math.max(size, min);
    lines = wrapText(ctx, text, font(size), maxW, 999);
    if ((lines.length <= maxLines && lines.length * size * lh <= maxH) || size <= min) break;
  }
  if (lines.length > maxLines || lines.length * size * lh > maxH) {
    return { size, lines: wrapText(ctx, text, font(size), maxW, Math.max(1, Math.min(maxLines, Math.floor(maxH / (size * lh))))) };
  }
  // Balance the lines: the narrowest width that keeps the same line count (no one-word orphans).
  if (lines.length > 1) {
    let lo = maxW * 0.4;
    let hi = maxW;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (wrapText(ctx, text, font(size), mid, 999).length > lines.length) lo = mid;
      else hi = mid;
    }
    lines = wrapText(ctx, text, font(size), hi, 999);
  }
  return { size, lines };
}

// Opening card: a big question mark medallion and the hook, popping in.
function drawQuestion(f: FrameInfo) {
  const { ctx, W, H, style, meta, timeline } = f;
  const u = Math.min(W, H);
  const t = f.t;
  const alpha = Math.min(t / 0.4, (timeline.intro - t) / 0.4);
  const k = easeOut(t / 0.7);
  const text = style.hook.trim() || 'هل تعرف معنى هذه الآية؟';
  const rtl = isRtl(text);
  const font = (s: number) => `700 ${s}px ${rtl ? UI_AR : UI_LTR}`;
  const lh = rtl ? 1.55 : 1.25;
  const { size, lines } = fitText(ctx, text, font, lh, Math.min(W * 0.84, 1400), H * 0.3, 4, u * 0.09, u * 0.05);
  const textH = lines.length * size * lh;

  const r = u * 0.085;
  const gap = u * 0.07;
  const blockH = r * 2 + gap + textH + u * 0.12;
  const top = H / 2 - blockH / 2;
  const cy = top + r;

  cardText(ctx, alpha, () => {
    // Medallion: accent ring with a soft pulse, question mark inside.
    const pulse = 1 + 0.04 * Math.sin(t * 5);
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale((0.6 + 0.4 * k) * pulse, (0.6 + 0.4 * k) * pulse);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = u * 0.008;
    ctx.strokeStyle = style.accentColor;
    ctx.stroke();
    ctx.fillStyle = style.accentColor;
    ctx.font = `700 ${Math.round(r * 1.25)}px ${rtl ? UI_AR : UI_LTR}`;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillText(rtl ? '؟' : '?', 0, r * (rtl ? 0.12 : 0.04));
    ctx.restore();

    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.font = font(size);
    ctx.fillStyle = style.textColor;
    let y = cy + r + gap + (size * lh) / 2 + (1 - k) * 40;
    for (const l of lines) {
      ctx.fillText(l, W / 2, y);
      y += size * lh;
    }
    ctx.direction = 'rtl';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.round(u * 0.034)}px "Noto Naskh Arabic"`;
    ctx.fillText(`${meta.surahName}  ·  ${meta.reciterName}`, W / 2, top + blockH - u * 0.02);
  });
}

// Closing card: 'المعنى' / 'Meaning' and all the verses' translations, fitted.
function drawReveal(f: FrameInfo) {
  const { ctx, W, H, style, meta, timeline } = f;
  const u = Math.min(W, H);
  const since = f.t - f.audioEnd;
  const text = timeline.segments
    .map((s) => s.translation?.trim())
    .filter(Boolean)
    .join(' ');
  const out = clamp01((timeline.outro - since) / 0.4);

  if (!text) {
    cardText(ctx, Math.min(since / 0.5, out), () => {
      drawRule(ctx, H / 2 - 110, style.accentColor);
      ctx.fillStyle = style.accentColor;
      ctx.font = `${Math.round(style.fontSize * 1.15)}px "${style.fontFamily}"`;
      ctx.fillText(style.outro || 'صدق الله العظيم', W / 2, H / 2);
      drawRule(ctx, H / 2 + 110, style.accentColor);
    });
    return;
  }

  const rtl = isRtl(text);
  const wide = W > H;
  const padX = u * 0.06;
  const panelW = Math.min(W * (wide ? 0.72 : 0.88), 1400);
  const panelTop = H * (wide ? 0.08 : 0.1);
  const panelBottom = H * 0.9;
  const titleSize = Math.round(u * 0.07);
  const bodyTop = panelTop + titleSize * 2.4;
  const bodyBottom = panelBottom - u * 0.1;
  const tFont = rtl ? '"Noto Naskh Arabic"' : style.translationFont;
  const lh = rtl ? 1.75 : 1.45;
  const { size, lines } = fitText(ctx, text, (s) => `${s}px ${tFont}`, lh, panelW - padX * 2, bodyBottom - bodyTop, 99, u * 0.05, u * 0.024);
  const bodyH = lines.length * size * lh;
  // Shrink the panel around short texts so it doesn't float half empty.
  const extra = bodyBottom - bodyTop - bodyH;
  const pTop = panelTop + extra / 2;
  const pBottom = panelBottom - extra / 2;

  const a = Math.min(since / 0.5, out);
  const k = easeOut(since / 0.7);
  ctx.save();
  ctx.globalAlpha = clamp01(a) * 0.9;
  ctx.fillStyle = 'rgba(8,14,14,0.62)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - panelW / 2, pTop + (1 - k) * 30, panelW, pBottom - pTop, u * 0.04);
  ctx.fill();
  ctx.globalAlpha = clamp01(a) * 0.6;
  ctx.strokeStyle = style.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  cardText(ctx, a, () => {
    ctx.translate(0, (1 - k) * 30);
    ctx.fillStyle = style.accentColor;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.font = rtl ? `700 ${titleSize}px ${UI_AR}` : `700 ${titleSize}px ${UI_LTR}`;
    const ty = pTop + titleSize * 1.05;
    ctx.fillText(rtl ? 'المعنى' : 'Meaning', W / 2, ty);
    drawRule(ctx, ty + titleSize * 0.85, style.accentColor);

    ctx.font = `${size}px ${tFont}`;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.shadowBlur = 8;
    let y = pTop + titleSize * 2.4 + (size * lh) / 2;
    const base = ctx.globalAlpha;
    const step = Math.min(0.07, 0.8 / lines.length);
    lines.forEach((l, i) => {
      // Lines settle in one after another.
      ctx.globalAlpha = base * clamp01((since - 0.25 - i * step) / 0.4);
      ctx.fillText(l, W / 2, y);
      y += size * lh;
    });
    ctx.globalAlpha = base;
    ctx.direction = 'rtl';
    ctx.fillStyle = style.accentColor;
    ctx.font = `${Math.round(u * 0.032)}px "Noto Naskh Arabic"`;
    ctx.fillText(meta.surahName, W / 2, pBottom - u * 0.045);
  });
}

export const question: Template = {
  id: 'question',
  name: 'Question hook',
  description: 'Opens with a question, recites, then reveals the meaning.',
  defaults: { hook: 'هل تعرف معنى هذه الآية؟', position: 'center', showHeader: true },
  cards: () => ({ intro: 3, outro: 6 }),
  draw(f) {
    const { ctx, style, meta, timeline, phase } = f;
    if (phase === 'intro') drawQuestion(f);
    else if (phase === 'outro') drawReveal(f);
    else {
      if (style.showHeader) drawHeader(ctx, meta, style);
      if (f.seg) drawVerse(ctx, f.seg, f.local, style, f.idle, { showTranslation: false, scale: 1.1 });
    }
    if (style.showProgress && phase === 'verse') drawProgress(ctx, f.t, timeline, style.accentColor);
  },
};

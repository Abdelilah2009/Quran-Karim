import { cardText, clamp01, drawRule, drawVerse, easeOut, partLabel } from '../draw';
import type { FrameInfo, Template } from './types';

const CARD = 'rgba(10,32,29,0.92)';

interface Card {
  x: number;
  y: number;
  w: number;
  h: number;
  // content area inside the padding
  left: number;
  right: number;
  top: number;
  bottom: number; // progress bar y
}

// Bottom sheet in portrait/square, right-hand panel in landscape.
function cardRect(W: number, H: number): Card {
  const u = Math.min(W, H);
  const pad = u * 0.065;
  if (W > H) {
    const x = W * 0.54;
    return { x, y: 0, w: W - x, h: H, left: x + pad, right: W - pad, top: H * 0.09, bottom: H * 0.9 };
  }
  const y = H * (H / W > 1.5 ? 0.55 : H / W > 1.1 ? 0.5 : 0.46);
  return { x: 0, y, w: W, h: H - y, left: pad, right: W - pad, top: y + pad * 0.8, bottom: H * 0.905 };
}

function drawCard(f: FrameInfo, c: Card) {
  const { ctx, W, H, style } = f;
  const r = Math.min(W, H) * 0.05;
  const wide = W > H;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = CARD;
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, c.w + (wide ? r : 0), c.h + (wide ? 0 : r), wide ? [r, 0, 0, r] : [r, r, 0, 0]);
  ctx.fill();
  ctx.restore();
  // Accent grabber on the sheet's edge.
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = style.accentColor;
  const g = Math.min(W, H) * 0.09;
  ctx.beginPath();
  if (wide) ctx.roundRect(c.x + 14, H / 2 - g / 2, 6, g, 3);
  else ctx.roundRect(W / 2 - g / 2, c.y + 14, g, 6, 3);
  ctx.fill();
  ctx.restore();
}

// Surah name on the right, reciter on the left, a hairline beneath. Returns the y below it.
function drawCardHeader(f: FrameInfo, c: Card): number {
  const { ctx, W, H, style, meta } = f;
  const u = Math.min(W, H);
  const y = c.top + u * 0.03;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = style.accentColor;
  ctx.font = `${Math.round(u * 0.046)}px "${style.fontFamily}"`;
  ctx.fillText(meta.surahName, c.right, y);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${Math.round(u * 0.031)}px "Noto Naskh Arabic"`;
  ctx.fillText([meta.reciterName, partLabel(meta)].filter(Boolean).join('  ·  '), c.left, y);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(c.left, y + u * 0.045, c.right - c.left, 2);
  ctx.restore();
  return y + u * 0.045;
}

function drawCardProgress(f: FrameInfo, c: Card) {
  const { ctx, W, H, style, timeline } = f;
  if (timeline.duration <= 0) return;
  const h = Math.max(6, Math.round(Math.min(W, H) * 0.008));
  const w = c.right - c.left;
  const p = f.idle ? 0.4 : clamp01(f.t / timeline.duration);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.roundRect(c.left, c.bottom, w, h, h / 2);
  ctx.fill();
  if (p > 0) {
    ctx.fillStyle = style.accentColor;
    ctx.beginPath();
    ctx.roundRect(c.right - Math.max(h, w * p), c.bottom, Math.max(h, w * p), h, h / 2);
    ctx.fill();
  }
  ctx.restore();
}

export const split: Template = {
  id: 'split',
  name: 'Split',
  description: 'The video on top, the verse on a solid card below.',
  defaults: { showHeader: true, showProgress: true },
  draw(f) {
    const { ctx, W, H, style, meta, timeline, phase } = f;
    const u = Math.min(W, H);
    const c = cardRect(W, H);
    const cx = (c.left + c.right) / 2;
    drawCard(f, c);

    const top = style.showHeader && phase === 'verse' ? drawCardHeader(f, c) + u * 0.03 : c.top;
    const bottom = style.showProgress ? c.bottom - u * 0.035 : c.bottom;
    const mid = (top + bottom) / 2;

    if (phase === 'intro') {
      cardText(ctx, Math.min(f.t / 0.4, (timeline.intro - f.t) / 0.4), () => {
        const k = easeOut(f.t / 0.7);
        const cy = (c.top + c.bottom) / 2 + (1 - k) * 20;
        ctx.shadowBlur = 0;
        drawRuleAt(f, cx, cy - u * 0.13);
        ctx.fillStyle = style.accentColor;
        ctx.font = `${Math.round(u * 0.1)}px "${style.fontFamily}"`;
        ctx.fillText(meta.surahName, cx, cy - u * 0.02);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${Math.round(u * 0.038)}px "Noto Naskh Arabic"`;
        ctx.fillText(`بصوت القارئ ${meta.reciterName}`, cx, cy + u * 0.08);
      });
    } else if (phase === 'outro') {
      if (style.outro) {
        const since = f.t - f.audioEnd;
        cardText(ctx, since / 0.5, () => {
          ctx.shadowBlur = 0;
          const cy = (c.top + c.bottom) / 2;
          drawRuleAt(f, cx, cy - u * 0.09);
          ctx.fillStyle = style.accentColor;
          ctx.font = `${Math.round(u * 0.09)}px "${style.fontFamily}"`;
          ctx.fillText(style.outro, cx, cy + (1 - easeOut(since / 0.6)) * 20);
          drawRuleAt(f, cx, cy + u * 0.09);
        });
      }
    } else if (f.seg) {
      // drawVerse centers on the frame; shift it onto the card.
      ctx.save();
      ctx.translate(cx - W / 2, 0);
      drawVerse(ctx, f.seg, f.local, style, f.idle, {
        top,
        bottom,
        y: mid,
        width: c.right - c.left,
        scale: W > H ? 0.78 : H / W > 1.5 ? 0.95 : 0.85,
        maxLines: H / W > 1.5 || W > H ? 3 : 2,
        translationLines: H / W > 1.5 ? 4 : 3,
        translationScale: W > H ? 0.9 : 1,
        shadow: false,
      });
      ctx.restore();
    }
    if (style.showProgress) drawCardProgress(f, c);
  },
};

function drawRuleAt(f: FrameInfo, x: number, y: number) {
  f.ctx.save();
  f.ctx.translate(x - f.W / 2, 0);
  drawRule(f.ctx, y, f.style.accentColor);
  f.ctx.restore();
}

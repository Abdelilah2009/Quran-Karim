import { cardText, clamp01, drawVerse, easeOut, isRtl, partLabel, wrapText, type Ctx } from '../draw';
import type { FrameInfo, Template } from './types';

const UI_AR = '"Noto Kufi Arabic", "Noto Naskh Arabic", sans-serif';
const UI_LTR = 'Figtree, system-ui, sans-serif';

// Largest size (down to 60%) at which the hook fits in two lines.
function fitHook(ctx: Ctx, text: string, font: (size: number) => string, maxW: number, base: number) {
  let size = base;
  let lines: string[] = [];
  for (; size > base * 0.6; size -= 2) {
    lines = wrapText(ctx, text, font(size), maxW, 99);
    if (lines.length <= 2) break;
  }
  return { size, lines: wrapText(ctx, text, font(size), maxW, 2) };
}

// Plain white headline centered on `cy`, with a soft outline so it reads on any footage.
function drawHook(f: FrameInfo, cy: number, u: number): number {
  const { ctx, W, style } = f;
  const text = style.hook.trim();
  if (!text) return cy;
  const rtl = isRtl(text);
  const font = (s: number) => `700 ${s}px ${rtl ? UI_AR : UI_LTR}`;
  const { size, lines } = fitHook(ctx, text, font, Math.min(W * 0.8, 1300), u * 0.056);
  const lineH = size * (rtl ? 1.5 : 1.2);
  const top = cy - ((lines.length - 1) * lineH) / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.font = font(size);
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => {
    ctx.strokeText(l, W / 2, top + i * lineH);
    ctx.fillText(l, W / 2, top + i * lineH);
  });
  ctx.restore();
  return top + (lines.length - 1) * lineH + size * 0.6;
}

// Slim progress bar with a small "23s / 60s" under it; the bar fills right-to-left.
function drawCounter(f: FrameInfo, y: number, u: number) {
  const { ctx, W, style, timeline } = f;
  const dur = Math.max(1, timeline.duration);
  const total = Math.ceil(dur);
  const p = f.idle ? 0.4 : clamp01(f.t / dur);
  const sec = f.idle ? Math.round(total * 0.4) : Math.min(total, Math.max(1, Math.ceil(f.t)));

  const barW = Math.min(W * 0.5, 720);
  const barH = Math.max(6, Math.round(u * 0.011));
  const x0 = W / 2 - barW / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.roundRect(x0, y, barW, barH, barH / 2);
  ctx.fill();
  const w = Math.max(barH, barW * p);
  ctx.fillStyle = style.accentColor;
  ctx.beginPath();
  ctx.roundRect(x0 + barW - w, y, w, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  // Split around the slash so the digits changing don't make the text jitter.
  const size = Math.round(u * 0.032);
  const cy = y + barH + size * 1.1;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.font = `600 ${size}px ${UI_LTR}`;
  const gap = size * 0.35;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${sec}s`, W / 2 - gap, cy);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('/', W / 2, cy);
  ctx.textAlign = 'left';
  ctx.fillText(`${total}s`, W / 2 + gap, cy);
  ctx.restore();
}

export const challenge: Template = {
  id: 'challenge',
  name: 'Challenge',
  description: 'A short headline in the middle, a seconds counter under it, the verse as captions below.',
  defaults: { showHeader: true, position: 'lower', hook: 'قاوم التعفن الدماغي' },
  cards: (s) => ({ intro: 0, outro: s.outro ? 3 : 0 }),
  draw(f) {
    const { ctx, W, H, style, meta, phase } = f;
    const u = Math.min(W, H);
    const wide = W > H;
    const tall = H / W > 1.5;

    const hookBottom = drawHook(f, H * (wide ? 0.3 : tall ? 0.4 : 0.33), u);
    drawCounter(f, hookBottom + u * 0.03, u);

    // Captions live in the lower part; a soft gradient keeps them legible on busy footage.
    const capTop = H * (wide ? 0.6 : tall ? 0.63 : 0.6);
    const capBottom = H * 0.905;
    const g = ctx.createLinearGradient(0, capTop - H * 0.08, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, capTop - H * 0.08, W, H - capTop + H * 0.08);

    // Small surah · reciter label on top of the caption area; the verse hangs below it.
    const labelSize = Math.round(u * 0.032);
    const showLabel = style.showHeader && phase === 'verse';
    const top = showLabel ? capTop + labelSize * 1.4 : capTop;
    const width = wide ? Math.min(W * 0.62, 1300) : W * 0.86;

    if (phase === 'intro') {
      const a = Math.min(f.t / 0.4, (f.timeline.intro - f.t) / 0.4);
      cardText(ctx, a, () => {
        const cy = (capTop + capBottom) / 2;
        ctx.fillStyle = style.accentColor;
        ctx.font = `${Math.round(u * 0.085)}px "${style.fontFamily}"`;
        ctx.fillText(meta.surahName, W / 2, cy - u * 0.03);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${Math.round(u * 0.036)}px "Noto Naskh Arabic"`;
        ctx.fillText(`بصوت القارئ ${meta.reciterName}`, W / 2, cy + u * 0.06);
      });
    } else if (phase === 'outro') {
      if (style.outro) {
        const since = f.t - f.audioEnd;
        cardText(ctx, since / 0.5, () => {
          const k = easeOut(since / 0.6);
          ctx.fillStyle = style.accentColor;
          ctx.font = `${Math.round(u * 0.085)}px "${style.fontFamily}"`;
          ctx.fillText(style.outro, W / 2, (capTop + capBottom) / 2 + (1 - k) * 30);
        });
      }
    } else if (f.seg) {
      drawVerse(ctx, f.seg, f.local, style, f.idle, {
        top,
        bottom: capBottom,
        y: top, // top-aligned, so the label never floats away from short verses
        width,
        scale: wide ? 0.72 : 0.8,
        maxLines: tall ? 3 : 2,
        translationScale: wide ? 0.9 : 1,
        translationLines: tall ? 3 : 2,
      });
      if (showLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        ctx.font = `${labelSize}px "Noto Naskh Arabic"`;
        ctx.fillStyle = style.accentColor;
        const label = [meta.surahName, meta.reciterName, partLabel(meta)].filter(Boolean).join('  ·  ');
        ctx.fillText(label, W / 2, capTop);
        ctx.restore();
      }
    }
  },
};

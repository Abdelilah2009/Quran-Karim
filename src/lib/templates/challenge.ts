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

// Dark ink on light fills, white on dark ones (presets recolor the marker).
function inkOn(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return '#111';
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}

interface HookLayout {
  rtl: boolean;
  font: string;
  size: number;
  lines: string[];
  lineH: number;
  pad: number; // extent above the first line center / below the last one
  height: number; // whole block, including any box or bubble tail
}

// Measure the headline first, so the template can position the block before drawing it.
function hookLayout(f: FrameInfo, u: number): HookLayout | null {
  const { ctx, W, style } = f;
  const text = style.hook.trim();
  if (!text) return null;
  const look = style.hookStyle;
  const rtl = isRtl(text);
  const font = (s: number) => `700 ${s}px ${rtl ? UI_AR : UI_LTR}`;
  const boxed = look === 'box' || look === 'marker' || look === 'bubble';
  const base = u * (look === 'outline' || look === '3d' ? 0.064 : boxed ? 0.05 : 0.056);
  const { size, lines } = fitHook(ctx, text, font, Math.min(W * (boxed ? 0.72 : 0.8), 1300), base);
  const lineH = size * (rtl ? 1.5 : 1.2) + (look === 'marker' ? size * 0.25 : 0);
  const pad = look === 'box' || look === 'bubble' ? size * 0.82 : look === 'marker' ? size * 0.62 : size * 0.6;
  const tail = look === 'bubble' ? size * 0.4 : look === '3d' ? size * 0.12 : 0;
  return { rtl, font: font(size), size, lines, lineH, pad, height: (lines.length - 1) * lineH + pad * 2 + tail };
}

// Draw the headline with its first line centered on `y0`, in one of the HookStyle looks.
function drawHook(f: FrameInfo, L: HookLayout, y0: number) {
  const { ctx, W, style } = f;
  const { size, lines, lineH } = L;
  const look = style.hookStyle;
  const nudge = L.rtl ? size * 0.08 : 0; // Kufi sits a little high on the middle baseline
  const at = (i: number) => y0 + i * lineH;
  const each = (fn: (l: string, y: number) => void) => lines.forEach((l, i) => fn(l, at(i)));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = L.rtl ? 'rtl' : 'ltr';
  ctx.font = L.font;
  ctx.lineJoin = 'round';
  const padX = size * 0.5;

  if (look === 'box' || look === 'bubble') {
    // A white card behind the whole headline; the bubble adds a tail pointing down.
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
    const h = (lines.length - 1) * lineH + L.pad * 2;
    const x = W / 2 - w / 2;
    const y = y0 - L.pad;
    const r = look === 'bubble' ? Math.min(h / 2, size * 0.9) : size * 0.35;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (look === 'bubble') {
      const tw = size * 0.55;
      ctx.moveTo(W / 2 - tw / 2, y + h - 1);
      ctx.lineTo(W / 2, y + h + size * 0.4);
      ctx.lineTo(W / 2 + tw / 2, y + h - 1);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#111';
    each((l, y1) => ctx.fillText(l, W / 2, y1 + nudge));
  } else if (look === 'marker') {
    // A highlighter swipe behind each line on its own.
    each((l, y) => {
      const w = ctx.measureText(l).width + padX * 1.4;
      ctx.fillStyle = style.accentColor;
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y - size * 0.62, w, size * 1.24, size * 0.18);
      ctx.fill();
      ctx.fillStyle = inkOn(style.accentColor);
      ctx.fillText(l, W / 2, y + nudge);
    });
  } else if (look === 'glow') {
    // Neon: a white-hot core with stacked accent halos around it.
    ctx.fillStyle = style.accentColor;
    ctx.shadowColor = style.accentColor;
    for (const blur of [size * 1.2, size * 0.6, size * 0.25]) {
      ctx.shadowBlur = blur;
      each((l, y) => ctx.fillText(l, W / 2, y));
    }
    ctx.shadowBlur = size * 0.12;
    ctx.fillStyle = '#fffdf5';
    ctx.lineWidth = size * 0.05;
    ctx.strokeStyle = style.accentColor;
    each((l, y) => {
      ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
    });
  } else if (look === 'outline') {
    // Thick black stroke, the classic Shorts meme caption.
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    each((l, y) => {
      ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
    });
  } else if (look === '3d') {
    // Retro extrusion: accent copies stepped down-right, white face on top.
    const depth = Math.max(4, Math.round(size * 0.1));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    each((l, y) => ctx.fillText(l, W / 2 + depth + 3, y + depth + 3));
    ctx.fillStyle = style.accentColor;
    for (let d = depth; d > 0; d--) each((l, y) => ctx.fillText(l, W / 2 + d, y + d));
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.fillStyle = '#fff';
    each((l, y) => {
      ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
    });
  } else if (look === 'gradient') {
    // White fading into the accent color, top to bottom of the block.
    const g = ctx.createLinearGradient(0, y0 - size * 0.5, 0, at(lines.length - 1) + size * 0.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, style.accentColor);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.35;
    ctx.shadowOffsetY = size * 0.05;
    ctx.fillStyle = g;
    each((l, y) => ctx.fillText(l, W / 2, y));
  } else {
    // Plain white with a soft outline so it reads on any footage.
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.4;
    ctx.fillStyle = '#fff';
    each((l, y) => {
      ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
    });
  }
  ctx.restore();
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
  defaults: { showHeader: true, position: 'lower', hook: 'قاوم التعفن الدماغي', hookPosition: 'center' },
  cards: (s) => ({ intro: 0, outro: s.outro ? 3 : 0 }),
  draw(f) {
    const { ctx, W, H, style, meta, phase } = f;
    const u = Math.min(W, H);
    const wide = W > H;
    const tall = H / W > 1.5;

    // Captions live in the lower part; a soft gradient keeps them legible on busy footage.
    const capTop = H * (wide ? 0.6 : tall ? 0.63 : 0.6);
    const capBottom = H * 0.905;

    // Headline + counter as one block, placed by style.hookPosition.
    const L = hookLayout(f, u);
    const hookH = L?.height ?? 0;
    const look = style.hookStyle;
    const gap = !L ? 0 : u * (look === 'bubble' ? 0.045 : look === 'box' || look === 'marker' ? 0.04 : 0.03);
    const counterH = Math.max(6, Math.round(u * 0.011)) + u * 0.032 * 1.6;
    const blockH = hookH + gap + counterH;
    const blockTop =
      style.hookPosition === 'top'
        ? H * (wide ? 0.07 : tall ? 0.1 : 0.08)
        : style.hookPosition === 'above'
          ? capTop - u * 0.06 - blockH
          : H * (wide ? 0.3 : tall ? 0.4 : 0.34) - blockH / 2;
    if (L) drawHook(f, L, blockTop + L.pad);
    drawCounter(f, blockTop + hookH + gap, u);

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

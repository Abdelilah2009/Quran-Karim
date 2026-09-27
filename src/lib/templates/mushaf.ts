import { clamp01, drawVerse, easeOut, partLabel, type Ctx, type Style } from '../draw';
import type { FrameInfo, Template } from './types';

const INK = '#1d1a14';
const GOLD = '#b08a3e';
const GOLD_LIGHT = '#d9bc72';
const GREEN = '#1f4a38';
const BROWN = '#6b5534';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Portrait page in tall formats, wider in square/landscape; leaves room below for the reciter.
function pageRect(W: number, H: number): Rect {
  const top = H * (H > W * 1.5 ? 0.1 : 0.06);
  const bottom = H * (H > W * 1.5 ? 0.845 : 0.85);
  const h = bottom - top;
  const w = Math.min(W * 0.88, h * (W > H ? 1.5 : 1));
  return { x: (W - w) / 2, y: top, w, h };
}

// Keep the hue of the user's highlight but make it dark enough to read on cream.
function inkHighlight(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#8a2a17';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l < 0.4) return hex;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return `hsl(${Math.round(h * 60)}, ${Math.round(Math.max(s, 0.6) * 100)}%, 30%)`;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function star(ctx: Ctx, x: number, y: number, r: number, points: number, inner: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function diamond(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.lineTo(x + rx, y);
  ctx.lineTo(x, y + ry);
  ctx.lineTo(x - rx, y);
  ctx.closePath();
}

function rosette(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = GREEN;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = GOLD_LIGHT;
  star(ctx, x, y, r * 0.8, 8, 0.55, Math.PI / 8);
  ctx.fill();
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

function drawPaper(ctx: Ctx, p: Rect) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = p.w * 0.06;
  ctx.shadowOffsetY = p.w * 0.015;
  const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w * 0.3, p.y + p.h);
  g.addColorStop(0, '#f7f0de');
  g.addColorStop(1, '#ede0bf');
  ctx.fillStyle = g;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.restore();

  // Aged edges.
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const v = ctx.createRadialGradient(cx, cy, Math.min(p.w, p.h) * 0.35, cx, cy, Math.hypot(p.w, p.h) * 0.56);
  v.addColorStop(0, 'rgba(150,110,50,0)');
  v.addColorStop(1, 'rgba(150,110,50,0.22)');
  ctx.fillStyle = v;
  ctx.fillRect(p.x, p.y, p.w, p.h);

  // Fixed paper fibres (same every frame).
  const r = rng(7);
  ctx.fillStyle = '#7a5a2a';
  for (let i = 0; i < 360; i++) {
    ctx.globalAlpha = 0.03 + r() * 0.06;
    ctx.fillRect(p.x + r() * p.w, p.y + r() * p.h, 1 + r() * 2.5, 1 + r() * 1.5);
  }
  ctx.globalAlpha = 1;
}

/** Double frame with a green band of gold motifs and corner rosettes; returns the inner writing area. */
function drawFrame(ctx: Ctx, p: Rect): Rect {
  const u = Math.min(p.w, p.h);
  const m = u * 0.035; // outer margin
  const band = u * 0.03;
  const o: Rect = { x: p.x + m, y: p.y + m, w: p.w - 2 * m, h: p.h - 2 * m };

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(2, u * 0.004);
  ctx.strokeRect(o.x, o.y, o.w, o.h);

  const b: Rect = { x: o.x + u * 0.008, y: o.y + u * 0.008, w: o.w - u * 0.016, h: o.h - u * 0.016 };
  ctx.fillStyle = GREEN;
  ctx.fillRect(b.x, b.y, b.w, band);
  ctx.fillRect(b.x, b.y + b.h - band, b.w, band);
  ctx.fillRect(b.x, b.y, band, b.h);
  ctx.fillRect(b.x + b.w - band, b.y, band, b.h);
  ctx.lineWidth = Math.max(1, u * 0.002);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeRect(b.x + band, b.y + band, b.w - 2 * band, b.h - 2 * band);

  // Motifs along the band: alternating diamonds and dots.
  ctx.fillStyle = GOLD_LIGHT;
  const step = band * 1.6;
  const run = (x0: number, y0: number, len: number, horiz: boolean) => {
    const n = Math.floor(len / step);
    const off = (len - n * step) / 2 + step / 2;
    for (let i = 0; i < n; i++) {
      const x = horiz ? x0 + off + i * step : x0;
      const y = horiz ? y0 : y0 + off + i * step;
      if (i % 2) {
        ctx.beginPath();
        ctx.arc(x, y, band * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else diamond(ctx, x, y, band * 0.3, band * 0.3);
      ctx.fill();
    }
  };
  const half = band / 2;
  run(b.x + band, b.y + half, b.w - 2 * band, true);
  run(b.x + band, b.y + b.h - half, b.w - 2 * band, true);
  run(b.x + half, b.y + band, b.h - 2 * band, false);
  run(b.x + b.w - half, b.y + band, b.h - 2 * band, false);

  // Inner hairline.
  const i: Rect = { x: b.x + band + u * 0.012, y: b.y + band + u * 0.012, w: b.w - 2 * band - u * 0.024, h: b.h - 2 * band - u * 0.024 };
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1, u * 0.0018);
  ctx.strokeRect(i.x, i.y, i.w, i.h);

  const rr = band * 1.05;
  rosette(ctx, b.x + half, b.y + half, rr);
  rosette(ctx, b.x + b.w - half, b.y + half, rr);
  rosette(ctx, b.x + half, b.y + b.h - half, rr);
  rosette(ctx, b.x + b.w - half, b.y + b.h - half, rr);
  // Side medallions, like the margin marks of a Mushaf.
  for (const x of [b.x + half, b.x + b.w - half]) {
    ctx.fillStyle = GOLD;
    diamond(ctx, x, b.y + b.h / 2, band * 0.85, band * 1.6);
    ctx.fill();
    ctx.fillStyle = GREEN;
    diamond(ctx, x, b.y + b.h / 2, band * 0.5, band * 1.05);
    ctx.fill();
  }
  return i;
}

/** The "سورة ..." header panel: green lozenge-ended cartouche with the surah name. */
function drawCartouche(ctx: Ctx, cx: number, cy: number, w: number, h: number, name: string, style: Style) {
  const tip = h * 0.55;
  const shape = (inset: number) => {
    const x0 = cx - w / 2 + inset;
    const x1 = cx + w / 2 - inset;
    const hh = h / 2 - inset;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x0 + tip, cy - hh);
    ctx.lineTo(x1 - tip, cy - hh);
    ctx.lineTo(x1, cy);
    ctx.lineTo(x1 - tip, cy + hh);
    ctx.lineTo(x0 + tip, cy + hh);
    ctx.closePath();
  };
  ctx.fillStyle = GOLD;
  shape(0);
  ctx.fill();
  ctx.fillStyle = GREEN;
  shape(h * 0.07);
  ctx.fill();
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = Math.max(1, h * 0.02);
  shape(h * 0.14);
  ctx.stroke();
  // Little stars in the pointed ends.
  ctx.fillStyle = GOLD_LIGHT;
  star(ctx, cx - w / 2 + tip * 0.75, cy, h * 0.14, 8, 0.5);
  ctx.fill();
  star(ctx, cx + w / 2 - tip * 0.75, cy, h * 0.14, 8, 0.5);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#f3e3b3';
  let size = h * 0.6;
  ctx.font = `${size}px "${style.fontFamily}"`;
  const room = w - tip * 2.4;
  const tw = ctx.measureText(name).width;
  if (tw > room) {
    size *= room / tw;
    ctx.font = `${size}px "${style.fontFamily}"`;
  }
  ctx.fillText(name, cx, cy + h * 0.03);
}

// Small centered ornament: gold line with a star between two diamonds.
function ornament(ctx: Ctx, cx: number, y: number, w: number, color = GOLD) {
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, y - 1, w * 0.38, 2);
  ctx.fillRect(cx + w * 0.12, y - 1, w * 0.38, 2);
  star(ctx, cx, y, w * 0.05, 8, 0.5);
  ctx.fill();
  diamond(ctx, cx - w * 0.09, y, w * 0.025, w * 0.025);
  ctx.fill();
  diamond(ctx, cx + w * 0.09, y, w * 0.025, w * 0.025);
  ctx.fill();
}

function pageProgress(ctx: Ctx, f: FrameInfo, x0: number, x1: number, y: number) {
  if (f.timeline.duration <= 0) return;
  const w = clamp01(f.t / f.timeline.duration) * (x1 - x0);
  ctx.fillStyle = 'rgba(140,105,45,0.18)';
  ctx.fillRect(x0, y - 1.5, x1 - x0, 3);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x1 - w, y - 1.5, w, 3);
}

export const mushaf: Template = {
  id: 'mushaf',
  name: 'Mushaf',
  description: 'The verse on an ornamented page, like a printed Mushaf.',
  defaults: { blur: 12, kenBurns: true },
  draw(f) {
    const { ctx, W, H, style, meta, phase } = f;
    const p = pageRect(W, H);
    // The page settles in during the first half-second of the reel.
    const k = f.idle ? 1 : easeOut(f.t / 0.6);
    ctx.save();
    ctx.globalAlpha = k;
    const s = 0.96 + 0.04 * k;
    ctx.translate(W / 2, p.y + p.h / 2);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -(p.y + p.h / 2));

    drawPaper(ctx, p);
    const inner = drawFrame(ctx, p);
    const u = Math.min(p.w, p.h);
    const ch = Math.max(56, u * 0.085);
    const cy = inner.y + u * 0.025 + ch / 2;
    drawCartouche(ctx, W / 2, cy, Math.min(inner.w * 0.78, u * 0.8), ch, meta.surahName, style);

    const pad = u * 0.04;
    const progY = inner.y + inner.h - pad * 0.6;
    const text: Rect = { x: inner.x + pad, y: cy + ch / 2 + pad * 0.8, w: inner.w - 2 * pad, h: 0 };
    text.h = progY - pad * 0.6 - text.y;
    const midY = text.y + text.h / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    if (phase === 'intro') {
      const a = clamp01(Math.min(f.t / 0.5, (f.timeline.intro - f.t) / 0.4));
      ctx.globalAlpha = k * a;
      const size = Math.min(style.fontSize * 1.25, text.w / 5.5);
      ornament(ctx, W / 2, midY - size * 1.3, u * 0.42);
      ctx.fillStyle = INK;
      ctx.font = `${size}px "${style.fontFamily}"`;
      ctx.fillText(meta.surahName, W / 2, midY - size * 0.15);
      ctx.fillStyle = BROWN;
      ctx.font = `${Math.round(size * 0.4)}px "Noto Naskh Arabic"`;
      ctx.fillText(`بصوت القارئ ${meta.reciterName}`, W / 2, midY + size * 0.75);
      const part = partLabel(meta);
      if (part) {
        ctx.fillStyle = GOLD;
        ctx.fillText(part, W / 2, midY + size * 1.3);
      }
      ornament(ctx, W / 2, midY + size * (part ? 1.85 : 1.35), u * 0.42);
      ctx.globalAlpha = k;
    } else if (phase === 'outro') {
      if (style.outro) {
        const a = clamp01((f.t - f.audioEnd) / 0.5);
        ctx.globalAlpha = k * a;
        let size = style.fontSize * 1.1;
        ctx.font = `${size}px "${style.fontFamily}"`;
        const tw = ctx.measureText(style.outro).width;
        if (tw > text.w * 0.9) size *= (text.w * 0.9) / tw;
        ctx.font = `${size}px "${style.fontFamily}"`;
        ornament(ctx, W / 2, midY - size * 1.1, u * 0.42);
        ctx.fillStyle = INK;
        ctx.fillText(style.outro, W / 2, midY);
        ornament(ctx, W / 2, midY + size * 1.1, u * 0.42);
        ctx.globalAlpha = k;
      }
    } else if (f.seg) {
      const ink: Style = { ...style, highlightColor: inkHighlight(style.highlightColor) };
      const scale = Math.min(1.1, text.w / 760);
      const lineH = style.fontSize * scale * 1.75;
      const room = text.h * (style.showTranslation && f.seg.translation ? 0.6 : 0.95);
      drawVerse(ctx, f.seg, f.local, ink, f.idle, {
        upcomingAlpha: 0.6,
        top: text.y,
        bottom: text.y + text.h,
        y: midY,
        width: text.w,
        scale,
        maxLines: Math.max(2, Math.min(6, Math.floor(room / lineH))),
        color: INK,
        translationColor: BROWN,
        translationScale: Math.min(1, text.w / 820),
        translationLines: H > W * 1.5 ? 5 : 3,
        shadow: false,
      });
    }
    if (style.showProgress) pageProgress(ctx, f, inner.x + pad, inner.x + inner.w - pad, progY);
    ctx.restore();

    // Reciter under the page, on the background.
    if (style.showHeader && phase !== 'intro') {
      const size = Math.max(30, Math.min(38, H * 0.02));
      const y = p.y + p.h + (H * 0.94 - p.y - p.h) * 0.42;
      ctx.save();
      ctx.globalAlpha = k * 0.9;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff';
      ctx.font = `${size}px "Noto Naskh Arabic"`;
      const sub = [`بصوت القارئ ${meta.reciterName}`, partLabel(meta)].filter(Boolean).join('  ·  ');
      ctx.fillText(sub, W / 2, y);
      ctx.restore();
    }
  },
};

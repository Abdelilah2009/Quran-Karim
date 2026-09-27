import { cardText, clamp01, drawVerse, easeOut, isRtl, partLabel, wrapText, type Ctx, type Style } from '../draw';
import type { Timeline } from '../timeline';
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

interface Clock {
  p: number; // 0..1 progress
  sec: number; // elapsed whole seconds, counting from 1
  total: number;
}

function clockAt(f: FrameInfo): Clock {
  const dur = Math.max(1, f.timeline.duration);
  const total = Math.ceil(dur);
  if (f.idle) return { p: 0.4, sec: Math.round(total * 0.4), total };
  return { p: clamp01(f.t / dur), sec: Math.min(total, Math.max(1, Math.ceil(f.t))), total };
}

const mss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

// Loudness of the whole reel in `n` buckets, from the verses' audio, so the
// voice-note waveform is the real recitation. Falls back to a plausible shape.
const waveCache = new WeakMap<Timeline, Map<number, number[]>>();
function reelWave(tl: Timeline, n: number): number[] {
  let byN = waveCache.get(tl);
  if (!byN) waveCache.set(tl, (byN = new Map()));
  const hit = byN.get(n);
  if (hit) return hit;
  const sums = new Float64Array(n);
  const counts = new Float64Array(n);
  for (const seg of tl.segments) {
    const data = seg.buffer.getChannelData(0);
    const rate = seg.buffer.sampleRate;
    const stride = Math.max(1, Math.floor(rate / 2000));
    for (let i = 0; i < data.length; i += stride) {
      const t = seg.start + i / rate;
      if (t >= tl.duration) break;
      const k = Math.min(n - 1, Math.floor((t / tl.duration) * n));
      sums[k] += data[i] * data[i];
      counts[k]++;
    }
  }
  const rms = Array.from(sums, (v, i) => (counts[i] ? Math.sqrt(v / counts[i]) : 0));
  const max = Math.max(...rms);
  const out =
    max > 1e-4
      ? rms.map((v) => 0.12 + 0.88 * Math.sqrt(v / max))
      : rms.map((_, i) => 0.25 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37 + 1)));
  byN.set(n, out);
  return out;
}

// Voice-note bars left-to-right like the apps do; played bars get their own color.
function drawWave(
  ctx: Ctx, x: number, cy: number, w: number, h: number, levels: number[], p: number,
  played: string, rest: string, ratio = 0.5,
) {
  const step = w / levels.length;
  const bw = Math.max(2, step * ratio);
  levels.forEach((lv, i) => {
    const bh = Math.max(bw, h * lv);
    ctx.fillStyle = (i + 0.5) / levels.length <= p ? played : rest;
    ctx.beginPath();
    ctx.roundRect(x + i * step + (step - bw) / 2, cy - bh / 2, bw, bh, bw / 2);
    ctx.fill();
  });
}

// Pause while the reel plays (like a voice note mid-playback), play on the editor still.
function playGlyph(ctx: Ctx, cx: number, cy: number, r: number, color: string, playing: boolean) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (playing) {
    const bw = r * 0.34;
    ctx.roundRect(cx - r * 0.5, cy - r * 0.7, bw, r * 1.4, bw * 0.3);
    ctx.roundRect(cx + r * 0.5 - bw, cy - r * 0.7, bw, r * 1.4, bw * 0.3);
  } else {
    ctx.moveTo(cx - r * 0.45, cy - r * 0.72);
    ctx.lineTo(cx + r * 0.75, cy);
    ctx.lineTo(cx - r * 0.45, cy + r * 0.72);
    ctx.closePath();
  }
  ctx.fill();
}

function text(ctx: Ctx, str: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function bubble(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = h * 0.25;
  ctx.shadowOffsetY = h * 0.04;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

/** Height the counter takes, so the headline block can be laid out before drawing. */
function counterHeight(style: Style, u: number): number {
  switch (style.counterStyle) {
    case 'none':
      return 0;
    case 'bar':
      return Math.max(6, Math.round(u * 0.011)) + u * 0.032 * 1.6;
    case 'player':
      return u * 0.2;
    case 'whatsapp':
    case 'telegram':
      return u * 0.15;
    default:
      return u * 0.12;
  }
}

// Progress + seconds in the chosen CounterStyle.
function drawCounter(f: FrameInfo, y: number, u: number) {
  const { ctx, W, style } = f;
  const { p, sec, total } = clockAt(f);
  const playing = !f.idle;
  const accent = style.accentColor;
  const h = counterHeight(style, u);
  const w = Math.min(W * 0.8, 920);
  const x = W / 2 - w / 2;
  const UI = (weight: number, size: number) => `${weight} ${Math.round(size)}px ${UI_LTR}`;
  ctx.save();

  switch (style.counterStyle) {
    case 'none':
      break;

    case 'whatsapp': {
      // Dark bubble: play, waveform with a blue scrubber dot, times under it, avatar with mic.
      bubble(ctx, x, y, w, h, h * 0.2, '#202c33');
      const cy = y + h * 0.42;
      playGlyph(ctx, x + h * 0.36, cy, h * 0.17, '#aebac1', playing);
      const av = h * 0.32;
      const ax = x + w - h * 0.12 - av;
      ctx.fillStyle = '#5b4fb3';
      ctx.beginPath();
      ctx.arc(ax, y + h / 2, av, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, y + h / 2, av, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#d7cff5';
      ctx.beginPath();
      ctx.arc(ax, y + h / 2 - av * 0.2, av * 0.3, 0, Math.PI * 2);
      ctx.ellipse(ax, y + h / 2 + av * 0.55, av * 0.5, av * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Mic badge beside the avatar.
      const mx = ax - av - h * 0.1;
      const my = y + h * 0.68;
      const mr = h * 0.06;
      ctx.fillStyle = '#53bdeb';
      ctx.beginPath();
      ctx.roundRect(mx - mr * 0.55, my - mr * 1.5, mr * 1.1, mr * 1.9, mr * 0.55);
      ctx.fill();
      ctx.strokeStyle = '#53bdeb';
      ctx.lineWidth = mr * 0.35;
      ctx.beginPath();
      ctx.arc(mx, my - mr * 0.3, mr * 0.95, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.moveTo(mx, my + mr * 0.65);
      ctx.lineTo(mx, my + mr * 1.2);
      ctx.stroke();
      const wx = x + h * 0.66;
      const ww = mx - mr * 2.2 - wx;
      const levels = reelWave(f.timeline, Math.round(ww / (u * 0.014)));
      drawWave(ctx, wx, cy, ww, h * 0.36, levels, p, '#aebac1', 'rgba(174,186,193,0.45)', 0.45);
      ctx.fillStyle = '#53bdeb';
      ctx.beginPath();
      ctx.arc(wx + ww * p, cy, h * 0.075, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, mss(sec), wx, y + h * 0.8, UI(500, h * 0.14), '#8696a0');
      text(ctx, mss(total), mx - mr * 2.2, y + h * 0.8, UI(500, h * 0.14), '#8696a0', 'right');
      break;
    }

    case 'instagram': {
      // Charcoal pill: white play disc, white bars, remaining time in a white pill.
      bubble(ctx, x, y, w, h, h * 0.42, '#262626');
      const cy = y + h / 2;
      const r = h * 0.24;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + h * 0.48, cy, r, 0, Math.PI * 2);
      ctx.fill();
      playGlyph(ctx, x + h * 0.48 + (playing ? 0 : r * 0.08), cy, r * 0.55, '#000', playing);
      ctx.font = UI(700, h * 0.2);
      const tw = ctx.measureText('0:00').width + h * 0.3;
      const th = h * 0.34;
      const tx = x + w - h * 0.28 - tw;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(tx, cy - th / 2, tw, th, th / 2);
      ctx.fill();
      text(ctx, mss(Math.max(0, total - sec)), tx + tw / 2, cy, UI(700, h * 0.2), '#000', 'center');
      const wx = x + h * 0.9;
      const ww = tx - h * 0.2 - wx;
      drawWave(ctx, wx, cy, ww, h * 0.56, reelWave(f.timeline, Math.round(ww / (u * 0.018))), p, '#fff', 'rgba(255,255,255,0.38)', 0.42);
      break;
    }

    case 'telegram': {
      // Blue outgoing bubble: round play button, fine waveform, time and unread dot below.
      bubble(ctx, x, y, w, h, h * 0.2, '#2b5278');
      const cy = y + h * 0.4;
      const r = h * 0.26;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + h * 0.4, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      playGlyph(ctx, x + h * 0.4 + (playing ? 0 : r * 0.08), y + h / 2, r * 0.5, '#2b5278', playing);
      const wx = x + h * 0.8;
      const ww = w - h * 1.05;
      drawWave(ctx, wx, cy, ww, h * 0.34, reelWave(f.timeline, Math.round(ww / (u * 0.011))), p, '#fff', 'rgba(255,255,255,0.35)', 0.55);
      const ty = y + h * 0.75;
      text(ctx, mss(playing ? sec : total), wx, ty, UI(500, h * 0.13), 'rgba(255,255,255,0.75)');
      ctx.font = UI(500, h * 0.13);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(wx + ctx.measureText(mss(playing ? sec : total)).width + h * 0.08, ty, h * 0.028, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'imessage': {
      // Blue capsule: bare play glyph, waveform, time on the right.
      bubble(ctx, x, y, w, h, h / 2, '#0a84ff');
      const cy = y + h / 2;
      playGlyph(ctx, x + h * 0.5, cy, h * 0.16, '#fff', playing);
      ctx.font = UI(600, h * 0.22);
      const tw = ctx.measureText('0:00').width;
      const wx = x + h * 0.85;
      const ww = w - h * 0.85 - tw - h * 0.7;
      drawWave(ctx, wx, cy, ww, h * 0.5, reelWave(f.timeline, Math.round(ww / (u * 0.012))), p, '#fff', 'rgba(255,255,255,0.45)', 0.5);
      text(ctx, mss(playing ? sec : total), x + w - h * 0.45, cy, UI(600, h * 0.22), '#fff', 'right');
      break;
    }

    case 'player': {
      // Music-player controls on frosted glass: scrubber, times, previous / pause / next.
      bubble(ctx, x, y, w, h, h * 0.16, 'rgba(20,20,20,0.55)');
      const lx = x + h * 0.25;
      const lw = w - h * 0.5;
      const ly = y + h * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.roundRect(lx, ly - h * 0.015, lw, h * 0.03, h * 0.015);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(lx, ly - h * 0.015, lw * p, h * 0.03, h * 0.015);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(lx + lw * p, ly, h * 0.05, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, mss(sec), lx, ly + h * 0.14, UI(500, h * 0.1), 'rgba(255,255,255,0.75)');
      text(ctx, `-${mss(Math.max(0, total - sec))}`, lx + lw, ly + h * 0.14, UI(500, h * 0.1), 'rgba(255,255,255,0.75)', 'right');
      const cy = y + h * 0.68;
      const r = h * 0.19;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(W / 2, cy, r, 0, Math.PI * 2);
      ctx.fill();
      playGlyph(ctx, W / 2 + (playing ? 0 : r * 0.08), cy, r * 0.5, '#111', playing);
      // Skip glyphs: two triangles and a bar each side.
      for (const dir of [-1, 1]) {
        const cx = W / 2 + dir * r * 2.6;
        const s = r * 0.42;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx - dir * s, cy - s);
        ctx.lineTo(cx + dir * s * 0.4, cy);
        ctx.lineTo(cx - dir * s, cy + s);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx + dir * s * 0.45 - (dir > 0 ? 0 : s * 0.22), cy - s, s * 0.22, s * 2);
      }
      break;
    }

    default: {
      // Slim bar filling right-to-left, "23s / 60s" under it.
      const barW = Math.min(W * 0.5, 720);
      const barH = Math.max(6, Math.round(u * 0.011));
      const x0 = W / 2 - barW / 2;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.roundRect(x0, y, barW, barH, barH / 2);
      ctx.fill();
      const bw = Math.max(barH, barW * p);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x0 + barW - bw, y, bw, barH, barH / 2);
      ctx.fill();
      const size = Math.round(u * 0.032);
      const cy = y + barH + size * 1.1;
      const gap = size * 0.35;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      text(ctx, `${sec}s`, W / 2 - gap, cy, UI(600, size), '#fff', 'right');
      text(ctx, '/', W / 2, cy, UI(600, size), 'rgba(255,255,255,0.6)', 'center');
      text(ctx, `${total}s`, W / 2 + gap, cy, UI(600, size), 'rgba(255,255,255,0.6)', 'left');
    }
  }
  ctx.restore();
}

/** Draw just the counter, for the style picker thumbnails (canvas is 1080 wide). */
export function drawCounterPreview(ctx: CanvasRenderingContext2D, style: Style) {
  const W = ctx.canvas.width;
  const timeline: Timeline = { segments: [], duration: 47, cut: false, intro: 0, outro: 0 };
  const f = { ctx, W, H: 1920, t: 19, idle: false, timeline, style, phase: 'verse', seg: null, local: 0, audioEnd: 47 } as unknown as FrameInfo;
  ctx.clearRect(0, 0, W, ctx.canvas.height);
  drawCounter(f, (ctx.canvas.height - counterHeight(style, 1080)) / 2, 1080);
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
    const counterH = counterHeight(style, u);
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

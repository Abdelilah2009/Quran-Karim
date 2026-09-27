import { clamp01, drawVerse, easeOut, partLabel, type Ctx } from '../draw';
import type { FrameInfo, Template } from './types';

// Height of each letterbox bar as a fraction of the frame: a 2.39:1 window in
// landscape, proportionally slimmer bars as the frame gets squarer.
function barFrac(W: number, H: number): number {
  if (W > H) return (1 - W / H / 2.39) / 2;
  const r = H / W;
  return r > 1.6 ? 0.14 : r > 1.2 ? 0.12 : 0.1;
}

function vignette(ctx: Ctx, W: number, H: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Film grain: a few hundred specks, reseeded every frame (deterministic per frame index).
function grain(ctx: Ctx, W: number, H: number, frame: number) {
  let s = (frame * 7919 + 17) % 2147483647 || 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 280; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
    const d = 1.5 + r() * 2;
    ctx.fillRect(r() * W, r() * H, d, d);
  }
}

function rule(ctx: Ctx, x0: number, x1: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y - 0.75, x1 - x0, 1.5);
}

export const cinematic: Template = {
  id: 'cinematic',
  name: 'Cinematic',
  description: 'Letterbox bars with the verse as film subtitles.',
  defaults: { position: 'lower', kenBurns: true, overlay: 0.25 },
  watermarkY: 0.955,
  draw(f: FrameInfo) {
    const { ctx, W, H, style, meta, phase, timeline } = f;
    const u = Math.min(W, H);
    const bh = H * barFrac(W, H);
    const k = f.idle ? 1 : easeOut(f.t / 0.8);
    const bar = bh * k;

    vignette(ctx, W, H);
    grain(ctx, W, H, f.idle ? 0 : Math.floor(f.t * 30));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';

    if (phase === 'intro') {
      const a = clamp01(Math.min((f.t - 0.3) / 0.6, (timeline.intro - f.t) / 0.5));
      const grow = 1 + 0.04 * clamp01(f.t / timeline.intro);
      const size = Math.min(style.fontSize * 1.35, W * 0.11);
      const cy = H / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `${Math.round(size * 0.28)}px "Noto Naskh Arabic"`;
      ctx.fillText('تلاوة', W / 2, cy - size * 1.4);
      ctx.save();
      ctx.translate(W / 2, cy);
      ctx.scale(grow, grow);
      ctx.fillStyle = style.accentColor;
      ctx.font = `${size}px "${style.fontFamily}"`;
      ctx.fillText(meta.surahName, 0, 0);
      ctx.restore();
      rule(ctx, W / 2 - u * 0.12, W / 2 + u * 0.12, cy + size * 0.72, style.accentColor);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `${Math.round(size * 0.36)}px "Noto Naskh Arabic"`;
      ctx.fillText(meta.reciterName, W / 2, cy + size * 1.15);
      const part = partLabel(meta);
      if (part) {
        ctx.fillStyle = style.accentColor;
        ctx.font = `${Math.round(size * 0.28)}px "Noto Naskh Arabic"`;
        ctx.fillText(part, W / 2, cy + size * 1.6);
      }
      ctx.restore();
    } else if (phase === 'outro') {
      if (style.outro) {
        const a = clamp01((f.t - f.audioEnd) / 0.6);
        let size = style.fontSize * 1.05;
        ctx.font = `${size}px "${style.fontFamily}"`;
        const tw = ctx.measureText(style.outro).width;
        if (tw > W * 0.8) size *= (W * 0.8) / tw;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 24;
        ctx.fillStyle = style.accentColor;
        ctx.font = `${size}px "${style.fontFamily}"`;
        ctx.fillText(style.outro, W / 2, H / 2);
        rule(ctx, W / 2 - u * 0.1, W / 2 + u * 0.1, H / 2 + size * 0.85, style.accentColor);
        ctx.restore();
      }
    } else if (f.seg) {
      // Soft scrim under the subtitles.
      const sTop = H * 0.55;
      const g = ctx.createLinearGradient(0, sTop, 0, H - bh);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, sTop, W, H - bh - sTop);

      const bottom = H - bh - u * 0.05;
      drawVerse(ctx, f.seg, f.local, style, f.idle, {
        top: H * (W > H ? 0.4 : 0.45),
        bottom,
        y: bottom,
        width: Math.min(W * 0.86, 1400),
        scale: 0.62 * (W > H ? 1.1 : 1),
        maxLines: 2,
        translationScale: W > H ? 0.8 : 0.85,
        translationLines: W > H || H <= W * 1.2 ? 2 : 3,
        translationColor: 'rgba(255,255,255,0.8)',
        translationItalic: true,
        lineHeight: 1.9,
      });
    }

    // Letterbox bars.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    // Credits in the top bar once the title card is gone.
    if (style.showHeader && phase !== 'intro') {
      const a = f.idle ? 1 : clamp01((f.t - timeline.intro - 0.3) / 0.6) * k;
      const sub = [meta.reciterName, partLabel(meta)].filter(Boolean).join('  ·  ');
      ctx.save();
      ctx.globalAlpha = a;
      const cy = bar - bh / 2;
      if (bh > 200) {
        const s1 = Math.round(bh * 0.2);
        ctx.fillStyle = style.accentColor;
        ctx.font = `${s1}px "${style.fontFamily}"`;
        ctx.fillText(meta.surahName, W / 2, cy - s1 * 0.5);
        rule(ctx, W / 2 - u * 0.06, W / 2 + u * 0.06, cy + s1 * 0.35, style.accentColor);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${Math.round(s1 * 0.6)}px "Noto Naskh Arabic"`;
        ctx.fillText(sub, W / 2, cy + s1 * 0.95);
      } else {
        const s1 = Math.round(Math.min(bh * 0.3, 40));
        ctx.font = `${s1}px "${style.fontFamily}"`;
        const w1 = ctx.measureText(meta.surahName).width;
        ctx.font = `${Math.round(s1 * 0.72)}px "Noto Naskh Arabic"`;
        const w2 = ctx.measureText(sub).width;
        const gap = s1 * 1.4;
        const total = w1 + gap + w2;
        const right = W / 2 + total / 2;
        ctx.textAlign = 'right';
        ctx.fillStyle = style.accentColor;
        ctx.font = `${s1}px "${style.fontFamily}"`;
        ctx.fillText(meta.surahName, right, cy);
        ctx.fillRect(right - w1 - gap / 2 - 1, cy - s1 * 0.35, 2, s1 * 0.7);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${Math.round(s1 * 0.72)}px "Noto Naskh Arabic"`;
        ctx.fillText(sub, right - w1 - gap, cy);
        rule(ctx, W / 2 - total / 2 - u * 0.1, W / 2 - total / 2 - u * 0.03, cy, style.accentColor);
        rule(ctx, right + u * 0.03, right + u * 0.1, cy, style.accentColor);
      }
      ctx.restore();
    }

    if (style.showProgress && timeline.duration > 0) {
      const y = H - bar + bh * 0.22;
      const x0 = W * 0.2;
      const x1 = W * 0.8;
      const w = clamp01(f.t / timeline.duration) * (x1 - x0);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x0, y - 1, x1 - x0, 2);
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(x1 - w, y - 1, w, 2);
    }
  },
};

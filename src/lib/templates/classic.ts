import { drawHeader, drawIntro, drawOutro, drawProgress, drawVerse } from '../draw';
import type { Template } from './types';

export const classic: Template = {
  id: 'classic',
  name: 'Classic',
  description: 'Surah title on top, the verse centered, a slim progress bar.',
  defaults: {},
  draw(f) {
    const { ctx, style, meta, timeline, phase } = f;
    if (style.showHeader && phase === 'verse') drawHeader(ctx, meta, style);
    if (phase === 'intro') drawIntro(ctx, f.t, timeline, meta, style);
    else if (phase === 'outro') {
      if (style.outro) drawOutro(ctx, f.t - f.audioEnd, style);
    } else if (f.seg) drawVerse(ctx, f.seg, f.local, style, f.idle);
    if (style.showProgress) drawProgress(ctx, f.t, timeline, style.accentColor);
  },
};

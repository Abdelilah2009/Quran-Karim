import type { Ctx, Meta, Style } from '../draw';
import type { Segment, Timeline } from '../timeline';

/** Everything a template needs to draw one frame (background and dim are already drawn). */
export interface FrameInfo {
  ctx: Ctx;
  W: number;
  H: number;
  t: number; // reel time in seconds
  idle: boolean; // editor still (nothing playing): draw a representative, fully visible state
  timeline: Timeline;
  style: Style;
  meta: Meta;
  phase: 'intro' | 'verse' | 'outro';
  seg: Segment | null; // verse on screen during 'verse' (the first verse when idle)
  local: number; // seconds since seg.start
  audioEnd: number; // when the recitation ends and the outro starts
}

export interface Template {
  id: string;
  name: string;
  description: string; // one short sentence for the picker
  defaults: Partial<Style>; // merged onto the style when the template is chosen
  /** Card lengths in seconds; defaults to the intro/outro toggles in the Publish tab. */
  cards?: (style: Style) => { intro: number; outro: number };
  watermarkY?: number; // fraction of the height for the watermark (default 0.953)
  draw(f: FrameInfo): void;
}

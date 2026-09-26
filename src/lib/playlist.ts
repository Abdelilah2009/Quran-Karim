import type { Timeline } from './timeline';

/** 'verse' = next clip on every new verse, 'even' = reel split equally, number = every N seconds. */
export type SwitchMode = 'verse' | 'even' | number;

export interface ClipState {
  index: number; // clip on screen
  next: number; // clip fading in
  mix: number; // 0..1 opacity of `next`
}

const CROSSFADE = 0.8;
const IDLE_SLOT = 4; // idle preview: cycle clips so the user sees the sequence

function fromBoundaries(t: number, starts: number[], end: number, count: number): ClipState {
  let slot = 0;
  while (slot + 1 < starts.length && t >= starts[slot + 1]) slot++;
  const slotEnd = slot + 1 < starts.length ? starts[slot + 1] : end;
  const toEnd = slotEnd - t;
  const hasNext = slot + 1 < starts.length;
  return {
    index: slot % count,
    next: (slot + 1) % count,
    mix: hasNext && toEnd < CROSSFADE ? 1 - toEnd / CROSSFADE : 0,
  };
}

function fixedSlots(t: number, slotLen: number, count: number, end: number): ClipState {
  const starts: number[] = [];
  for (let s = 0; s < end; s += slotLen) starts.push(s);
  return fromBoundaries(t, starts, end, count);
}

export function clipAt(
  t: number,
  count: number,
  mode: SwitchMode,
  timeline: Timeline | null,
  playing: boolean,
): ClipState {
  if (count <= 1) return { index: 0, next: 0, mix: 0 };
  if (!playing || !timeline) {
    const cycle = IDLE_SLOT * count;
    return fixedSlots(t % cycle, IDLE_SLOT, count, cycle + IDLE_SLOT);
  }
  const end = timeline.duration;
  if (mode === 'verse') return fromBoundaries(t, timeline.segments.map((s) => s.start), end, count);
  if (mode === 'even') return fixedSlots(t, end / count, count, end);
  return fixedSlots(t, mode, count, end);
}

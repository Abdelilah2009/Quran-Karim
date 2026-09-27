export interface Word {
  text: string;
  start: number; // seconds from the segment start
  end: number;
}

export interface Segment {
  surah: number;
  ayah: number; // 0 = basmala
  text: string;
  translation?: string;
  words?: Word[]; // word-level timings (karaoke), when the reciter has them
  buffer: AudioBuffer;
  start: number; // seconds from reel start
  end: number;
}

export interface Timeline {
  segments: Segment[];
  duration: number; // final reel length in seconds, intro and outro included
  cut: boolean; // true if the last ayah is cut off mid-recitation
  intro: number; // seconds of title card before the first ayah
  outro: number; // seconds of closing card after the last ayah
}

export interface FitResult {
  count: number; // how many ayat (from the start of the list) go into the reel
  cutAt: number; // the recitation length in seconds
}

export type TimelineItem = Omit<Segment, 'start' | 'end'>;

const OVERSHOOT = 1.1; // a "60s" reel may run to 66s rather than drop a verse

/**
 * Decide which ayat fit into `target` seconds. Ayat are never cut mid-recitation:
 * whole ayat are added while they fit (with a 10% tolerance), and the first
 * ayah is always kept even when it alone is longer than the target.
 */
export function fitAyatToDuration(durations: number[], target: number | null): FitResult {
  const total = durations.reduce((a, b) => a + b, 0);
  if (target === null) return { count: durations.length, cutAt: total };

  let count = 0;
  let sum = 0;
  while (count < durations.length && (count === 0 || sum + durations[count] <= target * OVERSHOOT)) {
    sum += durations[count++];
  }
  return { count, cutAt: sum };
}

/** Split a long passage into consecutive parts that each fit `target` (for series). */
export function splitIntoParts(durations: number[], target: number): number[] {
  const parts: number[] = [];
  for (let i = 0; i < durations.length; ) {
    const { count } = fitAyatToDuration(durations.slice(i), target);
    parts.push(count);
    i += count;
  }
  return parts;
}

export function buildTimeline(
  items: TimelineItem[],
  target: number | null,
  cards: { intro: number; outro: number } = { intro: 0, outro: 0 },
): Timeline {
  const budget = target === null ? null : Math.max(5, target - cards.intro - cards.outro);
  const { count, cutAt } = fitAyatToDuration(
    items.map((i) => i.buffer.duration),
    budget,
  );
  let t = cards.intro;
  const segments = items.slice(0, Math.max(1, count)).map((i) => {
    const seg = { ...i, start: t, end: t + i.buffer.duration };
    t = seg.end;
    return seg;
  });
  const audioEnd = Math.min(t, cards.intro + cutAt);
  return {
    segments: segments.filter((s) => s.start < audioEnd),
    duration: audioEnd + cards.outro,
    cut: audioEnd < t - 0.05,
    intro: cards.intro,
    outro: cards.outro,
  };
}

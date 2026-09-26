export interface Segment {
  surah: number;
  ayah: number; // 0 = basmala
  text: string;
  translation?: string;
  buffer: AudioBuffer;
  start: number; // seconds from reel start
  end: number;
}

export interface Timeline {
  segments: Segment[];
  duration: number; // final reel length in seconds
  cut: boolean; // true if the last ayah is cut off mid-recitation
}

export interface FitResult {
  count: number; // how many ayat (from the start of the list) go into the reel
  cutAt: number; // the reel length in seconds
}

/**
 * Decide which ayat fit into a reel of `target` seconds.
 *
 * @param durations  length in seconds of each selected ayah, in order
 * @param target     the chosen reel length (30, 60, 90...) or null = "full, no limit"
 *
 * Trade-offs to consider:
 *  - Never cutting an ayah mid-recitation is respectful of the Quran, but a
 *    "60s" reel may then end at 41s.
 *  - Allowing a slight overshoot (e.g. up to +10%) keeps reels close to the target.
 *  - If even the FIRST ayah is longer than the target (e.g. Al-Baqarah 282),
 *    you must still return count >= 1 — either cut it or ignore the target.
 */
export function fitAyatToDuration(durations: number[], target: number | null): FitResult {
  const total = durations.reduce((a, b) => a + b, 0);
  if (target === null) return { count: durations.length, cutAt: total };

  // TODO(you): replace this placeholder with your rule (5-10 lines).
  return { count: durations.length, cutAt: total };
}

export function buildTimeline(
  items: { surah: number; ayah: number; text: string; translation?: string; buffer: AudioBuffer }[],
  target: number | null,
): Timeline {
  const { count, cutAt } = fitAyatToDuration(
    items.map((i) => i.buffer.duration),
    target,
  );
  let t = 0;
  const segments = items.slice(0, Math.max(1, count)).map((i) => {
    const seg = { ...i, start: t, end: t + i.buffer.duration };
    t = seg.end;
    return seg;
  });
  const duration = Math.min(t, cutAt);
  return { segments: segments.filter((s) => s.start < duration), duration, cut: duration < t - 0.05 };
}

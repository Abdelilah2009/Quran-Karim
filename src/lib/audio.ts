let ctx: AudioContext | null = null;

// Must first be called from a user gesture (browser autoplay policy).
export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const pad = (n: number) => String(n).padStart(3, '0');

export const ayahUrl = (reciter: string, surah: number, ayah: number) =>
  `https://everyayah.com/data/${reciter}/${pad(surah)}${pad(ayah)}.mp3`;

const cache = new Map<string, Promise<AudioBuffer>>();

export function loadAyahAudio(reciter: string, surah: number, ayah: number): Promise<AudioBuffer> {
  const url = ayahUrl(reciter, surah, ayah);
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load the recitation for verse ${ayah}.`);
        return r.arrayBuffer();
      })
      .then((buf) => getAudioContext().decodeAudioData(buf));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

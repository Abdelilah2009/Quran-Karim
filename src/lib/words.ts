import type { Word } from './timeline';

// everyayah reciter folder → quran.com recitation id. Only these recitations
// publish word-level timings, and the timings match quran.com's own audio files,
// so karaoke mode loads the audio from there too.
const RECITATION_IDS: Record<string, number> = {
  Alafasy_128kbps: 7,
  Abdul_Basit_Murattal_192kbps: 2,
  Husary_128kbps: 6,
  Minshawy_Murattal_128kbps: 9,
  'Abdurrahmaan_As-Sudais_192kbps': 3,
  'Saood_ash-Shuraym_128kbps': 10,
  'Abu_Bakr_Ash-Shaatree_128kbps': 4,
  Hani_Rifai_192kbps: 5,
};

export const hasWordTimings = (reciter: string) => reciter in RECITATION_IDS;

const API = 'https://api.quran.com/api/v4';
const AUDIO_BASE = 'https://verses.quran.com/';

export interface AyahWords {
  audioUrl: string;
  words: Word[];
}

type Entry = { verse_key: string; url: string; segments?: (number | string)[][] };
type VerseWord = { char_type_name: string; text_uthmani: string };

const cache = new Map<string, Promise<Map<number, AyahWords>>>();

async function fetchPaged<T>(url: string, pick: (json: any) => T[]): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${url}&per_page=50&page=${page}`);
    if (!res.ok) throw new Error("Couldn't load word timings. Try again or turn karaoke off.");
    const json = await res.json();
    out.push(...pick(json));
    if (!json.pagination?.next_page) return out;
  }
}

/** Word texts + timings for every ayah of a surah, keyed by ayah number. */
export function getSurahWords(reciter: string, surah: number): Promise<Map<number, AyahWords>> {
  const id = RECITATION_IDS[reciter];
  const key = `${id}:${surah}`;
  let p = cache.get(key);
  if (!p) {
    p = Promise.all([
      fetchPaged<Entry>(`${API}/recitations/${id}/by_chapter/${surah}?fields=segments`, (j) => j.audio_files),
      fetchPaged<{ verse_number: number; words: VerseWord[] }>(
        `${API}/verses/by_chapter/${surah}?words=true&word_fields=text_uthmani`,
        (j) => j.verses,
      ),
    ]).then(([audio, verses]) => {
      const texts = new Map(
        verses.map((v) => [v.verse_number, v.words.filter((w) => w.char_type_name === 'word').map((w) => w.text_uthmani)]),
      );
      const map = new Map<number, AyahWords>();
      for (const a of audio) {
        const ayah = Number(a.verse_key.split(':')[1]);
        const text = texts.get(ayah) ?? [];
        // Segment = [index, wordPosition (1-based), startMs, endMs]; some entries are malformed.
        const timing = new Map<number, [number, number]>();
        for (const s of a.segments ?? []) {
          if (s.length === 4) timing.set(Number(s[1]), [Number(s[2]) / 1000, Number(s[3]) / 1000]);
        }
        let last = 0;
        const words = text.map((w, i) => {
          const [start, end] = timing.get(i + 1) ?? [last, last];
          last = end;
          return { text: w, start, end };
        });
        const audioUrl = /^(https?:)?\/\//.test(a.url) ? a.url.replace(/^\/\//, 'https://') : AUDIO_BASE + a.url;
        map.set(ayah, { audioUrl, words });
      }
      return map;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const API = 'https://api.alquran.cloud/v1';

export interface SurahMeta {
  number: number;
  name: string;
  englishName: string;
  numberOfAyahs: number;
}

export interface Ayah {
  surah: number;
  numberInSurah: number;
  text: string;
  translation?: string;
}

export const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

export async function getSurahs(): Promise<SurahMeta[]> {
  const res = await fetch(`${API}/surah`);
  if (!res.ok) throw new Error("Couldn't load the surah list. Check your connection and reload.");
  return (await res.json()).data;
}

// The uthmani edition prefixes ayah 1 of every surah (except 1 and 9) with the
// basmala; strip it so the basmala can be toggled as its own segment.
function cleanText(surah: number, ayah: number, text: string): string {
  const t = text.replace(/﻿/g, '').trim();
  if (ayah === 1 && surah !== 1 && surah !== 9 && t.startsWith('بِسْمِ')) {
    return t.split(' ').slice(4).join(' ').trim();
  }
  return t;
}

export async function getAyat(
  surah: number,
  from: number,
  to: number,
  translation: string,
): Promise<Ayah[]> {
  const editions = ['quran-uthmani', translation].filter(Boolean).join(',');
  const res = await fetch(`${API}/surah/${surah}/editions/${editions}`);
  if (!res.ok) throw new Error("Couldn't load the verses. Check your connection and try again.");
  const [arabic, trans] = (await res.json()).data;
  return arabic.ayahs
    .filter((a: { numberInSurah: number }) => a.numberInSurah >= from && a.numberInSurah <= to)
    .map((a: { numberInSurah: number; text: string }) => ({
      surah,
      numberInSurah: a.numberInSurah,
      text: cleanText(surah, a.numberInSurah, a.text),
      translation: trans?.ayahs[a.numberInSurah - 1]?.text,
    }));
}

export function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

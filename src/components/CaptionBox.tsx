import { useEffect, useMemo, useRef, useState } from 'react';
import { getAyat, toArabicDigits, type Ayah } from '../lib/quran';
import './extras.css';

interface Props {
  surah: number;
  surahName: string; // English, e.g. "Al-Fatiha"
  surahArabic: string; // e.g. "سُورَةُ ٱلْفَاتِحَةِ"
  from: number;
  to: number;
  reciterLatin: string;
  reciterArabic: string;
  translation: string; // alquran.cloud edition id, '' = none
}

const LIMIT = 2200; // Instagram caption limit
const BASE_TAGS = ['#Quran', '#القرآن_الكريم', '#quranrecitation', '#islam', '#reels'];

function latinTag(s: string): string {
  const t = s.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]/g, '');
  return t ? `#${t}` : '';
}

function arabicTag(s: string): string {
  const t = s
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/ٱ/g, 'ا')
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return t ? `#${t}` : '';
}

function surahTag(arabic: string): string {
  const bare = arabicTag(arabic).slice(1).replace(/^سورة_?/, '');
  return bare ? `#سورة_${bare}` : '';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max < 2) return '';
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    if (!fallback) throw new Error('Copy failed');
    fallback.focus();
    fallback.select();
    if (!document.execCommand('copy')) throw new Error('Copy failed');
  }
}

export function CaptionBox({ surah, surahName, surahArabic, from, to, reciterLatin, reciterArabic, translation }: Props) {
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ayat, setAyat] = useState<Ayah[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [withArabic, setWithArabic] = useState(true);
  const [withTranslation, setWithTranslation] = useState(true);
  const [withTags, setWithTags] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<number>(undefined);
  const loadedOnce = useRef(false);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // Fetch on first request, then again (debounced) whenever the passage changes.
  useEffect(() => {
    if (!started) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await getAyat(surah, Math.min(from, to), Math.max(from, to), translation);
        if (stale) return;
        if (!result.length) throw new Error('No verses found in this range.');
        setAyat(result);
        loadedOnce.current = true;
      } catch (err) {
        if (!stale) setError((err as Error).message);
      } finally {
        if (!stale) setLoading(false);
      }
    }, loadedOnce.current ? 400 : 0);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [started, attempt, surah, from, to, translation]);

  const { caption, shortened } = useMemo(() => {
    if (!ayat) return { caption: '', shortened: false };
    const first = ayat[0].numberInSurah;
    const last = ayat[ayat.length - 1].numberInSurah;
    const range = first === last ? `${first}` : `${first}–${last}`;
    const reference = `Surah ${surahName} ${range} · Recited by ${reciterLatin}`;
    const tags = withTags
      ? [...BASE_TAGS, latinTag(surahName), surahTag(surahArabic), latinTag(reciterLatin), arabicTag(reciterArabic)]
          .filter((t, i, all) => t && all.indexOf(t) === i)
          .join(' ')
      : '';

    let arabic = withArabic ? ayat.map((a) => `${a.text} ﴿${toArabicDigits(a.numberInSurah)}﴾`).join(' ') : '';
    let trans =
      withTranslation && translation
        ? ayat.filter((a) => a.translation).map((a) => `${a.translation} (${a.numberInSurah})`).join('\n')
        : '';

    const fixed = [reference, tags].filter(Boolean).join('\n\n').length;
    const room = (withArabicText: boolean, withTrans: boolean) =>
      LIMIT - fixed - (withArabicText ? 2 : 0) - (withTrans ? 2 : 0);
    let cut = false;
    if (arabic.length + trans.length > room(!!arabic, !!trans)) {
      cut = true;
      const transRoom = room(!!arabic, true) - arabic.length;
      if (trans && transRoom >= 60) trans = truncate(trans, transRoom);
      else {
        trans = '';
        arabic = truncate(arabic, room(true, false));
      }
    }
    return { caption: [arabic, trans, reference, tags].filter(Boolean).join('\n\n'), shortened: cut };
  }, [ayat, surahName, surahArabic, reciterLatin, reciterArabic, translation, withArabic, withTranslation, withTags]);

  function write() {
    if (started) setAttempt((n) => n + 1);
    else setStarted(true);
  }

  async function copy() {
    setCopyError(false);
    try {
      await copyText(caption, textRef.current);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="caption-box">
      <div className="caption-toggles">
        <label className="check">
          <input type="checkbox" checked={withArabic} onChange={(e) => setWithArabic(e.target.checked)} />
          Arabic text
        </label>
        <label className={`check ${translation ? '' : 'off'}`}>
          <input type="checkbox" checked={withTranslation && !!translation} disabled={!translation}
            onChange={(e) => setWithTranslation(e.target.checked)} />
          Translation
        </label>
        <label className="check">
          <input type="checkbox" checked={withTags} onChange={(e) => setWithTags(e.target.checked)} />
          Hashtags
        </label>
      </div>

      {ayat ? (
        <>
          <textarea ref={textRef} className="caption-text" value={caption} readOnly dir="auto" rows={9}
            aria-label="Caption" aria-busy={loading} />
          <div className="caption-meta">
            <span className={`caption-count ${caption.length > LIMIT ? 'over' : ''}`}>
              {caption.length.toLocaleString('en-US')} / {LIMIT.toLocaleString('en-US')}
            </span>
            {loading && <span className="spinner" role="status" aria-label="Updating caption" />}
            <button type="button" className="btn primary" onClick={copy} disabled={!caption}>
              {copied ? 'Copied' : 'Copy caption'}
            </button>
          </div>
          <p className="visually-hidden" aria-live="polite">{copied ? 'Caption copied' : ''}</p>
          {copyError && <p className="error" role="alert">Couldn’t copy. Select the text and copy it manually.</p>}
          {shortened && (
            <p className="hint">
              Shortened to fit Instagram’s 2,200-character limit. Pick fewer verses for the full text.
            </p>
          )}
        </>
      ) : (
        <div className="caption-start">
          <button type="button" className="btn primary" onClick={write} disabled={loading}>
            {loading ? 'Writing…' : 'Write caption'}
          </button>
          <p className="hint">A ready-to-post caption with the verses, reference and hashtags.</p>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}{' '}
          {!loading && (
            <button type="button" className="link" onClick={write}>
              Try again
            </button>
          )}
        </p>
      )}
      {!translation && ayat && <p className="hint">Pick a translation to include it in the caption.</p>}
    </div>
  );
}

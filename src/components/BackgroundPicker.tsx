import { useState } from 'react';
import { STOCK_VIDEOS, VIDEO_CATEGORIES, type StockVideo } from '../data/videos';
import { PEXELS_KEY_STORAGE, searchPexels } from '../lib/pexels';
import type { SwitchMode } from '../lib/playlist';

interface Props {
  selectedIds: string[]; // in play order when `multi` is on
  loading: { id: string; progress: number } | null;
  onPick: (video: StockVideo) => void;
  onUpload: (file: File) => void;
  multi: boolean;
  onMultiChange: (multi: boolean) => void;
  switchMode: SwitchMode;
  onSwitchModeChange: (mode: SwitchMode) => void;
  onRandom: (videos: StockVideo[]) => void; // replace the clips with these, in order
}

const RANDOM_COUNTS = [3, 5, 8];

const SWITCH_OPTIONS: { value: SwitchMode; label: string }[] = [
  { value: 'verse', label: 'Every verse' },
  { value: 5, label: 'Every 5s' },
  { value: 10, label: 'Every 10s' },
  { value: 'even', label: 'Split evenly' },
];

function readKey(): string {
  try {
    return localStorage.getItem(PEXELS_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function BackgroundPicker({
  selectedIds,
  loading,
  onPick,
  onUpload,
  multi,
  onMultiChange,
  switchMode,
  onSwitchModeChange,
  onRandom,
}: Props) {
  const [randomCount, setRandomCount] = useState(5);
  const [category, setCategory] = useState('all');
  const [apiKey, setApiKey] = useState(readKey);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockVideo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const videos =
    results ?? (category === 'all' ? STOCK_VIDEOS : STOCK_VIDEOS.filter((v) => v.category === category));

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return setResults(null);
    setSearching(true);
    setError('');
    try {
      localStorage.setItem(PEXELS_KEY_STORAGE, apiKey);
    } catch {
      /* storage blocked — key just won't be remembered */
    }
    try {
      setResults(await searchPexels(apiKey.trim(), query.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="bg-picker">
      <div className="multi-box">
        <label className="switch">
          <input type="checkbox" checked={multi} onChange={(e) => onMultiChange(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>
            <strong>Multiple clips</strong>
            <small>Pick several videos. They play in the order you choose.</small>
          </span>
        </label>
        {multi && (
          <div className="field">
            <span>Change clip</span>
            <div className="segmented">
              {SWITCH_OPTIONS.map((o) => (
                <button key={String(o.value)} type="button" className={switchMode === o.value ? 'on' : ''}
                  onClick={() => onSwitchModeChange(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="random-row">
              <button type="button" className="btn" disabled={!!loading || videos.length < 2}
                onClick={() => {
                  const pool = [...videos];
                  for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                  }
                  onRandom(pool.slice(0, Math.min(randomCount, pool.length)));
                }}>
                Pick {randomCount} random clips
              </button>
              <div className="segmented" aria-label="How many random clips">
                {RANDOM_COUNTS.map((n) => (
                  <button key={n} type="button" className={randomCount === n ? 'on' : ''} onClick={() => setRandomCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">
              {selectedIds.length < 2
                ? 'Select at least 2 videos below.'
                : `${selectedIds.length} clips selected. Tap a numbered clip to remove it.`}{' '}
              Random picks come from the category shown below.
            </p>
          </div>
        )}
      </div>

      {results ? (
        <div className="results-bar">
          <span>
            {results.length} Pexels results for “{query}”
          </span>
          <button type="button" className="link" onClick={() => setResults(null)}>
            Back to library
          </button>
        </div>
      ) : (
        <div className="chips" role="tablist" aria-label="Video categories">
          {VIDEO_CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={category === c.id}
              className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="thumbs">
        {videos.map((v) => {
          const isLoading = loading?.id === v.id;
          const order = selectedIds.indexOf(v.id);
          return (
            <button key={v.id} type="button" title={v.title} aria-pressed={order >= 0}
              className={`thumb ${order >= 0 ? 'selected' : ''}`}
              onClick={() => onPick(v)} disabled={!!loading}>
              <img src={v.thumb} alt={v.title} loading="lazy" />
              {multi && order >= 0 && <span className="thumb-order">{order + 1}</span>}
              {isLoading && (
                <span className="thumb-progress">
                  <span style={{ width: `${Math.round(loading.progress * 100)}%` }} />
                </span>
              )}
            </button>
          );
        })}
        {results?.length === 0 && <p className="hint">Nothing found. Try “ocean”, “clouds” or “forest”.</p>}
      </div>

      <label className="upload">
        <input type="file" accept="video/*,image/*"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        <span>Upload your own video or image</span>
      </label>

      <details className="pexels">
        <summary>Search more on Pexels</summary>
        <form onSubmit={search}>
          <label className="field">
            <span>Pexels API key</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your free key" />
          </label>
          <p className="hint">
            Get a free key at{' '}
            <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">pexels.com/api</a>. It stays in
            this browser.
          </p>
          <div className="search-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. desert sunset" />
            <button type="submit" className="btn" disabled={!apiKey || searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </details>
    </div>
  );
}

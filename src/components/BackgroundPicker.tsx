import { useState } from 'react';
import { STOCK_VIDEOS, VIDEO_CATEGORIES, type StockVideo } from '../data/videos';
import { PEXELS_KEY_STORAGE, searchPexels } from '../lib/pexels';

interface Props {
  selectedId: string;
  loading: { id: string; progress: number } | null;
  onPick: (video: StockVideo) => void;
  onUpload: (file: File) => void;
}

function readKey(): string {
  try {
    return localStorage.getItem(PEXELS_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function BackgroundPicker({ selectedId, loading, onPick, onUpload }: Props) {
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
          return (
            <button key={v.id} type="button" title={v.title}
              className={`thumb ${selectedId === v.id ? 'selected' : ''}`}
              onClick={() => onPick(v)} disabled={!!loading}>
              <img src={v.thumb} alt={v.title} loading="lazy" />
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

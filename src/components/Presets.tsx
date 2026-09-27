import { useEffect, useId, useRef, useState } from 'react';
import { BUILT_IN_PRESETS, loadPresets, savePresets, type Preset } from '../data/presets';
import './extras.css';

interface Props {
  current: Omit<Preset, 'id' | 'name' | 'builtIn'>; // what "Save current look" stores
  onApply: (preset: Preset) => void;
}

const SAMPLE = 'بِسْمِ ٱللَّهِ';

export function Presets({ current, onApply }: Props) {
  const id = useId();
  const [userPresets, setUserPresets] = useState(loadPresets);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const statusTimer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  function announce(message: string) {
    setStatus(message);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), 2500);
  }

  function update(list: Preset[]) {
    setUserPresets(list);
    savePresets(list);
  }

  function apply(preset: Preset) {
    onApply(preset);
    announce(`Applied “${preset.name}”`);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: Preset = { ...current, style: { ...current.style }, id: crypto.randomUUID(), name: trimmed };
    // Saving under an existing name replaces that look.
    update([...userPresets.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase()), preset]);
    setName('');
    announce(`Saved “${trimmed}”`);
  }

  function remove(preset: Preset) {
    update(userPresets.filter((p) => p.id !== preset.id));
    announce(`Deleted “${preset.name}”`);
  }

  return (
    <div className="presets">
      <div className="preset-grid">
        {[...BUILT_IN_PRESETS, ...userPresets].map((p) => {
          const look = { ...current.style, ...p.style };
          return (
            <div key={p.id} className="preset">
              <button type="button" className="preset-apply" onClick={() => apply(p)}>
                <span className="preset-swatch" aria-hidden="true">
                  <span lang="ar" dir="rtl" style={{ fontFamily: look.fontFamily, color: look.textColor }}>
                    {SAMPLE}
                  </span>
                  <span className="preset-rule" style={{ background: look.accentColor }} />
                  {look.format && look.format !== '9:16' && <span className="preset-format">{look.format}</span>}
                </span>
                <span className="preset-name">{p.name}</span>
              </button>
              {!p.builtIn && (
                <button type="button" className="preset-delete" aria-label={`Delete “${p.name}”`}
                  title="Delete" onClick={() => remove(p)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form className="field" onSubmit={save}>
        <span id={`${id}-save`}>Save current look</span>
        <div className="search-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this look"
            aria-labelledby={`${id}-save`} maxLength={40} />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Save
          </button>
        </div>
        <p className="hint">Keeps the style, reciter, translation and background in this browser.</p>
      </form>

      <p className="hint preset-status" aria-live="polite">{status}</p>
    </div>
  );
}

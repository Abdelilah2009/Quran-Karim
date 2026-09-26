import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string; // secondary text, e.g. the Arabic surah name
  prefix?: string; // leading marker, e.g. the surah number
}

interface Props<T extends string | number> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  searchable?: boolean;
  placeholder?: string;
  /** Extra control rendered at the end of each option (e.g. a listen button). */
  renderAction?: (option: SelectOption<T>) => ReactNode;
  onClose?: () => void;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  searchable,
  placeholder = 'Search',
  renderAction,
  onClose,
}: Props<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.label, o.hint ?? '', o.prefix ?? ''].some((s) => s.toLowerCase().includes(q)),
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) onClose?.();
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // On open: highlight the current value and scroll it into view.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      listRef.current?.children[i]?.scrollIntoView({ block: 'center' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(o: SelectOption<T>) {
    onChange(o.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && filtered[active]) choose(filtered[active]);
    else if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else return;
    e.preventDefault();
  }

  return (
    <div className={`select ${open ? 'open' : ''}`} ref={rootRef} onKeyDown={onKeyDown}>
      <span className="select-label" id={`${id}-label`}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected?.prefix && <span className="opt-prefix">{selected.prefix}</span>}
        <span className="opt-label">{selected?.label ?? '—'}</span>
        {selected?.hint && <span className="opt-hint" lang="ar">{selected.hint}</span>}
        <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="select-pop">
          {searchable && (
            <input
              ref={searchRef}
              className="select-search"
              value={query}
              placeholder={placeholder}
              aria-label={`Search ${label}`}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
          )}
          <ul ref={listRef} role="listbox" aria-labelledby={`${id}-label`} tabIndex={-1}>
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`${i === active ? 'active' : ''} ${o.value === value ? 'chosen' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.prefix && <span className="opt-prefix">{o.prefix}</span>}
                <span className="opt-label">{o.label}</span>
                {o.hint && <span className="opt-hint" lang="ar">{o.hint}</span>}
                {renderAction && (
                  <span className="opt-action" onClick={(e) => e.stopPropagation()}>
                    {renderAction(o)}
                  </span>
                )}
              </li>
            ))}
            {!filtered.length && <li className="empty">No match for “{query}”</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

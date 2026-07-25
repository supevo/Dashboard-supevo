'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { de } from '@/lib/i18n/de';

interface Hit {
  id: string;
  label: string;
  sub: string;
  href: string;
}

/** Global ⌘K / Ctrl+K search palette for the agency workspace. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else {
      setQuery('');
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          const d = (await res.json()) as {
            clients: Hit[];
            projects: Hit[];
            tasks: Hit[];
          };
          setHits([...d.clients, ...d.projects, ...d.tasks]);
          setActive(0);
        }
      } catch {
        /* aborted or network error */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const go = useCallback(
    (hit: Hit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted sm:flex"
      >
        <span>{de.search.placeholder}</span>
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={de.search.placeholder}
              className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-80 overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {de.search.hint}
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {loading ? de.search.loading : de.search.empty}
                </p>
              ) : (
                <ul>
                  {hits.map((h, i) => (
                    <li key={`${h.sub}-${h.id}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                          i === active ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="truncate">{h.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {h.sub}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

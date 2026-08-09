'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';

interface DriveItem {
  id: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  childCount: number | null;
}

interface Crumb {
  id: string | null;
  name: string;
}

function formatSize(n: number | null): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Inline browser for a client's mapped OneDrive folder: click through subfolders
 * (breadcrumbs) and download files. Loads only the currently open folder on
 * demand (one Graph call per click), and downloads go straight from Microsoft –
 * so it costs no server bandwidth. Navigation is confined to the client's folder
 * by the browse API.
 */
export function ClientFilesBrowser({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { id: null, name: 'Kundenordner' },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (folderId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const base = `/api/integrations/onedrive/browse?clientCompanyId=${encodeURIComponent(
          clientCompanyId,
        )}`;
        const url = folderId
          ? `${base}&folderId=${encodeURIComponent(folderId)}`
          : base;
        const res = await fetch(url, { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as
          | { items?: DriveItem[]; error?: string }
          | null;
        if (data?.error === 'no_folder') {
          setError('Für diesen Kunden ist kein OneDrive-Ordner verknüpft.');
          setItems([]);
          return;
        }
        if (data?.error === 'out_of_scope') {
          setError('Dieser Ordner liegt außerhalb des Kundenordners.');
          setItems([]);
          return;
        }
        if (!res.ok || data?.error === 'not_connected') {
          setError('OneDrive ist nicht verbunden.');
          setItems([]);
          return;
        }
        setItems(data?.items ?? []);
      } catch {
        setError('OneDrive konnte nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    },
    [clientCompanyId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function openFolder(item: DriveItem) {
    const next = [...crumbs, { id: item.id, name: item.name }];
    setCrumbs(next);
    void load(item.id);
  }

  function goToCrumb(index: number) {
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    void load(next[next.length - 1]?.id ?? null);
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={`${c.id ?? 'root'}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button
              type="button"
              onClick={() => goToCrumb(i)}
              className="rounded px-1 hover:bg-muted hover:text-foreground"
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-96 overflow-y-auto rounded-md border">
        {loading ? (
          <p className="p-3 text-sm text-muted-foreground">Lädt …</p>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            Dieser Ordner ist leer.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((it) =>
              it.isFolder ? (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => openFolder(it)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>📁</span>
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    <span className="text-muted-foreground">›</span>
                  </button>
                </li>
              ) : (
                <li key={it.id}>
                  <a
                    href={`/api/integrations/onedrive/download?itemId=${encodeURIComponent(
                      it.id,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span>📄</span>
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatSize(it.size)}
                    </span>
                    <span className="text-muted-foreground">⬇</span>
                  </a>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

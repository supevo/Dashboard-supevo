'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export interface DriveItem {
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

/**
 * Modal file/folder browser for the connected OneDrive. In "folder" mode a
 * "Diesen Ordner wählen" button confirms the current folder; in "file" mode a
 * click on a file selects it. Navigation is breadcrumb-based.
 */
export function OneDriveBrowser({
  open,
  onClose,
  mode,
  title,
  onPickFile,
  onPickFolder,
  busy = false,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'file' | 'folder';
  title: string;
  onPickFile?: (item: DriveItem) => void;
  onPickFolder?: (item: Crumb) => void;
  busy?: boolean;
  /** 'full' browses the entire OneDrive (admins) instead of the configured base. */
  scope?: 'full';
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'OneDrive' }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = crumbs[crumbs.length - 1] ?? { id: null, name: 'OneDrive' };

  const load = useCallback(
    async (folderId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      if (scope) params.set('scope', scope);
      const qs = params.toString();
      const url = qs
        ? `/api/integrations/onedrive/browse?${qs}`
        : '/api/integrations/onedrive/browse';
      const res = await fetch(url, { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as
        | { items?: DriveItem[]; error?: string }
        | null;
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
    [scope],
  );

  useEffect(() => {
    if (open) {
      setCrumbs([{ id: null, name: 'OneDrive' }]);
      void load(null);
    }
  }, [open, load]);

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
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* Breadcrumbs */}
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

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Lädt …</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Dieser Ordner ist leer.</p>
          ) : (
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    disabled={busy || (mode === 'folder' && !it.isFolder)}
                    onClick={() => {
                      if (it.isFolder) openFolder(it);
                      else if (mode === 'file') onPickFile?.(it);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
                  >
                    <span>{it.isFolder ? '📁' : '📄'}</span>
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    {it.isFolder && <span className="text-muted-foreground">›</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Schließen
          </Button>
          {mode === 'folder' && (
            <Button
              type="button"
              size="sm"
              disabled={busy || current.id === null}
              onClick={() => onPickFolder?.(current)}
              title={current.id === null ? 'Bitte in einen Ordner navigieren' : undefined}
            >
              {busy ? 'Speichert …' : `„${current.name}" wählen`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

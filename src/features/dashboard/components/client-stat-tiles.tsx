'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import type { ClientTaskRef } from '@/features/dashboard/queries';

interface Tile {
  key: string;
  label: string;
  tasks: ClientTaskRef[];
}

/**
 * The three portal overview tiles (offen / in Bearbeitung / zur Freigabe).
 * Clicking a tile opens a simple popup listing the matching tasks, each linking
 * to the task. Replaces the removed "Freigaben" menu entry.
 */
export function ClientStatTiles({ tiles }: { tiles: Tile[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const active = tiles.find((t) => t.key === openKey) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpenKey(t.key)}
            className="rounded-lg border bg-card p-4 text-left transition hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
          >
            <div className="text-2xl font-bold">{t.tasks.length}</div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </button>
        ))}
      </div>

      <Modal
        open={active != null}
        onClose={() => setOpenKey(null)}
        title={active ? active.label : ''}
      >
        {active && active.tasks.length > 0 ? (
          <ul className="divide-y">
            {active.tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/portal/projects/${task.projectId}/tasks/${task.id}`}
                  onClick={() => setOpenKey(null)}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                >
                  <span className="min-w-0 truncate">{task.title}</span>
                  <span className="shrink-0 text-muted-foreground">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aktuell nichts vorhanden.
          </p>
        )}
      </Modal>
    </>
  );
}

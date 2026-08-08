'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createClientPageAction,
  updateClientPageAction,
  deleteClientPageAction,
} from '@/features/client-pages/actions';
import { idleResult } from '@/lib/action-result';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';
import { PAGE_STATUSES, type ClientPageStatus } from '@/features/client-pages/schema';
import type { ClientPage } from '@/features/client-pages/queries';

const STATUS_LABEL: Record<ClientPageStatus, string> = {
  draft: 'Entwurf',
  ready: 'Bereit',
  used: 'Verwendet',
  archived: 'Archiv',
};

const STATUS_DOT: Record<ClientPageStatus, string> = {
  draft: 'bg-amber-500',
  ready: 'bg-emerald-500',
  used: 'bg-sky-500',
  archived: 'bg-muted-foreground',
};

/** Hidden "+ page / + folder" create form (title defaults, then edited inline). */
function CreateButton({
  clientCompanyId,
  parentId,
  isFolder,
  label,
  className,
}: {
  clientCompanyId: string;
  parentId?: string;
  isFolder?: boolean;
  label: string;
  className?: string;
}) {
  const [, action] = useActionState(createClientPageAction, idleResult);
  const router = useRouter();
  return (
    <form action={action} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="title" value={isFolder ? 'Neuer Ordner' : 'Neue Seite'} />
      <input type="hidden" name="isFolder" value={isFolder ? 'true' : 'false'} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <button
        type="submit"
        className={cn(
          'rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        {label}
      </button>
    </form>
  );
}

function PageEditor({
  page,
  clientCompanyId,
  onDeleted,
}: {
  page: ClientPage;
  clientCompanyId: string;
  onDeleted: () => void;
}) {
  const [saveState, save] = useActionState(updateClientPageAction, idleResult);
  const [deleteState, remove] = useActionState(deleteClientPageAction, idleResult);
  const router = useRouter();

  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [status, setStatus] = useState<ClientPageStatus>(page.status);

  // Reseed local fields when a different page is selected.
  useEffect(() => {
    setTitle(page.title);
    setContent(page.content);
    setStatus(page.status);
  }, [page.id, page.title, page.content, page.status]);

  useEffect(() => {
    if (saveState.status === 'success') router.refresh();
  }, [saveState, router]);

  useEffect(() => {
    if (deleteState.status === 'success') {
      onDeleted();
      router.refresh();
    }
  }, [deleteState, onDeleted, router]);

  return (
    <div className="space-y-4">
      {saveState.status === 'error' && (
        <Alert variant="destructive">{saveState.message}</Alert>
      )}
      {saveState.status === 'success' && (
        <Alert variant="success">{saveState.message}</Alert>
      )}

      <form action={save} className="space-y-4">
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <input type="hidden" name="status" value={status} />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 flex-1 text-base font-semibold"
            required
          />
          {!page.isFolder && (
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as ClientPageStatus)}
              className="h-10 w-auto"
            >
              {PAGE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </div>

        {!page.isFolder && (
          <Textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Notizen, Entwurf, Ideen … (Markdown möglich)"
            className="min-h-[320px] font-mono text-sm"
          />
        )}
        {page.isFolder && <input type="hidden" name="content" value="" />}

        <div className="flex items-center justify-between">
          <SubmitButton>Speichern</SubmitButton>
          <span className="text-xs text-muted-foreground">
            Zuletzt geändert:{' '}
            {new Date(page.updatedAt).toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </form>

      <form action={remove} onSubmit={() => undefined}>
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <SubmitButton variant="destructive" size="sm">
          {page.isFolder ? 'Ordner löschen' : 'Seite löschen'}
        </SubmitButton>
        {deleteState.status === 'error' && (
          <p className="mt-1 text-xs text-destructive">{deleteState.message}</p>
        )}
      </form>
    </div>
  );
}

/**
 * Two-pane workspace for a client's internal pages: a folder/page tree on the
 * left (one folder level, like the reference), an editor on the right. Search
 * and a status filter keep "bunkered" drafts findable without deep nesting.
 */
export function ClientPagesManager({
  clientCompanyId,
  pages,
}: {
  clientCompanyId: string;
  pages: ClientPage[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientPageStatus>('all');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (p: ClientPage): boolean => {
      if (p.isFolder) return true;
      if (q && !p.title.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    };
  }, [search, statusFilter]);

  const folders = pages.filter((p) => p.isFolder);
  const pagesByParent = useMemo(() => {
    const map = new Map<string, ClientPage[]>();
    for (const p of pages) {
      if (p.isFolder) continue;
      const key = p.parentId ?? '__root__';
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [pages]);

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  function PageRow({ p }: { p: ClientPage }) {
    return (
      <button
        type="button"
        onClick={() => setSelectedId(p.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
          selectedId === p.id
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[p.status])}
          title={STATUS_LABEL[p.status]}
        />
        <span className="min-w-0 truncate">{p.title}</span>
      </button>
    );
  }

  const rootPages = (pagesByParent.get('__root__') ?? []).filter(matches);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(220px,280px)_1fr]">
      {/* Tree */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Seiten durchsuchen …"
          className="h-9"
        />
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'all' | ClientPageStatus)
          }
          className="h-9 w-full"
        >
          <option value="all">Alle Status</option>
          {PAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>

        <div className="flex gap-2">
          <CreateButton
            clientCompanyId={clientCompanyId}
            label="+ Seite"
            className="flex-1"
          />
          <CreateButton
            clientCompanyId={clientCompanyId}
            isFolder
            label="+ Ordner"
            className="flex-1"
          />
        </div>

        <div className="space-y-2">
          {folders.map((folder) => {
            const children = (pagesByParent.get(folder.id) ?? []).filter(matches);
            return (
              <div key={folder.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(folder.id)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium',
                    selectedId === folder.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <span aria-hidden>📁</span>
                  <span className="min-w-0 truncate">{folder.title}</span>
                </button>
                <div className="ml-3 border-l pl-2">
                  {children.map((p) => (
                    <PageRow key={p.id} p={p} />
                  ))}
                  <CreateButton
                    clientCompanyId={clientCompanyId}
                    parentId={folder.id}
                    label="+ Seite hier"
                    className="mt-1 w-full border-dashed"
                  />
                </div>
              </div>
            );
          })}

          {rootPages.map((p) => (
            <PageRow key={p.id} p={p} />
          ))}

          {pages.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              Noch keine Seiten. Lege oben eine an.
            </p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-lg border bg-card p-4">
        {selected ? (
          <PageEditor
            key={selected.id}
            page={selected}
            clientCompanyId={clientCompanyId}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p className="text-3xl">📄</p>
            <p className="mt-2">Wähle links eine Seite oder lege eine neue an.</p>
          </div>
        )}
      </div>
    </div>
  );
}

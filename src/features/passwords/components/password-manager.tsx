'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPasswordEntryAction,
  deletePasswordEntryAction,
  revealPasswordAction,
} from '@/features/passwords/actions';
import type { PasswordEntry } from '@/features/passwords/queries';
import { PW_CATEGORIES } from '@/features/passwords/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CopyButton({ getValue, label }: { getValue: () => Promise<string> | string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(await getValue());
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? '✓' : '⧉'}
    </button>
  );
}

function EntryRow({ entry }: { entry: PasswordEntry }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reveal() {
    setError(null);
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    start(async () => {
      const res = await revealPasswordAction(entry.id);
      if (!res.ok) setError(res.error);
      else setRevealed(res.secret);
    });
  }

  function remove() {
    if (!confirm(`„${entry.title}" wirklich löschen?`)) return;
    start(async () => {
      await deletePasswordEntryAction(entry.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{entry.title}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {entry.username && (
            <span className="inline-flex items-center gap-1">
              👤 {entry.username}
              <CopyButton getValue={() => entry.username ?? ''} label="Benutzername kopieren" />
            </span>
          )}
          {entry.url && (
            <a href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              🔗 {entry.url}
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {entry.hasSecret ? (
          <>
            <code className="rounded bg-muted px-2 py-1 text-xs">
              {revealed ?? '••••••••'}
            </code>
            {revealed && <CopyButton getValue={() => revealed} label="Passwort kopieren" />}
            <Button size="sm" variant="outline" onClick={reveal} disabled={pending}>
              {revealed ? 'Verbergen' : 'Anzeigen'}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">kein Passwort</span>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Löschen"
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </div>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PasswordManager({ entries }: { entries: PasswordEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', username: '', secret: '', url: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            (e.username ?? '').toLowerCase().includes(q) ||
            (e.url ?? '').toLowerCase().includes(q),
        )
      : entries;
    const map = new Map<string, PasswordEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    // Keep the fixed category order, then any extras.
    const order = [...PW_CATEGORIES, ...[...map.keys()].filter((c) => !PW_CATEGORIES.includes(c as never))];
    return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [entries, query]);

  function submit() {
    setError(null);
    start(async () => {
      const res = await createPasswordEntryAction(form);
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setForm({ title: '', username: '', secret: '', url: '', notes: '' });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="h-9 max-w-xs"
        />
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Abbrechen' : '+ Neues Passwort'}
        </Button>
      </div>

      {open && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pw-title">Titel *</Label>
                <Input id="pw-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z. B. Instagram – Kunde XY" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw-user">Benutzername</Label>
                <Input id="pw-user" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw-secret">Passwort</Label>
                <Input id="pw-secret" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw-url">URL</Label>
                <Input id="pw-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Die Kategorie wird automatisch per KI anhand des Titels vergeben. Das
              Passwort wird verschlüsselt gespeichert.
            </p>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button size="sm" onClick={submit} disabled={pending || form.title.trim().length < 1}>
              {pending ? 'Speichere…' : 'Speichern'}
            </Button>
          </CardContent>
        </Card>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Passwörter gespeichert.</p>
      ) : (
        grouped.map(([category, list]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {category}{' '}
                <span className="text-xs font-normal text-muted-foreground">({list.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {list.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

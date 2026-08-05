'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzePasswordImportAction,
  commitPasswordImportAction,
  type PwImportRow,
} from '@/features/passwords/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function PasswordImport() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PwImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [importing, startImport] = useTransition();

  function analyze() {
    setError(null);
    setDone(null);
    setRows(null);
    startAnalyze(async () => {
      const res = await analyzePasswordImportAction(text);
      if (!res.ok) setError(res.error);
      else setRows(res.rows);
    });
  }

  function runImport() {
    if (!rows || rows.length === 0) return;
    setError(null);
    startImport(async () => {
      const res = await commitPasswordImportAction(rows);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`${res.inserted} Passwörter importiert.`);
      setRows(null);
      setText('');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📥 KI-Import (Excel)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Kopiere die Tabelle aus Excel und füge sie hier ein. Die KI erkennt
          Titel, Benutzername, Passwort und URL und sortiert automatisch in
          Kategorien.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'Instagram Kunde XY\tinfo@…\tGeheim123\thttps://instagram.com'}
          className="font-mono text-xs"
        />
        <Button size="sm" onClick={analyze} disabled={analyzing || text.trim().length < 3}>
          {analyzing ? 'Analysiere…' : '✨ Analysieren'}
        </Button>
        {error && <Alert variant="destructive">{error}</Alert>}
        {done && <Alert>{done}</Alert>}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-2 text-left">Titel</th>
                    <th className="p-2 text-left">Benutzer</th>
                    <th className="p-2 text-left">Passwort</th>
                    <th className="p-2 text-left">Kategorie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2">{r.title}</td>
                      <td className="p-2 text-muted-foreground">{r.username ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{r.password ? '••••••' : '—'}</td>
                      <td className="p-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.category}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" onClick={runImport} disabled={importing}>
              {importing ? 'Importiere…' : `${rows.length} Einträge importieren`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  analyzeTimeImportAction,
  commitTimeImportAction,
  type ImportPreviewRow,
  type MemberOption,
} from '@/features/time-import/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function fmtHours(min: number): string {
  return (min / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function TimeImport() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [assign, setAssign] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [source, setSource] = useState<'ai' | 'heuristic' | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [importing, startImport] = useTransition();

  const readyCount = useMemo(
    () => Object.values(assign).filter(Boolean).length,
    [assign],
  );

  function analyze() {
    setError(null);
    setDone(null);
    setRows(null);
    setSource(null);
    startAnalyze(async () => {
      const res = await analyzeTimeImportAction(text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.rows);
      setMembers(res.members);
      setSource(res.source);
      // Preselect the matched member per row.
      const initial: Record<number, string> = {};
      res.rows.forEach((r, i) => {
        initial[i] = r.userId ?? '';
      });
      setAssign(initial);
    });
  }

  function runImport() {
    if (!rows) return;
    setError(null);
    setDone(null);
    const payload = rows
      .map((r, i) => ({ userId: assign[i] ?? '', date: r.date, minutes: r.minutes }))
      .filter((r) => r.userId);
    if (payload.length === 0) {
      setError('Keine Zeile ist einem Mitarbeiter zugeordnet.');
      return;
    }
    startImport(async () => {
      const res = await commitTimeImportAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`${res.inserted} Einträge importiert.`);
      setRows(null);
      setText('');
      setAssign({});
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Daten einfügen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Kopiere die Tabelle aus Excel (Spalten egal) und füge sie hier ein.
            Die KI erkennt Mitarbeiter, Datum und Stunden automatisch.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'Max Mustermann\t01.08.2026\t8,5\nErika Beispiel\t01.08.2026\t7:30'}
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={analyze} disabled={analyzing || text.trim().length < 3}>
            {analyzing ? 'Analysiere…' : '✨ Analysieren'}
          </Button>
          {error && <Alert variant="destructive">{error}</Alert>}
          {done && <Alert>{done}</Alert>}
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle>2. Prüfen &amp; zuordnen ({readyCount}/{rows.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Nicht erkannte Mitarbeiter bitte zuordnen. Zeilen ohne Zuordnung
              werden übersprungen.
            </p>
            {source && (
              <p className="text-xs text-muted-foreground">
                Erkennung:{' '}
                {source === 'ai' ? (
                  <span className="font-medium text-primary">🤖 KI</span>
                ) : (
                  <span className="font-medium">📐 einfache Erkennung (ohne KI)</span>
                )}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left">Aus Datei</th>
                    <th className="py-2 text-left">Datum</th>
                    <th className="py-2 text-right">Stunden</th>
                    <th className="py-2 text-left">Mitarbeiter</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5">{r.employee}</td>
                      <td className="py-1.5">{r.date.split('-').reverse().join('.')}</td>
                      <td className="py-1.5 text-right">{fmtHours(r.minutes)}</td>
                      <td className="py-1.5">
                        <Select
                          value={assign[i] ?? ''}
                          onChange={(e) =>
                            setAssign((a) => ({ ...a, [i]: e.target.value }))
                          }
                          className={`h-8 ${assign[i] ? '' : 'border-amber-400'}`}
                        >
                          <option value="">– ignorieren –</option>
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Button size="sm" onClick={runImport} disabled={importing || readyCount === 0}>
                {importing ? 'Importiere…' : `${readyCount} Einträge importieren`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface ProjectOption {
  id: string;
  name: string;
}

interface ImportResult {
  tasksCreated: number;
  commentsCreated: number;
  skipped: number;
}

export function BoardImportForm({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [taskVisible, setTaskVisible] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit() {
    setError(null);
    setResult(null);
    if (!projectId) {
      setError('Bitte ein Zielprojekt wählen.');
      return;
    }
    if (!file) {
      setError('Bitte eine CSV-Datei wählen.');
      return;
    }
    const fd = new FormData();
    fd.set('projectId', projectId);
    fd.set('delimiter', delimiter);
    // Server default is internal; send visibility only when the box is ticked.
    fd.set('taskInternal', taskVisible ? 'false' : 'true');
    fd.set('commentInternal', commentVisible ? 'false' : 'true');
    fd.set('file', file);

    setBusy(true);
    try {
      const res = await fetch('/api/admin/board-import', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Import fehlgeschlagen.');
        return;
      }
      setResult(data);
    } catch {
      setError('Import fehlgeschlagen (Netzwerk/Server).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <Label htmlFor="project">Zielprojekt / Board</Label>
          <Select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">– Projekt wählen –</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Die Aufgaben landen in der ersten Spalte (Queue) des Boards.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="file">CSV-Datei</Label>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Spalten: Aufgabe, Beschreibung, Kommentare. Titelzeilen über der
            Kopfzeile werden automatisch übersprungen.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="delimiter">Trennzeichen</Label>
          <Select
            id="delimiter"
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            className="w-40"
          >
            <option value=",">Komma (,)</option>
            <option value=";">Semikolon (;)</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Deutsches Excel exportiert meist mit Semikolon.
          </p>
        </div>

        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taskVisible}
              onChange={(e) => setTaskVisible(e.target.checked)}
            />
            Aufgaben für den Kunden sichtbar machen (sonst nur intern)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={commentVisible}
              onChange={(e) => setCommentVisible(e.target.checked)}
            />
            Kommentare für den Kunden sichtbar machen (sonst nur intern)
          </label>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
        {result && (
          <Alert>
            {result.tasksCreated} Aufgaben und {result.commentsCreated} Kommentare
            importiert{result.skipped > 0 ? `, ${result.skipped} übersprungen` : ''}.
          </Alert>
        )}

        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? 'Importiere…' : 'Board importieren'}
        </Button>
      </CardContent>
    </Card>
  );
}

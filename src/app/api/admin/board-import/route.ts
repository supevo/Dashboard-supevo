import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { isSuperAdmin } from '@/lib/authz/policies';
import { parseCsv } from '@/lib/csv';
import {
  importBoardTasks,
  type BoardImportRow,
} from '@/features/board-import/import';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Finds the column index whose header contains any of the given needles. */
function findCol(header: string[], needles: string[], fallback: number): number {
  const idx = header.findIndex((h) =>
    needles.some((n) => h.trim().toLowerCase().includes(n)),
  );
  return idx >= 0 ? idx : fallback;
}

/**
 * Temporary super-admin board migration: upload a CSV exported from the old
 * board (columns Aufgabe | Beschreibung | Kommentare) and create the tasks –
 * with their comments – on a chosen project board.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    return NextResponse.json({ error: 'Nur für Super-Admins.' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const projectId = String(form.get('projectId') ?? '').trim();
  const delimiter = String(form.get('delimiter') ?? ',') === ';' ? ';' : ',';
  const taskInternal = form.get('taskInternal') === 'true';
  const commentInternal = form.get('commentInternal') !== 'false'; // default true

  if (!projectId) {
    return NextResponse.json({ error: 'Kein Projekt gewählt.' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
  }

  const text = await file.text();
  const grid = parseCsv(text, delimiter);
  if (grid.length === 0) {
    return NextResponse.json({ error: 'Die Datei ist leer.' }, { status: 400 });
  }

  // Find the header row (the one containing "Aufgabe"); skip any title rows
  // above it. Fall back to the first row if no explicit header is present.
  let headerIdx = grid.findIndex((r) =>
    r.some((c) => c.trim().toLowerCase() === 'aufgabe'),
  );
  if (headerIdx < 0) headerIdx = 0;
  const header = grid[headerIdx] ?? [];

  const tCol = findCol(header, ['aufgabe', 'titel', 'title', 'task'], 0);
  const dCol = findCol(header, ['beschreib', 'description', 'briefing'], 1);
  const cCol = findCol(header, ['kommentar', 'comment'], 2);

  const rows: BoardImportRow[] = grid
    .slice(headerIdx + 1)
    .map((r) => ({
      title: (r[tCol] ?? '').trim(),
      description: r[dCol] ?? '',
      comments: r[cCol] ?? '',
    }))
    .filter((r) => r.title.length > 0);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Keine Aufgaben in der Datei erkannt.' },
      { status: 400 },
    );
  }

  const result = await importBoardTasks({
    projectId,
    actorId: user.id,
    rows,
    taskInternal,
    commentInternal,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}

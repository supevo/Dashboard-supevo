import 'server-only';
import { listCeoTasks } from './queries';
import {
  createCeoTaskAction,
  updateCeoTaskAction,
  moveCeoTaskAction,
} from './actions';
import { CEO_COLUMNS, quadrantMeta, formatMinutes } from './types';
import type { ActionResult } from '@/lib/action-result';

function errMsg(res: ActionResult): string {
  return 'message' in res && res.message ? res.message : 'unbekannter Fehler';
}

/**
 * Werkzeuge des GF-Coaches. Lesen über listCeoTasks (RLS → nur eigene Karten),
 * Schreiben über die bestehenden Server-Actions (die requireCeo/Super-Admin
 * erzwingen). Der Coach handelt also mit genau den Rechten des angemeldeten
 * Geschäftsführers.
 */
export const coachTools = [
  {
    type: 'function',
    function: {
      name: 'list_ceo_tasks',
      description:
        'Listet alle aktuellen GF-Board-Karten (Backlog/Heute/In Arbeit/Erledigt) mit Status, Eisenhower-Quadrant, Energie, Aufwand (Min.), Bereich und Fälligkeit. Zum aktuellen Stand nach Änderungen erneut aufrufen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ceo_task',
      description:
        'Legt eine neue GF-Karte an. Nur aufrufen, wenn der Nutzer eine Karte anlegen möchte (nicht automatisch beim Tagesplan).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          notes: { type: 'string', description: 'optional' },
          status: {
            type: 'string',
            enum: ['backlog', 'today', 'doing', 'done'],
            description: 'Standard: today',
          },
          quadrant: {
            type: 'integer',
            description: 'Eisenhower 1–4 (1=wichtig&dringend … 4=weder)',
          },
          energy: { type: 'string', enum: ['deep', 'shallow'] },
          area: { type: 'string', description: 'z. B. Vertrieb, Strategie, Finanzen' },
          estimateMin: { type: 'integer', description: 'geschätzter Aufwand in Minuten' },
          dueDate: { type: 'string', description: 'ISO-Datum YYYY-MM-DD, optional' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ceo_task',
      description:
        'Ändert Felder einer bestehenden Karte (per taskId aus list_ceo_tasks). Nur bei ausdrücklichem Wunsch/Zustimmung des Nutzers.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          quadrant: { type: 'integer' },
          energy: { type: 'string', enum: ['deep', 'shallow'] },
          area: { type: 'string' },
          estimateMin: { type: 'integer' },
          dueDate: { type: 'string' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_ceo_task',
      description:
        'Verschiebt eine Karte in eine andere Spalte (backlog/today/doing/done). Für „auf heute", „erledigt", „zurück ins Backlog".',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string', enum: ['backlog', 'today', 'doing', 'done'] },
        },
        required: ['taskId', 'status'],
      },
    },
  },
] as const;

/** Aktuelle Board-Karten als kompakter Text (für den System-Kontext). */
export async function ceoBoardSnapshot(): Promise<string> {
  const tasks = await listCeoTasks();
  if (tasks.length === 0) return 'Das GF-Board ist aktuell leer.';
  const labelOf = (s: string) => CEO_COLUMNS.find((c) => c.key === s)?.label ?? s;
  const lines = tasks.slice(0, 80).map((t) => {
    const q = quadrantMeta(t.quadrant);
    const parts = [
      `[${t.id}]`,
      t.title,
      `— ${labelOf(t.status)}`,
      q ? `${q.short}` : null,
      t.energy === 'deep' ? 'Deep' : t.energy === 'shallow' ? 'Flach' : null,
      t.estimateMin != null ? formatMinutes(t.estimateMin) : null,
      t.area || null,
      t.dueDate ? `fällig ${t.dueDate}` : null,
    ].filter(Boolean);
    return '- ' + parts.join(' · ');
  });
  return lines.join('\n');
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Führt einen Coach-Tool-Aufruf aus und liefert ein Textergebnis für das Modell. */
export async function executeCoachTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'list_ceo_tasks':
      return await ceoBoardSnapshot();

    case 'create_ceo_task': {
      const res = await createCeoTaskAction({
        title: String(args.title ?? '').trim(),
        notes: args.notes,
        status: args.status ?? 'today',
        quadrant: args.quadrant ?? null,
        energy: args.energy ?? null,
        area: args.area,
        estimateMin: args.estimateMin ?? null,
        dueDate: args.dueDate,
      });
      return res.status === 'success' ? 'Karte angelegt.' : 'Fehler: ' + errMsg(res);
    }

    case 'update_ceo_task': {
      const { taskId, ...rest } = args ?? {};
      const res = await updateCeoTaskAction(String(taskId ?? ''), {
        title: rest.title,
        notes: rest.notes,
        quadrant: rest.quadrant,
        energy: rest.energy,
        area: rest.area,
        estimateMin: rest.estimateMin,
        dueDate: rest.dueDate,
      });
      return res.status === 'success' ? 'Karte aktualisiert.' : 'Fehler: ' + errMsg(res);
    }

    case 'move_ceo_task': {
      const res = await moveCeoTaskAction(String(args.taskId ?? ''), String(args.status ?? ''));
      return res.status === 'success' ? 'Karte verschoben.' : 'Fehler: ' + errMsg(res);
    }

    default:
      return 'Fehler: unbekanntes Werkzeug ' + name;
  }
}

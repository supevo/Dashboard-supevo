import 'server-only';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import type { BriefingContext, BriefingTask } from './context';

export interface BriefingPriority {
  title: string;
  reason: string;
}

export interface GeneratedBriefing {
  summary: string;
  priorities: BriefingPriority[];
  nextMove: string | null;
  notes: string[];
  model: string;
}

const PRIORITY_LABEL = de.priority;
const DUE_LABEL: Record<NonNullable<BriefingTask['dueState']>, string> = {
  overdue: 'überfällig',
  today: 'heute fällig',
  soon: 'bald fällig',
};

/** Renders the gathered context into a compact, model-readable task list. */
function renderContext(ctx: BriefingContext): string {
  const lines: string[] = [];
  lines.push(`Datum: ${ctx.today}`);
  lines.push(
    `Kennzahlen: ${ctx.counts.active} aktive Aufgaben, ` +
      `${ctx.counts.inProgress} in Arbeit, ${ctx.counts.review} in Review, ` +
      `${ctx.counts.blocked} blockiert, ${ctx.counts.overdue} überfällig, ` +
      `${ctx.counts.dueToday} heute fällig, ${ctx.counts.dueSoon} bald fällig.`,
  );
  if (ctx.skills.length > 0) {
    lines.push('');
    lines.push(
      'Deine Fähigkeiten (Level 0–10): ' +
        ctx.skills.map((s) => `${s.name} ${s.level}/10`).join(', '),
    );
  }
  lines.push('');
  lines.push('Aufgaben (wichtigste zuerst):');
  if (ctx.tasks.length === 0) {
    lines.push('- keine offenen zugewiesenen Aufgaben');
  }
  // Cap the list so the prompt stays small and cheap.
  for (const t of ctx.tasks.slice(0, 25)) {
    lines.push(`- ${t.title} (${taskBits(t).join(', ')})`);
  }

  if (ctx.available.length > 0) {
    lines.push('');
    lines.push(
      'Unbesetzte Aufgaben (niemandem zugewiesen – könnten übernommen werden):',
    );
    for (const t of ctx.available) {
      lines.push(`- ${t.title} (${taskBits(t).join(', ')})`);
    }
  }
  return lines.join('\n');
}

function taskBits(t: BriefingTask): string[] {
  return [
    `Priorität ${PRIORITY_LABEL[t.priority]}`,
    t.projectName ? `Projekt ${t.projectName}` : null,
    t.clientName ? `Kunde ${t.clientName}` : null,
    t.dueState ? DUE_LABEL[t.dueState] : null,
    t.dueDate ? `Termin ${t.dueDate}` : null,
    t.isBlocked ? 'blockiert' : null,
  ].filter((x): x is string => Boolean(x));
}

const SYSTEM_PROMPT = `Du bist der persönliche Assistent eines Mitarbeiters einer deutschen Marketing-Agentur.
Erstelle eine kurze, motivierende morgendliche Zusammenfassung des Arbeitstags.
Im Vordergrund steht Effizienz: hilf dem Mitarbeiter, seine Aufgaben zügig abzuarbeiten.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format (keine Erklärungen, kein Markdown, keine Code-Fences):
{
  "summary": "1-2 Sätze Überblick über den Tag, direkt und freundlich, in Du-Form",
  "priorities": [
    { "title": "Aufgabentitel oder kurze Handlung", "reason": "warum jetzt (max. 1 Satz)" }
  ],
  "nextMove": "Der eine schlaue nächste Schachzug – die konkret sinnvollste erste Handlung heute Morgen",
  "notes": ["optionale kurze Hinweise, z. B. zu überfälligen oder blockierten Aufgaben"]
}

Regeln:
- Immer auf Deutsch, Du-Form, knapp und konkret.
- "priorities": 2 bis 4 Einträge, die wirklich wichtigsten zuerst (überfällig/heute fällig/blockiert vor dem Rest).
- Erfinde keine Aufgaben, Termine oder Fakten. Nutze nur die gelieferten Daten.
- WICHTIG: Wenn es offene Aufgaben oder anstehende Termine gibt (auch bald fällige), benenne sie konkret. Sage NICHT "nichts Dringendes", solange es offene oder terminierte Aufgaben gibt.
- Gibt es "Unbesetzte Aufgaben", schlage – wenn sinnvoll (z. B. naher Termin) – vor, eine davon zu übernehmen, und nenne sie beim Namen.
- Nutze die Fähigkeiten des Mitarbeiters: Passt eine unbesetzte Aufgabe zu einer Stärke (hohes Level), empfiehl gezielt, dass er sie übernimmt (z. B. "Der Flyer-Entwurf passt zu deiner Grafikdesign-Stärke"). Erwähne die Fähigkeit nur, wenn sie wirklich zur Aufgabe passt.
- Nur wenn es wirklich keine eigenen und keine unbesetzten Aufgaben gibt: ehrlich sagen, dass gerade nichts ansteht, und kurz zum Vorausplanen anregen.
- "notes": 0 bis 3 Einträge. Wenn nichts Wichtiges, leeres Array.`;

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function coercePriorities(value: unknown): BriefingPriority[] {
  if (!Array.isArray(value)) return [];
  const out: BriefingPriority[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      const title = (item as Record<string, unknown>).title;
      const reason = (item as Record<string, unknown>).reason;
      if (typeof title === 'string' && title.trim()) {
        out.push({
          title: title.trim(),
          reason: typeof reason === 'string' ? reason.trim() : '',
        });
      }
    }
    if (out.length >= 4) break;
  }
  return out;
}

/** Strips optional ```json fences the model might add despite instructions. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/**
 * Generates a morning briefing for the given context via Claude.
 * Returns null when AI is disabled or the model output can't be parsed, so the
 * caller can fall back gracefully.
 */
export async function generateBriefing(
  ctx: BriefingContext,
): Promise<GeneratedBriefing | null> {
  const result = await completeText({
    system: SYSTEM_PROMPT,
    prompt: renderContext(ctx),
    maxTokens: 1024,
  });
  if (!result) return null;

  try {
    const parsed = JSON.parse(extractJson(result.text)) as Record<
      string,
      unknown
    >;

    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) return null;

    const nextMoveRaw = parsed.nextMove ?? parsed.next_move;
    return {
      summary,
      priorities: coercePriorities(parsed.priorities),
      nextMove:
        typeof nextMoveRaw === 'string' && nextMoveRaw.trim()
          ? nextMoveRaw.trim()
          : null,
      notes: coerceStringArray(parsed.notes),
      model: result.model,
    };
  } catch (error) {
    logger.error('briefing parsing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

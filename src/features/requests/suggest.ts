import 'server-only';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';
import type { TaskPriority } from '@/lib/database.types';

export interface TaskSuggestion {
  title: string;
  description: string;
  priority: TaskPriority;
}

const SYSTEM = `Du hilfst einer deutschen Marketing-Agentur, ein Kunden-Briefing in konkrete Aufgaben zu zerlegen.

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{
  "tasks": [
    { "title": "kurzer, konkreter Aufgabentitel", "description": "1-3 Sätze, was zu tun ist", "priority": "low|medium|high|urgent" }
  ]
}

Regeln:
- Deutsch. 1 bis 6 Aufgaben, jede eigenständig umsetzbar.
- Nichts erfinden, was nicht im Briefing steht; sinnvoll strukturieren.
- priority realistisch wählen (Standard "medium").`;

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

const CLARIFY_SYSTEM = `Du hilfst einer deutschen Marketing-Agentur, ein Kunden-Briefing vor der Umsetzung zu klären.

Der Kunde hat ein Briefing eingereicht. Nenne die WENIGEN wirklich wichtigen Rückfragen, die zur sauberen Umsetzung noch fehlen – z. B. Format/Maße, Zielgruppe/Intention, gewünschte Kernbotschaft, Umfang, Pflicht-Elemente (Logo, CI, Rabatte).

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{ "questions": ["kurze, konkrete Frage", "..."] }

Regeln:
- Deutsch. 0 bis 4 Fragen. Lieber wenige, dafür die wichtigsten.
- NIEMALS nach Deadline, Fertigstellungstermin, Zeitraum oder Timing fragen – Termine legt die Agentur selbst fest.
- Nur fragen, was im Briefing NICHT schon beantwortet ist. Nichts Offensichtliches erfragen.
- Kurze Fragen, direkt an den Kunden/das Team gerichtet.
- Wenn das Briefing schon klar genug ist, gib eine leere Liste zurück.`;

/**
 * Asks the AI for the few most important clarifying questions a briefing is
 * still missing (format, intention, deadline …). Empty list when AI is off,
 * fails, or the briefing is already clear enough.
 */
export async function generateClarifyingQuestions(
  body: string,
): Promise<string[]> {
  const result = await completeText({
    system: CLARIFY_SYSTEM,
    prompt: `Briefing des Kunden:\n\n${body}`,
    maxTokens: 500,
  });
  if (!result) return [];
  try {
    const parsed = JSON.parse(extractJson(result.text)) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    const out: string[] = [];
    for (const q of parsed.questions) {
      if (typeof q === 'string' && q.trim()) out.push(q.trim().slice(0, 300));
      if (out.length >= 4) break;
    }
    return out;
  } catch (error) {
    logger.error('clarifying questions parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

const FROM_CLARIFY_SYSTEM = `Du hilfst einer deutschen Marketing-Agentur, aus einem Kunden-Briefing plus Klärungs-Antworten EINE konkrete, umsetzbare Aufgabe zu machen.

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{ "title": "kurzer, konkreter Aufgabentitel", "description": "gut gegliederte Umsetzungs-Beschreibung als Klartext", "priority": "low|medium|high|urgent" }

Die "description" MUSS klar gegliedert sein (Klartext, KEIN Markdown), mit Leerzeilen zwischen den Abschnitten und dieser Struktur (nur zutreffende Abschnitte):

Ziel:
<1–2 Sätze, worum es geht>

Anforderungen:
- <Punkt>
- <Punkt>

Rahmen / Vorgaben:
- <Format, Maße, CI, Pflicht-Elemente … falls bekannt>

Offene Punkte:
- <nur was wirklich unklar blieb>

Regeln:
- Deutsch. Genau EINE Aufgabe.
- Verwende echte Zeilenumbrüche (\\n) und Aufzählungen mit "- ".
- Bündelt Briefing + Antworten. Nichts erfinden; unklare Punkte unter "Offene Punkte".
- KEINE Deadline/Termine erwähnen – die legt die Agentur fest.
- priority realistisch (Standard "medium").`;

/**
 * Builds a single, well-specified task from the briefing plus the clarifying
 * Q&A the agency filled in. null on AI failure (caller falls back).
 */
export async function generateTaskFromClarification(
  body: string,
  qa: { question: string; answer: string }[],
): Promise<TaskSuggestion | null> {
  const answered = qa.filter((x) => x.answer.trim());
  const qaText = answered.length
    ? answered.map((x) => `F: ${x.question}\nA: ${x.answer}`).join('\n\n')
    : '(keine zusätzlichen Angaben)';
  const result = await completeText({
    system: FROM_CLARIFY_SYSTEM,
    prompt: `Briefing des Kunden:\n\n${body}\n\nKlärung:\n\n${qaText}`,
    maxTokens: 800,
  });
  if (!result) return null;
  try {
    const rec = JSON.parse(extractJson(result.text)) as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    if (!title) return null;
    const priority = PRIORITIES.includes(rec.priority as TaskPriority)
      ? (rec.priority as TaskPriority)
      : 'medium';
    return {
      title: title.slice(0, 200),
      description:
        typeof rec.description === 'string' ? rec.description.trim() : '',
      priority,
    };
  } catch (error) {
    logger.error('task-from-clarification parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Splits a client briefing into task suggestions via the AI. [] on failure. */
export async function generateTaskSuggestions(
  body: string,
): Promise<TaskSuggestion[]> {
  const result = await completeText({
    system: SYSTEM,
    prompt: `Briefing des Kunden:\n\n${body}`,
    maxTokens: 1200,
  });
  if (!result) return [];
  try {
    const parsed = JSON.parse(extractJson(result.text)) as {
      tasks?: unknown;
    };
    if (!Array.isArray(parsed.tasks)) return [];
    const out: TaskSuggestion[] = [];
    for (const item of parsed.tasks) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      if (!title) continue;
      const priority = PRIORITIES.includes(rec.priority as TaskPriority)
        ? (rec.priority as TaskPriority)
        : 'medium';
      out.push({
        title: title.slice(0, 200),
        description:
          typeof rec.description === 'string' ? rec.description.trim() : '',
        priority,
      });
      if (out.length >= 6) break;
    }
    return out;
  } catch (error) {
    logger.error('task suggestion parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

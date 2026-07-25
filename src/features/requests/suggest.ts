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

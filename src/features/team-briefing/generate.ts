import 'server-only';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import type { TeamContext, TeamTaskRef } from './context';

export interface TeamBriefing {
  summary: string;
  risks: string[];
  recommendations: string[];
  model: string;
}

const PRIO = de.priority;

function line(t: TeamTaskRef): string {
  const who = t.assignees.length ? t.assignees.join(', ') : 'niemand';
  const due = t.dueDate ? `, Termin ${t.dueDate}` : '';
  return `- ${t.title} (Projekt ${t.projectName}, ${who}, ${PRIO[t.priority]}${due})`;
}

function render(ctx: TeamContext): string {
  const l: string[] = [];
  l.push(`Datum: ${ctx.today}`);
  l.push('');
  l.push('Auslastung pro Mitarbeiter:');
  if (ctx.memberLoad.length === 0) l.push('- keine Zuweisungen');
  for (const m of ctx.memberLoad) {
    l.push(`- ${m.name}: ${m.active} aktive, ${m.overdue} überfällig (${m.level})`);
  }
  l.push(`Unbesetzte offene Aufgaben: ${ctx.unassignedOpen}`);

  const block = (title: string, items: TeamTaskRef[]) => {
    l.push('');
    l.push(`${title} (${items.length}${items.length === 15 ? '+' : ''}):`);
    if (items.length === 0) l.push('- keine');
    for (const t of items) l.push(line(t));
  };
  block('Überfällige Aufgaben', ctx.overdue);
  block('Blockierte Aufgaben', ctx.blocked);
  block('Bald fällig (7 Tage)', ctx.dueSoon);
  return l.join('\n');
}

const SYSTEM = `Du bist Assistent der Team-/Projektleitung einer deutschen Marketing-Agentur.
Erstelle einen kompakten Wochenüberblick fürs Management.

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{
  "summary": "2-4 Sätze Gesamtlage des Teams für diese Woche",
  "risks": ["konkrete Risiken/Engpässe, z. B. überlastete Personen, überfällige/blockierte Aufgaben"],
  "recommendations": ["konkrete Empfehlungen, z. B. Umverteilung, Priorisierung, unbesetzte Aufgaben zuweisen"]
}

Regeln:
- Deutsch, konkret, mit Namen/Aufgaben aus den Daten. Nichts erfinden.
- "risks" und "recommendations": je 2 bis 5 Einträge, wichtigste zuerst.
- Wenn alles ruhig ist: ehrlich sagen und leere/kurze Listen.`;

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

export async function generateTeamBriefing(
  ctx: TeamContext,
): Promise<TeamBriefing | null> {
  const result = await completeText({
    system: SYSTEM,
    prompt: render(ctx),
    maxTokens: 1200,
  });
  if (!result) return null;
  try {
    const p = JSON.parse(extractJson(result.text)) as Record<string, unknown>;
    const summary = typeof p.summary === 'string' ? p.summary.trim() : '';
    if (!summary) return null;
    return {
      summary,
      risks: strArr(p.risks),
      recommendations: strArr(p.recommendations),
      model: result.model,
    };
  } catch (error) {
    logger.error('team briefing parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

import 'server-only';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { DEFAULT_PLAN_TEMPLATE, type PlanTemplate } from './template';

export interface ClientContext {
  name: string;
  industry: string | null;
  notes: string | null;
}

const SYSTEM = [
  'Du bist Marketing-Stratege einer deutschen Werbeagentur.',
  'Erstelle einen phasenbasierten Marketingplan für einen Kunden.',
  'Der Plan besteht aus 4–6 aufeinander aufbauenden Phasen.',
  'WICHTIG: Nenne KEINE konkreten Zeiträume, Monate oder Daten – nur vage',
  'Hinweise wie "zu Beginn der Zusammenarbeit" oder "im weiteren Verlauf".',
  'Jede Phase hat: einen Titel (Format "Phase N – …"), einen vagen',
  'Zeit-Hinweis (kann leer sein), 3–9 konkrete Maßnahmen und einen kurzen',
  'Ergebnis-Satz (was die Phase erreicht).',
  'Antworte AUSSCHLIESSLICH als JSON in exakt dieser Form:',
  '{"closingNote": string, "phases": [{"title": string,',
  '"timeframeHint": string, "outcome": string, "measures": [string]}]}',
].join(' ');

function buildPrompt(ctx: ClientContext): string {
  const lines = [`Kunde: ${ctx.name}`];
  if (ctx.industry) lines.push(`Branche: ${ctx.industry}`);
  if (ctx.notes) lines.push(`Notizen zum Kunden: ${ctx.notes}`);
  lines.push(
    'Erstelle den Marketingplan passend zu diesem Kunden. Maßnahmen sollen',
    'konkret und umsetzbar sein (Landingpages, Google/Social Ads, SEO/GEO,',
    'Content, Tracking, digitale Beratung etc.), je nach Branche angepasst.',
  );
  return lines.join('\n');
}

function coerce(raw: unknown): PlanTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const phasesRaw = Array.isArray(obj.phases) ? obj.phases : null;
  if (!phasesRaw || phasesRaw.length === 0) return null;

  const phases = phasesRaw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const title = typeof o.title === 'string' ? o.title.trim() : '';
      const measures = Array.isArray(o.measures)
        ? o.measures
            .filter((m): m is string => typeof m === 'string')
            .map((m) => m.trim())
            .filter(Boolean)
        : [];
      if (!title || measures.length === 0) return null;
      return {
        title: title.slice(0, 200),
        timeframeHint:
          typeof o.timeframeHint === 'string' ? o.timeframeHint.trim() : '',
        outcome: typeof o.outcome === 'string' ? o.outcome.trim() : '',
        measures: measures.slice(0, 12).map((m) => m.slice(0, 200)),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (phases.length === 0) return null;
  return {
    closingNote:
      typeof obj.closingNote === 'string' ? obj.closingNote.trim() : '',
    phases,
  };
}

/**
 * Generates a marketing-plan draft for a client via the active AI provider.
 * Falls back to the default template when AI is disabled or the call fails, so
 * the caller always gets a usable plan.
 */
export async function generatePlanDraft(
  ctx: ClientContext,
): Promise<{ plan: PlanTemplate; usedAi: boolean }> {
  if (!isAiEnabled()) return { plan: DEFAULT_PLAN_TEMPLATE, usedAi: false };
  const res = await completeText({
    system: SYSTEM,
    prompt: buildPrompt(ctx),
    maxTokens: 2000,
  });
  if (!res?.text) return { plan: DEFAULT_PLAN_TEMPLATE, usedAi: false };
  try {
    const parsed = coerce(JSON.parse(res.text));
    if (parsed) return { plan: parsed, usedAi: true };
  } catch {
    // fall through to template
  }
  return { plan: DEFAULT_PLAN_TEMPLATE, usedAi: false };
}

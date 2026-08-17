import 'server-only';
import { completeText } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';

export interface SuggestedTask {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface GenerateTasksInput {
  company: string;
  industry: string | null;
  goals: string | null;
  targetGroup: string | null;
  website: string | null;
  note: string | null;
  /** Menschlich lesbare Zeilen der gebuchten Module (inkl. Keywords/Budget). */
  moduleLines: string[];
}

const SYSTEM = [
  'Du bist erfahrene Projektleitung einer deutschen Marketing-Agentur.',
  'Erstelle aus den gebuchten Modulen und dem Kundenkontext eine konkrete,',
  'umsetzbare Aufgabenliste für den Projektstart (Onboarding & erste Umsetzung).',
  'Regeln:',
  '- Aufgaben sind spezifisch und auf Branche/Ziele/Zielgruppe zugeschnitten,',
  '  nicht generisch. Beziehe dich, wo sinnvoll, auf die konkreten Module.',
  '- 5 bis 12 Aufgaben, logisch geordnet (Setup → Umsetzung → Feinschliff).',
  '- Deutsch. Titel kurz und aktiv; Beschreibung 1–2 Sätze mit dem Warum/Wie.',
  '- priority ist "low", "medium" oder "high".',
  'Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form:',
  '{"tasks":[{"title":"...","description":"...","priority":"medium"}]}',
].join('\n');

function buildPrompt(input: GenerateTasksInput): string {
  const lines: string[] = [];
  lines.push(`Kunde/Firma: ${input.company || 'unbekannt'}`);
  if (input.industry) lines.push(`Branche: ${input.industry}`);
  if (input.goals) lines.push(`Ziele/Vorhaben: ${input.goals}`);
  if (input.targetGroup) lines.push(`Zielgruppe: ${input.targetGroup}`);
  if (input.website) lines.push(`Website/Ist-Zustand: ${input.website}`);
  if (input.note) lines.push(`Notizen: ${input.note}`);
  lines.push('');
  lines.push('Gebuchte Module:');
  if (input.moduleLines.length > 0) {
    for (const m of input.moduleLines) lines.push(`- ${m}`);
  } else {
    lines.push('- (keine Module ausgewählt)');
  }
  return lines.join('\n');
}

function sanitize(raw: unknown): SuggestedTask[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(arr)) return [];
  const out: SuggestedTask[] = [];
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 200) : '';
    if (!title) continue;
    const description =
      typeof rec.description === 'string' ? rec.description.trim().slice(0, 2000) : '';
    const priority =
      rec.priority === 'low' || rec.priority === 'high' ? rec.priority : 'medium';
    out.push({ title, description, priority });
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * Erzeugt KI-Aufgabenvorschläge für ein neues Projekt aus Modulen + Kontext.
 * Gibt [] zurück, wenn keine KI konfiguriert ist oder der Call fehlschlägt –
 * der Aufrufer fällt dann auf eine manuelle/leere Liste zurück.
 */
export async function generateProjectTasks(
  input: GenerateTasksInput,
): Promise<SuggestedTask[]> {
  const res = await completeText({
    system: SYSTEM,
    prompt: buildPrompt(input),
    maxTokens: 1500,
  });
  if (!res) return [];
  try {
    return sanitize(JSON.parse(res.text));
  } catch (error) {
    logger.error('KI-Aufgabenvorschlag: JSON-Parsing fehlgeschlagen', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

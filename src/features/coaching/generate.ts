import 'server-only';
import { completeText } from '@/lib/ai/complete';
import { formatMinutes } from '@/lib/time';
import type { CockpitRow } from '@/features/cockpit/queries';

function rowLine(r: CockpitRow): string {
  return (
    `${r.name}: ${r.activeTasks} aktive, ${r.overdue} ueberfaellig, ` +
    `${r.completedMonth} erledigt/Monat, ${formatMinutes(r.weekMinutes)} Zeit/Woche, ` +
    `${r.activeObjectives} Ziele (Ø ${r.avgProgress}%), ${r.points} Punkte (Lvl ${r.pointLevel})` +
    `${r.absent ? ', ABWESEND' : ''}, Ampel ${r.level}`
  );
}

/** A short, motivating boss-style coaching message for one employee. */
export async function generateCoaching(row: CockpitRow): Promise<string | null> {
  const result = await completeText({
    system: `Du bist eine wertschaetzende, aber klare Fuehrungskraft in einer Marketing-Agentur.
Gib dem Mitarbeiter ein kurzes, persoenliches Wochen-Feedback (Du-Form, Deutsch, 3-5 Saetze).
Struktur: 1) kurze Anerkennung fuer Konkretes, 2) EIN klarer, freundlicher Hinweis/Tipp fuer die naechste Woche.
Nur die gelieferten Zahlen nutzen, nichts erfinden. Motivierend, nicht belehrend. Kein Markdown.`,
    prompt: `Kennzahlen dieser Woche/dieses Monats:\n${rowLine(row)}`,
    maxTokens: 300,
  });
  return result?.text.trim() || null;
}

/** A leadership escalation: who needs attention this week and why. */
export async function generateEscalation(
  rows: CockpitRow[],
): Promise<string | null> {
  if (rows.length === 0) return null;
  const result = await completeText({
    system: `Du bist Assistent der Geschaeftsleitung einer Marketing-Agentur.
Sag der Chefin/dem Chef in Du-Form, WORAUF sie/er diese Woche beim Team achten sollte.
Nenne konkrete Personen mit Grund (Ueberlastung, Ueberfaelliges, wenig erledigt, festgefahrene Ziele).
Wenn alles im gruenen Bereich ist, sag das ehrlich. 2-5 kurze Punkte, wichtigste zuerst. Deutsch, kein Markdown, keine Code-Fences.`,
    prompt: `Team-Kennzahlen:\n${rows.map(rowLine).join('\n')}`,
    maxTokens: 500,
  });
  return result?.text.trim() || null;
}

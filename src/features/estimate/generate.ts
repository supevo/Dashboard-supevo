import 'server-only';
import { completeText } from '@/lib/ai/complete';

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/** KI estimate of the effort for a task, in minutes. null if AI is off/fails. */
export async function estimateTaskMinutes(
  title: string,
  description: string | null,
): Promise<number | null> {
  const result = await completeText({
    system: `Du schaetzt den reinen Arbeitsaufwand fuer eine Aufgabe einer Marketing-Agentur in MINUTEN (ohne Warte-/Abstimmungszeiten).
Nutze die GESAMTE Bandbreite realistisch: winzige Aenderungen kosten wenige Minuten, grosse Aufbauten viele Stunden bis mehrere Tage. Ueberschaetze Kleinigkeiten NICHT und unterschaetze grosse Projekte NICHT.

Kalibrierung (reine Arbeitszeit):
- Tippfehler / kleine Textaenderung: 5-15 Min
- Kleines Bild oder Detail anpassen: 15-30 Min
- Einzelnen Social-Media-Post erstellen: 30-60 Min
- Blogartikel schreiben: 120-240 Min
- Landingpage aufbauen: 240-600 Min
- Website mit mehreren Seiten: 900-2400 Min
- Kompletter Onlineshop-Aufbau: 2400-4800 Min (mehrere Tage)

Antworte AUSSCHLIESSLICH mit JSON: {"minutes": <ganze Zahl>}. Zwischen 5 und 4800.`,
    prompt: `Titel: ${title}\n${description ? `Beschreibung: ${description}` : ''}`,
    maxTokens: 60,
  });
  if (!result) return null;
  try {
    const parsed = JSON.parse(extractJson(result.text)) as { minutes?: unknown };
    const m = Number(parsed.minutes);
    if (!Number.isFinite(m)) return null;
    return Math.min(4800, Math.max(5, Math.round(m)));
  } catch {
    return null;
  }
}

/**
 * Best-effort: estimates a freshly created task's effort and stores it in
 * estimated_minutes (only when AI returns a value and no estimate is set yet).
 * Uses the service client so it works regardless of the caller's RLS. Never
 * throws — a failed estimate must not break task creation.
 */
export async function autoEstimateTaskMinutes(
  taskId: string,
  title: string,
  description: string | null,
): Promise<void> {
  try {
    const minutes = await estimateTaskMinutes(title, description);
    if (minutes == null) return;
    const { createSupabaseServiceClient } = await import('@/lib/supabase/service');
    await createSupabaseServiceClient()
      .from('tasks')
      .update({ estimated_minutes: minutes })
      .eq('id', taskId)
      .is('estimated_minutes', null);
  } catch {
    /* best-effort */
  }
}

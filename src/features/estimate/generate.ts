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

/** Ein händisch korrigiertes Beispiel, das die KI zur Kalibrierung nutzt. */
export interface EstimateExample {
  title: string;
  minutes: number;
}

/**
 * Lädt die letzten HÄNDISCH gesetzten Aufwandsschätzungen einer Org als
 * Lern-Beispiele (Few-Shot). So lernt die KI mit der Zeit die Einschätzung der
 * Agentur. Service-Client, wirft nie.
 */
export async function fetchEstimateExamples(
  orgId: string,
  limit = 8,
): Promise<EstimateExample[]> {
  try {
    const { createSupabaseServiceClient } = await import('@/lib/supabase/service');
    const { data } = await createSupabaseServiceClient()
      .from('tasks')
      .select('title, manual_estimate_minutes, updated_at')
      .eq('organization_id', orgId)
      .not('manual_estimate_minutes', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit);
    return (data ?? [])
      .map((t) => ({ title: t.title, minutes: t.manual_estimate_minutes }))
      .filter((e): e is EstimateExample => typeof e.minutes === 'number' && e.minutes > 0);
  } catch {
    return [];
  }
}

/** KI estimate of the effort for a task, in minutes. null if AI is off/fails. */
export async function estimateTaskMinutes(
  title: string,
  description: string | null,
  examples: EstimateExample[] = [],
): Promise<number | null> {
  // Few-Shot: händische Korrekturen der Agentur als Erfahrungswerte einspeisen.
  const learned = examples.length
    ? `\n\nErfahrungswerte aus HAENDISCH korrigierten Schaetzungen DIESER Agentur (staerker gewichten, besonders bei aehnlichen Aufgaben):\n${examples
        .map((e) => `- ${e.title}: ${e.minutes} Min`)
        .join('\n')}`
    : '';
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
- Kompletter Onlineshop-Aufbau: 2400-4800 Min (mehrere Tage)${learned}

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
    const { createSupabaseServiceClient } = await import('@/lib/supabase/service');
    const service = createSupabaseServiceClient();
    // Org für Lern-Beispiele holen (und ob bereits ein manueller Override besteht).
    const { data: t } = await service
      .from('tasks')
      .select('organization_id, manual_estimate_minutes')
      .eq('id', taskId)
      .maybeSingle();
    const examples = t?.organization_id
      ? await fetchEstimateExamples(t.organization_id)
      : [];
    const minutes = await estimateTaskMinutes(title, description, examples);
    if (minutes == null) return;
    // KI-Rohwert immer festhalten (Referenz + Lernen). Effektiven Wert nur
    // setzen, wenn noch kein (manueller) Wert existiert.
    await service.from('tasks').update({ ai_estimate_minutes: minutes }).eq('id', taskId);
    await service
      .from('tasks')
      .update({ estimated_minutes: minutes })
      .eq('id', taskId)
      .is('estimated_minutes', null);
  } catch {
    /* best-effort */
  }
}

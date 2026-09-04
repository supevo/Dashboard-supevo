'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { sanitizeRichText } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

export interface DigestNote {
  title: string;
  content: string;
}
export interface ChatDigest {
  recap: string;
  notes: DigestNote[];
}

const uuid = z.string().uuid();

/**
 * Fasst den Verlauf eines Kundenchats zusammen und extrahiert ablagewürdige
 * Notizen (Absprachen, Entscheidungen, wichtige Fakten). Rein lesend – speichert
 * nichts; das Filing passiert erst nach Auswahl über fileClientNotesAction.
 * Agentur-intern.
 */
export async function summarizeClientChatAction(input: {
  clientCompanyId: string;
  channelId: string;
}): Promise<ActionResult> {
  if (!uuid.safeParse(input?.clientCompanyId).success || !uuid.safeParse(input?.channelId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  if (!isAiEnabled()) return errorResult('Die KI ist nicht aktiviert.');

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('id, client_company_id, kind')
    .eq('id', input.channelId)
    .maybeSingle();
  if (!channel || channel.kind !== 'client' || channel.client_company_id !== input.clientCompanyId) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const { data: msgs } = await supabase
    .from('chat_channel_messages')
    .select('author_id, body, created_at')
    .eq('channel_id', input.channelId)
    .order('created_at', { ascending: true })
    .limit(400);
  const rows = msgs ?? [];
  if (rows.length === 0) return errorResult('Noch keine Nachrichten in diesem Chat.');

  // Namen auflösen (Service-Client: Kunden-/Mitarbeiterprofile sind für den
  // Aufrufer über RLS ggf. nicht sichtbar). Nur Name – low sensitivity.
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v))];
  const { data: profiles } = await createSupabaseServiceClient()
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds.length ? authorIds : ['00000000-0000-0000-0000-000000000000']);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? 'Unbekannt'] as const));

  const transcript = rows
    .slice(-250)
    .map((r) => `${(r.author_id && nameById.get(r.author_id)) || 'Kunde'}: ${(r.body || '').replace(/\s+/g, ' ').trim()}`)
    .join('\n')
    .slice(-12000);

  const system = `Du bist Assistent einer Marketing-Agentur. Fasse den Chat mit einem Kunden knapp zusammen und extrahiere ABLAGEWÜRDIGE Informationen: Absprachen, Entscheidungen, Wünsche, wichtige Fakten und Fristen. Zugangsdaten NUR, wenn sie im Chat ausdrücklich genannt wurden.
Antworte AUSSCHLIESSLICH mit gültigem JSON in exakt dieser Form:
{"recap": string, "notes": [{"title": string, "content": string}]}
- recap: 3–6 kurze deutsche Stichpunkte, getrennt durch Zeilenumbrüche.
- notes: 0–8 Einträge; "title" kurz und prägnant, "content" 1–3 Sätze.
Erfinde nichts. Gibt der Chat nichts Ablagewürdiges her, ist "notes" ein leeres Array.`;
  const prompt = `Chatverlauf (älteste Nachricht zuerst):\n\n${transcript}`;

  const res = await completeText({ system, prompt, maxTokens: 1200 });
  if (!res) return errorResult('Die KI ist derzeit nicht verfügbar. Bitte später erneut versuchen.');

  const digest = parseDigest(res.text);
  if (!digest) {
    logger.warn('chat_digest.parse_failed', { sample: res.text.slice(0, 200) });
    return errorResult('Die Zusammenfassung konnte nicht erstellt werden. Bitte erneut versuchen.');
  }
  return successResult(undefined, { recap: digest.recap, notes: digest.notes });
}

/** Robustes JSON-Parsing der Modellantwort (toleriert ```-Fences/Rauschen). */
function parseDigest(text: string): ChatDigest | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      recap?: unknown;
      notes?: unknown;
    };
    const recap = typeof obj.recap === 'string' ? obj.recap : '';
    const notes = Array.isArray(obj.notes)
      ? obj.notes
          .filter(
            (n): n is DigestNote =>
              !!n &&
              typeof (n as DigestNote).title === 'string' &&
              typeof (n as DigestNote).content === 'string',
          )
          .map((n) => ({
            title: n.title.trim().slice(0, 200),
            content: n.content.trim().slice(0, 4000),
          }))
          .filter((n) => n.title.length > 0)
      : [];
    return { recap, notes };
  } catch {
    return null;
  }
}

/**
 * Übernimmt ausgewählte extrahierte Notizen als Kundenseiten (client_pages,
 * Status „ready") in die Ablage des Kunden. Agentur-intern.
 */
export async function fileClientNotesAction(input: {
  clientCompanyId: string;
  notes: DigestNote[];
}): Promise<ActionResult> {
  const schema = z.object({
    clientCompanyId: z.string().uuid(),
    notes: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          content: z.string().trim().max(4000),
        }),
      )
      .min(1)
      .max(20),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, notes } = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  const now = Date.now();
  const rows = notes.map((n, i) => ({
    organization_id: company.organization_id,
    client_company_id: clientCompanyId,
    parent_id: null,
    is_folder: false,
    title: n.title,
    // Zeilenumbrüche als <br>, dann sanitisieren (client_pages rendert Rich-Text).
    content: sanitizeRichText(n.content.replace(/\n/g, '<br>')),
    status: 'ready',
    position: now + i,
    created_by: user.id,
  }));

  const { error } = await supabase.from('client_pages').insert(rows as never);
  if (error) {
    logger.error('chat_digest.file_failed', { message: error.message });
    return errorResult(de.errors.INTERNAL);
  }

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult(
    `${rows.length} Notiz${rows.length === 1 ? '' : 'en'} in der Ablage gespeichert.`,
  );
}

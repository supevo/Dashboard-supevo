'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import {
  encryptSecret,
  decryptSecret,
  isSecretVaultEnabled,
} from '@/lib/crypto/secret-vault';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { categorizeTitle, categorizeTitles } from '@/features/passwords/ai';
import { isPwCategory } from '@/features/passwords/shared';
import { de } from '@/lib/i18n/de';
import { logger } from '@/lib/logger';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

async function requireAgency(): Promise<{ orgId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) return { error: de.errors.FORBIDDEN };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { error: de.errors.FORBIDDEN };
  return { orgId };
}

const entrySchema = z.object({
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  username: z.string().trim().max(200).optional().or(z.literal('')),
  secret: z.string().max(2000).optional().or(z.literal('')),
  url: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
});

/** Creates a password entry; encrypts the secret and AI-categorizes the title. */
export async function createPasswordEntryAction(input: unknown): Promise<ActionResult> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const auth = await requireAgency();
  if ('error' in auth) return errorResult(auth.error);
  const user = await getCurrentUser();
  const v = parsed.data;

  let secret_encrypted: string | null = null;
  if (v.secret) {
    if (!isSecretVaultEnabled()) {
      return errorResult('Passwort-Verschlüsselung ist nicht konfiguriert (SECRET_ENCRYPTION_KEY fehlt).');
    }
    secret_encrypted = encryptSecret(v.secret);
  }

  const category =
    v.category && isPwCategory(v.category) ? v.category : await categorizeTitle(v.title);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('password_entries').insert({
    organization_id: auth.orgId,
    title: v.title,
    username: v.username || null,
    secret_encrypted,
    url: v.url || null,
    notes: v.notes || null,
    category,
    created_by: user?.id ?? null,
  });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/passwords');
  return successResult('Eintrag gespeichert.');
}

const updateSchema = entrySchema.extend({ id: z.string().uuid() });

export async function updatePasswordEntryAction(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const auth = await requireAgency();
  if ('error' in auth) return errorResult(auth.error);
  const v = parsed.data;

  // Only replace the secret when a new one was entered.
  if (v.secret && !isSecretVaultEnabled()) {
    return errorResult('Passwort-Verschlüsselung ist nicht konfiguriert (SECRET_ENCRYPTION_KEY fehlt).');
  }
  const category =
    v.category && isPwCategory(v.category) ? v.category : await categorizeTitle(v.title);

  const patch = {
    title: v.title,
    username: v.username || null,
    url: v.url || null,
    notes: v.notes || null,
    category,
    ...(v.secret ? { secret_encrypted: encryptSecret(v.secret) } : {}),
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('password_entries')
    .update(patch)
    .eq('id', v.id);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/passwords');
  return successResult('Aktualisiert.');
}

export async function deletePasswordEntryAction(id: string): Promise<ActionResult> {
  const auth = await requireAgency();
  if ('error' in auth) return errorResult(auth.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('password_entries').delete().eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/passwords');
  return successResult('Gelöscht.');
}

type RevealResult = { ok: true; secret: string } | { ok: false; error: string };

/** Decrypts and returns a single entry's password for an authorized viewer. */
export async function revealPasswordAction(id: string): Promise<RevealResult> {
  const auth = await requireAgency();
  if ('error' in auth) return { ok: false, error: auth.error };

  // RLS gate: the caller must be able to see the entry.
  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from('password_entries')
    .select('secret_encrypted')
    .eq('id', id)
    .maybeSingle();
  if (!entry) return { ok: false, error: de.errors.NOT_FOUND };
  if (!entry.secret_encrypted) return { ok: false, error: 'Kein Passwort hinterlegt.' };

  const secret = decryptSecret(entry.secret_encrypted);
  if (secret === null) return { ok: false, error: 'Entschlüsselung fehlgeschlagen.' };
  return { ok: true, secret };
}

// --- KI-Import (Excel-Paste) -----------------------------------------------

export interface PwImportRow {
  title: string;
  username: string | null;
  password: string | null;
  url: string | null;
  category: string;
}

export type PwAnalyzeResult =
  | { ok: true; rows: PwImportRow[] }
  | { ok: false; error: string };

const AI_IMPORT_SYSTEM = `Du extrahierst Zugangsdaten aus einer (aus Excel kopierten) Tabelle.
Antworte AUSSCHLIESSLICH mit JSON: { "rows": [ { "title": "", "username": "", "password": "", "url": "" } ] }.
Regeln: title = Dienst/Portal-Name. Kopf-/Leerzeilen ignorieren. Fehlende Felder als "" lassen. Nichts erfinden.`;

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

function heuristicRows(text: string): { title: string; username: string; password: string; url: string }[] {
  const rows: { title: string; username: string; password: string; url: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,/).map((c) => c.trim());
    if (cells.length < 2 || !cells[0]) continue;
    rows.push({
      title: cells[0] ?? '',
      username: cells[1] ?? '',
      password: cells[2] ?? '',
      url: cells[3] ?? '',
    });
  }
  return rows;
}

/** Parses a pasted table into rows and AI-categorizes them. */
export async function analyzePasswordImportAction(text: string): Promise<PwAnalyzeResult> {
  const auth = await requireAgency();
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!text || text.trim().length < 3) return { ok: false, error: 'Bitte Daten einfügen.' };

  let raw: { title: string; username: string; password: string; url: string }[] = [];
  if (isAiEnabled()) {
    // Ein AI-Ausfall darf den Import nicht crashen – bei Fehler greift die
    // Heuristik unten. Sonst würde die Server-Action werfen und der Client zeigt
    // nur „unerwarteter Fehler".
    let res: Awaited<ReturnType<typeof completeText>> = null;
    try {
      res = await completeText({ system: AI_IMPORT_SYSTEM, prompt: text.slice(0, 12000), maxTokens: 2500 });
    } catch (e) {
      logger.error('[passwords] analyze AI parse failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (res) {
      try {
        const parsed = JSON.parse(extractJson(res.text)) as {
          rows?: { title?: unknown; username?: unknown; password?: unknown; url?: unknown }[];
        };
        raw = (parsed.rows ?? [])
          .map((r) => ({
            title: typeof r.title === 'string' ? r.title.trim() : '',
            username: typeof r.username === 'string' ? r.username.trim() : '',
            password: typeof r.password === 'string' ? r.password.trim() : '',
            url: typeof r.url === 'string' ? r.url.trim() : '',
          }))
          .filter((r) => r.title);
      } catch {
        raw = [];
      }
    }
  }
  if (raw.length === 0) raw = heuristicRows(text).filter((r) => r.title);
  if (raw.length === 0) return { ok: false, error: 'Keine Einträge erkannt.' };

  let catMap: Awaited<ReturnType<typeof categorizeTitles>> = new Map();
  try {
    catMap = await categorizeTitles(raw.map((r) => r.title));
  } catch (e) {
    // Kategorisierung ist optional – im Zweifel „Sonstiges", Import läuft weiter.
    logger.error('[passwords] analyze categorize failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const rows: PwImportRow[] = raw.slice(0, 500).map((r) => ({
    title: r.title,
    username: r.username || null,
    password: r.password || null,
    url: r.url || null,
    category: catMap.get(r.title) ?? 'Sonstiges',
  }));
  return { ok: true, rows };
}

const commitSchema = z.object({
  rows: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        username: z.string().max(200).nullable(),
        password: z.string().max(2000).nullable(),
        url: z.string().max(500).nullable(),
        category: z.string().max(60),
      }),
    )
    .max(1000),
});

export type PwCommitResult = { ok: true; inserted: number } | { ok: false; error: string };

/** Imports the confirmed rows (encrypts each password). */
export async function commitPasswordImportAction(
  rows: PwImportRow[],
): Promise<PwCommitResult> {
  const auth = await requireAgency();
  if ('error' in auth) return { ok: false, error: auth.error };

  const parsed = commitSchema.safeParse({ rows });
  if (!parsed.success) return { ok: false, error: 'Ungültige Daten.' };

  const anyPassword = parsed.data.rows.some((r) => r.password);
  if (anyPassword && !isSecretVaultEnabled()) {
    return { ok: false, error: 'Passwort-Verschlüsselung ist nicht konfiguriert (SECRET_ENCRYPTION_KEY fehlt).' };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  const payload = parsed.data.rows.map((r) => ({
    organization_id: auth.orgId,
    title: r.title,
    username: r.username || null,
    secret_encrypted: r.password ? encryptSecret(r.password) : null,
    url: r.url || null,
    category: isPwCategory(r.category) ? r.category : 'Sonstiges',
    created_by: user?.id ?? null,
  }));

  const { error } = await supabase.from('password_entries').insert(payload);
  if (error) {
    // Den echten Grund nicht verschlucken – sonst bleibt nur ein
    // undiagnostizierbares „unerwarteter Fehler" (siehe Muster in ideas/contracts).
    logger.error('[passwords] import commit failed', {
      code: error.code,
      message: error.message,
      details: error.details,
      count: payload.length,
    });
    return {
      ok: false,
      error:
        error.code === '42P01'
          ? 'Passwort-Tabelle fehlt (Migration 0092 nicht ausgeführt).'
          : `Import fehlgeschlagen: ${error.message}`,
    };
  }
  revalidatePath('/app/passwords');
  return { ok: true, inserted: payload.length };
}

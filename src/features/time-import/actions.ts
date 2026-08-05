'use server';

import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listTeamMembers } from '@/features/messenger/queries';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';

export interface ImportPreviewRow {
  employee: string; // raw label from the sheet
  date: string; // YYYY-MM-DD
  minutes: number;
  userId: string | null; // matched member
  matchedName: string | null;
}

export interface MemberOption {
  userId: string;
  name: string;
}

export type AnalyzeResult =
  | {
      ok: true;
      rows: ImportPreviewRow[];
      members: MemberOption[];
      source: 'ai' | 'heuristic';
      aiEnabled: boolean;
    }
  | { ok: false; error: string };

interface ParsedRow {
  employee: string;
  date: string;
  minutes: number;
}

const AI_SYSTEM = `Du extrahierst Arbeitszeit-Einträge aus einer (aus Excel kopierten) Tabelle.
Antworte AUSSCHLIESSLICH mit JSON (keine Code-Fences):
{ "rows": [ { "employee": "Name", "date": "YYYY-MM-DD", "hours": 8.5 } ] }
Regeln:
- date immer als YYYY-MM-DD (deutsche Formate wie 01.08.2026 und 12-01-2026 (TT-MM-JJJJ) umrechnen).
- hours als Dezimalzahl in Stunden (z. B. "8:30" -> 8.5, "07:30:52" -> 7.51, "8,5 Std" -> 8.5).
- Steht der Name nur in einer Kopfzeile und die Folgezeilen (mit Datum + Zeit) haben kein Namensfeld,
  dann gilt der zuletzt genannte Name für alle folgenden Zeilen bis zum nächsten Namen.
- Kopf-/Summenzeilen ignorieren (z. B. eine Gesamtsumme wie "830:49:30" über 24 Stunden ist keine Tageszeit).
- Zusätzliche Zahlenspalten (z. B. "751" oder "83.083") ignorieren, wenn bereits eine HH:MM:SS-Zeit vorhanden ist.
- Nur Zeilen mit Person + Datum + Tageszeit. Nichts erfinden.`;

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/** AI path: turn arbitrary pasted table text into normalized rows. */
async function parseWithAi(text: string): Promise<ParsedRow[] | null> {
  const res = await completeText({
    system: AI_SYSTEM,
    prompt: text.slice(0, 12000),
    maxTokens: 2000,
  });
  if (!res) return null;
  try {
    const parsed = JSON.parse(extractJson(res.text)) as {
      rows?: { employee?: unknown; date?: unknown; hours?: unknown }[];
    };
    const out: ParsedRow[] = [];
    for (const r of parsed.rows ?? []) {
      const employee = typeof r.employee === 'string' ? r.employee.trim() : '';
      const date = typeof r.date === 'string' ? r.date.trim() : '';
      const hours = typeof r.hours === 'number' ? r.hours : Number(r.hours);
      if (!employee || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hours)) continue;
      const minutes = Math.round(hours * 60);
      if (minutes > 0 && minutes <= 1440) out.push({ employee, date, minutes });
    }
    return out;
  } catch {
    return null;
  }
}

/** Parses a cell as a calendar date (DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, or
 *  ISO YYYY-MM-DD) to a normalized YYYY-MM-DD string, or null. */
function parseDateCell(c: string): string | null {
  const iso = c.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = c.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${y}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  }
  return null;
}

/** Parses a cell as a clock duration (HH:MM or HH:MM:SS) to minutes, or null. */
function parseDurationCell(c: string): number | null {
  const m = c.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  const secs = m[3] ? Number(m[3]) : 0;
  return hours * 60 + mins + Math.round(secs / 60);
}

/**
 * Fallback parser. Splits rows by tab/;/, and picks out a date + duration.
 * Handles blocks where the employee name only appears in a header row and the
 * following dated rows carry no name (the last seen name is carried forward),
 * plus HH:MM:SS durations and DD-MM-YYYY dates. Summary rows (a total > 24h
 * with no date) set the current name but are not imported.
 */
function parseHeuristic(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  let currentEmployee = '';
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/\t|;|,/).map((c) => c.trim());
    let date: string | null = null;
    let minutes: number | null = null;
    let hoursFallback: number | null = null;
    const nameParts: string[] = [];
    for (const c of cells) {
      if (!c) continue;
      const d = parseDateCell(c);
      if (d) {
        date = d;
        continue;
      }
      const dur = parseDurationCell(c);
      if (dur != null) {
        if (minutes == null) minutes = dur; // first duration wins
        continue;
      }
      const num = c.match(/^(\d{1,2}(?:[.,]\d{1,2})?)$/);
      if (num) {
        const v = Number(num[1]!.replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v <= 24) hoursFallback = Math.round(v * 60);
        continue; // a bare number is hours-or-noise, never a name
      }
      // Any other numeric/separator-only token (e.g. "751", "83.083") is noise.
      if (/^[\d.,:]+$/.test(c)) continue;
      nameParts.push(c);
    }
    const name = nameParts.join(' ').trim();
    if (name) currentEmployee = name; // header row or same-line name
    const mins = minutes ?? hoursFallback;
    if (date && mins && mins > 0 && mins <= 1440 && currentEmployee) {
      out.push({ employee: currentEmployee, date, minutes: mins });
    }
  }
  return out;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Best-effort match of a raw employee label to an org member by name. */
function matchMember(
  employee: string,
  members: { userId: string; name: string }[],
): { userId: string; name: string } | null {
  const e = norm(employee);
  // Exact, then contains either direction, then token overlap.
  const exact = members.find((m) => norm(m.name) === e);
  if (exact) return exact;
  const contains = members.find(
    (m) => norm(m.name).includes(e) || e.includes(norm(m.name)),
  );
  if (contains) return contains;
  const eTokens = new Set(e.split(' '));
  const overlap = members.find((m) =>
    norm(m.name)
      .split(' ')
      .some((t) => t.length > 2 && eTokens.has(t)),
  );
  return overlap ?? null;
}

async function requireAdminOrg(): Promise<
  { orgId: string } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nicht angemeldet.' };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return { error: 'Keine Berechtigung.' };
  return { orgId };
}

/** Analyze pasted text → normalized, employee-matched preview rows. */
export async function analyzeTimeImportAction(text: string): Promise<AnalyzeResult> {
  const auth = await requireAdminOrg();
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!text || text.trim().length < 3) return { ok: false, error: 'Bitte Daten einfügen.' };

  const aiEnabled = isAiEnabled();
  let parsed: ParsedRow[] | null = null;
  let source: 'ai' | 'heuristic' = 'heuristic';
  if (aiEnabled) {
    parsed = await parseWithAi(text);
    if (parsed && parsed.length > 0) source = 'ai';
  }
  if (!parsed || parsed.length === 0) {
    parsed = parseHeuristic(text);
    source = 'heuristic';
  }
  if (parsed.length === 0) {
    // Be honest about *why* nothing was found: a "KI-Import" that silently ran
    // only the simple parser (because no API key is configured) is misleading.
    const hint = aiEnabled
      ? 'Keine Zeilen erkannt. Bitte Format prüfen (Name · Datum · Stunden).'
      : 'Keine Zeilen erkannt – die KI ist derzeit nicht aktiv (kein API-Schlüssel hinterlegt), daher lief nur die einfache Erkennung. Format prüfen oder KI aktivieren (OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY).';
    return { ok: false, error: hint };
  }

  const team = await listTeamMembers(auth.orgId);
  const members: MemberOption[] = team.map((m) => ({ userId: m.userId, name: m.name }));

  const rows: ImportPreviewRow[] = parsed.slice(0, 500).map((r) => {
    const m = matchMember(r.employee, members);
    return {
      employee: r.employee,
      date: r.date,
      minutes: r.minutes,
      userId: m?.userId ?? null,
      matchedName: m?.name ?? null,
    };
  });

  return { ok: true, rows, members, source, aiEnabled };
}

const commitSchema = z.object({
  rows: z
    .array(
      z.object({
        userId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        minutes: z.number().int().min(1).max(1440),
      }),
    )
    .max(1000),
});

export type CommitResult = { ok: true; inserted: number } | { ok: false; error: string };

/** Imports the confirmed rows as completed work sessions. */
export async function commitTimeImportAction(
  rows: { userId: string; date: string; minutes: number }[],
): Promise<CommitResult> {
  const auth = await requireAdminOrg();
  if ('error' in auth) return { ok: false, error: auth.error };

  const parsed = commitSchema.safeParse({ rows });
  if (!parsed.success) return { ok: false, error: 'Ungültige Daten.' };

  const service = createSupabaseServiceClient();

  // Only allow members of this org.
  const team = await listTeamMembers(auth.orgId);
  const allowed = new Set(team.map((m) => m.userId));

  const payload = parsed.data.rows
    .filter((r) => allowed.has(r.userId))
    .map((r) => {
      const clockIn = new Date(`${r.date}T08:00:00.000Z`);
      const clockOut = new Date(clockIn.getTime() + r.minutes * 60_000);
      return {
        organization_id: auth.orgId,
        user_id: r.userId,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        status: 'closed' as const,
      };
    });

  if (payload.length === 0) return { ok: false, error: 'Keine gültigen Zeilen.' };

  const { error } = await service.from('work_sessions').insert(payload);
  if (error) {
    logger.error('time_import.insert_failed', { error: error.message });
    return { ok: false, error: 'Import fehlgeschlagen.' };
  }
  return { ok: true, inserted: payload.length };
}

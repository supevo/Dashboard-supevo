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
  | { ok: true; rows: ImportPreviewRow[]; members: MemberOption[] }
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
- date immer als YYYY-MM-DD (deutsche Formate wie 01.08.2026 umrechnen).
- hours als Dezimalzahl in Stunden (z. B. "8:30" -> 8.5, "8,5 Std" -> 8.5).
- Kopf-/Summenzeilen ignorieren. Nur Zeilen mit Person + Datum + Zeit.
- Nichts erfinden.`;

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

/** Fallback: split rows by tab/;/, and pick out a date + a number of hours. */
function parseHeuristic(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    let date: string | null = null;
    let minutes: number | null = null;
    const nameParts: string[] = [];
    for (const c of cells) {
      const dm = c.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      const iso = c.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const hm = c.match(/^(\d{1,2})[:.](\d{2})$/); // 8:30
      const num = c.match(/^(\d{1,2}(?:[.,]\d{1,2})?)$/);
      if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (dm) {
        const y = dm[3]!.length === 2 ? `20${dm[3]}` : dm[3]!;
        date = `${y}-${dm[2]!.padStart(2, '0')}-${dm[1]!.padStart(2, '0')}`;
      } else if (hm) minutes = Number(hm[1]) * 60 + Number(hm[2]);
      else if (num) minutes = Math.round(Number(num[1]!.replace(',', '.')) * 60);
      else nameParts.push(c);
    }
    if (date && minutes && minutes > 0 && minutes <= 1440 && nameParts.length) {
      out.push({ employee: nameParts.join(' '), date, minutes });
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

  let parsed: ParsedRow[] | null = null;
  if (isAiEnabled()) {
    parsed = await parseWithAi(text);
  }
  if (!parsed || parsed.length === 0) {
    parsed = parseHeuristic(text);
  }
  if (parsed.length === 0) {
    return { ok: false, error: 'Keine Zeilen erkannt. Format prüfen (Name · Datum · Stunden).' };
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

  return { ok: true, rows, members };
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

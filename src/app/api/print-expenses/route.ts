import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { FILES_BUCKET } from '@/lib/files/storage';
import {
  resolvePrintMarkupPercent,
  clientChargeCents,
  clampMarkupPercent,
} from '@/features/print-billing/markup';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB – supplier invoices are small.
const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get('host') ?? '';
    if (originHost && originHost === requestHost) return true;
    return originHost === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/** Parses a German euro amount ("12,50", "1.234,00") to cents, or null. */
function euroToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const v = Number.parseFloat(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

/** Uploads a supplier invoice for a print job and records it as an expense. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }
  if (!hasAgencyAccess(user)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const taskId = String(form.get('taskId') ?? '');
  // Art der Rechnung: Proforma (sofort) oder Endrechnung (nachträglich).
  const kind = form.get('kind') === 'proforma' ? 'proforma' : 'final';
  const supplier = String(form.get('supplier') ?? '').trim().slice(0, 200) || null;
  const notes = String(form.get('notes') ?? '').trim().slice(0, 2000) || null;
  const amountCents = euroToCents(String(form.get('amount') ?? ''));
  // Optionaler Custom-Faktor (Prozent) für genau diese Drucksache. Leer =
  // voreingestellter Faktor des Kunden. Untergrenze 20 % wird unten erzwungen.
  const rawMarkup = String(form.get('markupPercent') ?? '').trim();
  const customMarkupPercent = /^\d{1,4}$/.test(rawMarkup)
    ? Number.parseInt(rawMarkup, 10)
    : null;

  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Die Datei ist zu groß (max. 15 MB).' },
      { status: 400 },
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Bitte ein PDF oder Bild hochladen.' },
      { status: 400 },
    );
  }

  // Access gate: RLS returns the task only to agency staff of its org.
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('id, organization_id, project_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }
  const { data: project } = await supabase
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();

  const service = createSupabaseServiceClient();

  // Aufschlag (Prozent) zum Upload-Zeitpunkt einfrieren und den dem Kunden zu
  // berechnenden Betrag (Brutto der Druckerei + Aufschlag) daraus ableiten.
  let markupPercent: number | null = null;
  let clientCharge: number | null = null;
  if (project?.client_company_id) {
    // Custom-Faktor gewinnt, sonst der Kunden-Voreinstellwert – immer mit
    // erzwungener 20-%-Untergrenze.
    const preset = await resolvePrintMarkupPercent(
      service,
      project.client_company_id,
    );
    markupPercent = clampMarkupPercent(customMarkupPercent ?? preset);
    if (amountCents != null) {
      clientCharge = clientChargeCents(amountCents, markupPercent);
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'rechnung';
  const path = `org/${task.organization_id}/print-expenses/${randomUUID()}-${safeName}`;

  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) {
    logger.error('print_expense.upload_failed', { error: upErr.message });
    return NextResponse.json(
      { error: `Datei-Upload fehlgeschlagen: ${upErr.message}` },
      { status: 500 },
    );
  }

  // Basisspalten (seit jeher vorhanden) und die neueren, migrations-abhängigen
  // Spalten getrennt halten. Fehlt eine neuere Migration (0173/0174 markup,
  // 0191 kind), scheiterte der Insert bisher komplett. Jetzt fällt er auf die
  // Basisspalten zurück, damit der Upload wie in früheren Versionen gespeichert
  // wird – die Proforma/Endrechnung-Trennung greift dann erst nach Migration 0191.
  const baseRow: Record<string, unknown> = {
    organization_id: task.organization_id,
    client_company_id: project?.client_company_id ?? null,
    task_id: task.id,
    uploaded_by: user.id,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    file_mime: file.type,
    file_size: file.size,
    amount_cents: amountCents,
    supplier,
    notes,
  };
  const fullRow: Record<string, unknown> = {
    ...baseRow,
    markup_percent: markupPercent,
    client_charge_cents: clientCharge,
    kind,
  };

  let insErr = (await service.from('print_expenses').insert(fullRow as never))
    .error;
  if (insErr) {
    // Wahrscheinlich fehlt eine Spalte (Migration nicht eingespielt) → nur die
    // Basisspalten schreiben, damit der Beleg trotzdem gespeichert wird.
    logger.warn('print_expense.insert_full_failed', { error: insErr.message });
    insErr = (await service.from('print_expenses').insert(baseRow as never))
      .error;
  }
  if (insErr) {
    logger.error('print_expense.insert_failed', { error: insErr.message });
    return NextResponse.json(
      { error: `Speichern fehlgeschlagen: ${insErr.message}` },
      { status: 500 },
    );
  }

  // Nur die ENDRECHNUNG schließt die Abrechnung ab ('settled'); die Proforma
  // wird nur erfasst (Status bleibt 'required'/'ordered', bis die Endrechnung da
  // ist). So nagt die Erinnerung weiter, bis auch die Endrechnung vorliegt.
  if (kind === 'final') {
    await service
      .from('tasks')
      .update({ print_billing_status: 'settled' })
      .eq('id', task.id);
  }

  return NextResponse.json({ ok: true });
}

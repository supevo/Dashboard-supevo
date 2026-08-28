import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  getCurrentUser,
  hasAgencyAccess,
  primaryAgencyOrgId,
} from '@/features/auth/session';
import { extractMarketingPlanFromPdf } from '@/lib/ai/vision';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
// KI-Auslesen eines PDFs kann etwas dauern.
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Liest einen bestehenden Marketingplan aus einem hochgeladenen PDF per KI aus
 * und legt daraus die Phasen + Maßnahmen für den Kunden an. Der so importierte
 * Plan ist ein Agentur-Entwurf, der wie ein KI-Entwurf im Plan-Editor geprüft/
 * angepasst und dann an den Kunden freigegeben wird. Legt nur an, wenn noch
 * kein Plan mit Phasen existiert.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientCompanyId: string }> },
) {
  const { clientCompanyId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  if (!hasAgencyAccess(user)) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Bitte ein PDF hochladen.' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF zu groß (max. 20 MB).' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  // Kunde muss zur Organisation des Nutzers gehören.
  const { data: company } = await service
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extracted = await extractMarketingPlanFromPdf(bytes);
  if (!extracted) {
    return NextResponse.json(
      { error: 'Konnte den Plan nicht auslesen (KI nicht aktiv oder PDF unlesbar).' },
      { status: 422 },
    );
  }

  // Normalisieren + validieren.
  const phases = (extracted.phases ?? [])
    .map((p) => ({
      title: (p.title ?? '').trim().slice(0, 200),
      timeframeHint: (p.timeframeHint ?? '').trim().slice(0, 200),
      outcome: (p.outcome ?? '').trim().slice(0, 500),
      measures: (p.measures ?? [])
        .filter((m): m is string => typeof m === 'string')
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((m) => m.slice(0, 300)),
    }))
    .filter((p) => p.title && p.measures.length > 0);
  if (phases.length === 0) {
    return NextResponse.json(
      { error: 'Im PDF wurden keine Phasen/Maßnahmen erkannt.' },
      { status: 422 },
    );
  }

  // Plan sicherstellen; nur in einen leeren Plan importieren.
  const { data: existing } = await service
    .from('marketing_plans')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  let planId = existing?.id ?? null;
  if (planId) {
    const { count } = await service
      .from('marketing_plan_phases')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', planId);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            'Der Kunde hat bereits einen Plan mit Phasen. Bitte diesen zuerst leeren, dann importieren.',
        },
        { status: 409 },
      );
    }
  } else {
    const { data, error } = await service
      .from('marketing_plans')
      .insert({
        organization_id: orgId,
        client_company_id: clientCompanyId,
        title: 'Marketingplan',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !data) {
      logger.error('marketing_plan.import.create_failed', {
        error: error?.message,
      });
      return NextResponse.json({ error: 'Anlegen fehlgeschlagen.' }, { status: 500 });
    }
    planId = data.id;
  }

  if (!planId) {
    return NextResponse.json({ error: 'Anlegen fehlgeschlagen.' }, { status: 500 });
  }

  // Phasen + Maßnahmen einfügen.
  let pos = 0;
  for (const phase of phases) {
    const { data: row } = await service
      .from('marketing_plan_phases')
      .insert({
        plan_id: planId,
        title: phase.title,
        timeframe_hint: phase.timeframeHint || null,
        outcome: phase.outcome || null,
        position: (pos += 1),
      })
      .select('id')
      .single();
    if (!row) continue;
    const rows = phase.measures.map((title, i) => ({
      plan_id: planId,
      phase_id: row.id,
      title,
      position: (i + 1) * 1000,
    }));
    if (rows.length > 0) {
      await service.from('marketing_plan_items').insert(rows);
    }
  }
  const closing = (extracted.closingNote ?? '').trim();
  if (closing) {
    await service
      .from('marketing_plans')
      .update({ closing_note: closing.slice(0, 2000) })
      .eq('id', planId);
  }

  return NextResponse.json({ ok: true, phases: phases.length });
}

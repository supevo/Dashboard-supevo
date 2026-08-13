import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kategorie, kategorieLabel } from '@/features/accounting/categories';

/** One booking line for the Steuerberater export (already display-formatted). */
export interface BookingExportRow {
  datum: string;
  art: 'Einnahme' | 'Ausgabe' | 'Neutral';
  /** Absolute amount in euros with comma decimals, e.g. "119,00". */
  betrag: string;
  kategorie: string;
  /** EÜR-Position der Kategorie (für die Anlage EÜR), sonst "". */
  euer: string;
  /** USt-Satz der Kategorie in Prozent, z. B. "19". */
  ustSatz: string;
  gegen: string;
  zweck: string;
  /** "Ja" / "Nein" / "Nicht nötig". */
  belegVorhanden: string;
  belegDatei: string;
  rechnungsnummer: string;
}

function euroAbs(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
}

/**
 * All bookings of a period, enriched for a Steuerberater/EÜR hand-off: category
 * + EÜR position + USt rate, whether a receipt is on file, and the receipt's
 * file name / invoice number. `month` 1..12 limits to that month; 0/undefined
 * exports the whole year. Sorted by date ascending (as a Steuerberater expects).
 */
export async function getBookingExportRows(
  billingEntityId: string,
  year: number,
  month?: number,
): Promise<BookingExportRow[]> {
  const supabase = await createSupabaseServerClient();

  const hasMonth = !!month && month >= 1 && month <= 12;
  const from = hasMonth
    ? `${year}-${String(month).padStart(2, '0')}-01`
    : `${year}-01-01`;
  const to = hasMonth
    ? `${year}-${String(month).padStart(2, '0')}-${String(
        new Date(year, month!, 0).getDate(),
      ).padStart(2, '0')}`
    : `${year}-12-31`;

  const { data: txns } = await supabase
    .from('bookkeeping_transactions')
    .select(
      'id, datum, gegen, zweck, betrag_cents, kategorie_id, beleg_id, beleg_nicht_noetig',
    )
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', from)
    .lte('datum', to)
    .order('datum', { ascending: true })
    .limit(20000);
  const rows = txns ?? [];

  // Beleg-Infos (Dateiname, Rechnungsnr.) nachladen und zuordnen.
  const belegIds = [...new Set(rows.map((t) => t.beleg_id).filter((x): x is string => !!x))];
  const belegById = new Map<
    string,
    { file_name: string | null; rechnungsnummer: string | null }
  >();
  if (belegIds.length > 0) {
    const { data: belege } = await supabase
      .from('bookkeeping_receipts')
      .select('id, file_name, rechnungsnummer')
      .in('id', belegIds);
    for (const b of belege ?? []) {
      belegById.set(b.id, {
        file_name: b.file_name,
        rechnungsnummer: b.rechnungsnummer,
      });
    }
  }

  return rows.map((t) => {
    const kat = kategorie(t.kategorie_id);
    const art: BookingExportRow['art'] =
      kat?.art === 'einnahme'
        ? 'Einnahme'
        : kat?.art === 'ausgabe'
          ? 'Ausgabe'
          : t.betrag_cents >= 0
            ? 'Einnahme'
            : 'Ausgabe';
    const beleg = t.beleg_id ? belegById.get(t.beleg_id) : undefined;
    const belegVorhanden = t.beleg_id
      ? 'Ja'
      : t.beleg_nicht_noetig
        ? 'Nicht nötig'
        : 'Nein';
    return {
      datum: t.datum,
      art,
      betrag: euroAbs(t.betrag_cents),
      kategorie: t.kategorie_id ? kategorieLabel(t.kategorie_id) : '',
      euer: kat?.euer ?? '',
      ustSatz: kat ? String(kat.ust) : '',
      gegen: t.gegen ?? '',
      zweck: t.zweck ?? '',
      belegVorhanden,
      belegDatei: beleg?.file_name ?? '',
      rechnungsnummer: beleg?.rechnungsnummer ?? '',
    };
  });
}

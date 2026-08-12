/**
 * Szenario-Tests: ein realistischer „Monat" einer Firma als Testumgebung.
 * Beispieldaten mischen saubere Fälle mit typischen Fallstricken (falsch
 * ausgelesene Beträge, gleiche Beträge mehrfach, vertauschte Richtung,
 * Teil-/Sammelzahlungen, ausgeklammerte Kategorien). Ziel: End-to-end prüfen,
 * dass die Engine richtig zuordnet UND nichts falsch verbucht.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReconcile,
  type ReconcileInputRows,
} from '@/features/accounting/reconcile-compute';

function tx(
  id: string,
  datum: string,
  gegen: string,
  betrag_cents: number,
  zweck = '',
  kategorie_id: string | null = null,
): ReconcileInputRows['txRows'][number] {
  return {
    id,
    datum,
    gegen,
    zweck,
    betrag_cents,
    re_id: null,
    beleg_id: null,
    beleg_nicht_noetig: false,
    kategorie_id,
  };
}
function receipt(
  id: string,
  beleg_datum: string,
  haendler: string,
  brutto_cents: number | null,
  kind: 'einnahme' | 'ausgabe',
  rechnungsnummer: string | null = null,
): ReconcileInputRows['receiptRows'][number] {
  return { id, haendler, beleg_datum, brutto_cents, kind, rechnungsnummer };
}
function base(over: Partial<ReconcileInputRows> = {}): ReconcileInputRows {
  return {
    txRows: [],
    allocRows: [],
    invoiceRows: [],
    clientName: new Map(),
    receiptRows: [],
    ...over,
  };
}

describe('Szenario: kompletter Monat März 2026 (gemischte Realdaten)', () => {
  const input = base({
    txRows: [
      // --- Ausgänge (Ausgaben, negativ) ---
      tx('a1', '2026-03-03', 'ACME GmbH', -11900, 'Rechnung R-100'), // Beleg exakt + Nr.
      tx('a2', '2026-03-08', 'Hosting AG', -4990, 'Servermiete'), // Beleg exakt, kein Nr.
      tx('a3', '2026-03-15', 'Bahn AG', -6540, 'Ticket'), // Beleg nahe (Rundung)
      tx('a4', '2026-03-19', 'Büro Müller', -2500, 'Papier'), // Beleg exakt
      tx('a5', '2026-03-22', 'Unbekannt Laden', -8800, ''), // KEIN Beleg → Beleg fehlt
      tx('a6', '2026-03-25', 'Finanzamt', -120000, 'USt-Vorauszahlung', 'steuern'), // ausgeklammert
      // --- Eingänge (Einnahmen, positiv) ---
      tx('e1', '2026-03-05', 'Kunde Alpha AG', 119000, 'Zahlung RE-2026-1'), // Rechnung exakt + Nr.
      tx('e2', '2026-03-10', 'Beta GmbH', 30000, 'RE-A RE-B'), // Sammelzahlung 2 Rechnungen
      tx('e3', '2026-03-06', 'Gamma KG', 20000, 'RE-C Rate 1'), // Teilzahlung 1/2
      tx('e4', '2026-03-20', 'Gamma KG', 20000, 'RE-C Rate 2'), // Teilzahlung 2/2
      tx('e5', '2026-03-28', 'Spende e.V.', 5000, 'Rückerstattung'), // kein Doc → ohne Zuordnung
    ],
    invoiceRows: [
      { id: 'iA', invoice_number: 'RE-2026-1', gross_cents: 119000, issue_date: '2026-03-01', client_company_id: 'cA' },
      { id: 'iB1', invoice_number: 'RE-A', gross_cents: 10000, issue_date: '2026-03-02', client_company_id: 'cB' },
      { id: 'iB2', invoice_number: 'RE-B', gross_cents: 20000, issue_date: '2026-03-02', client_company_id: 'cB' },
      { id: 'iC', invoice_number: 'RE-C', gross_cents: 40000, issue_date: '2026-03-01', client_company_id: 'cC' },
    ],
    clientName: new Map([
      ['cA', 'Kunde Alpha AG'],
      ['cB', 'Beta GmbH'],
      ['cC', 'Gamma KG'],
    ]),
    receiptRows: [
      receipt('r1', '2026-03-02', 'ACME GmbH', 11900, 'ausgabe', 'R-100'),
      receipt('r2', '2026-03-07', 'Hosting AG', 4990, 'ausgabe'),
      receipt('r3', '2026-03-14', 'Bahn AG', 6541, 'ausgabe'), // 1 Cent daneben
      receipt('r4', '2026-03-18', 'Büro Müller', 2500, 'ausgabe'),
      // Ausgangsrechnung als Beleg, aber KEINE passende Bankzahlung → unpaidOutgoing
      receipt('r5', '2026-03-11', 'Delta AG', 45000, 'einnahme', 'RE-2026-9'),
      // Eingangsrechnung als Beleg, noch nicht bezahlt → unpaidIncoming
      receipt('r6', '2026-03-12', 'Lieferant XY', 33000, 'ausgabe', 'LX-77'),
    ],
    excludedCategories: ['steuern'],
  });

  const res = computeReconcile(input);

  it('ordnet die 4 Ausgabe-Belege ihren Bankausgängen zu', () => {
    const paid = res.receipts
      .filter((r) => r.txBetragCents < 0)
      .map((r) => r.receiptHaendler)
      .sort();
    expect(paid).toEqual(['ACME GmbH', 'Bahn AG', 'Büro Müller', 'Hosting AG']);
  });

  it('erkennt Zahlungseingang ↔ Ausgangsrechnung (RE-2026-1) automatisch', () => {
    const m = res.payments.find((p) => p.invoiceNumber === 'RE-2026-1');
    expect(m).toBeTruthy();
    expect(m!.match.auto).toBe(true);
  });

  it('erkennt die Sammelzahlung (RE-A + RE-B = 300 €)', () => {
    expect(res.combos).toHaveLength(1);
    expect(res.combos[0]!.invoices.map((i) => i.number).sort()).toEqual(['RE-A', 'RE-B']);
  });

  it('erkennt die Teilzahlung (RE-C in 2 Raten)', () => {
    expect(res.splits).toHaveLength(1);
    expect(res.splits[0]!.invoiceNumber).toBe('RE-C');
    expect(res.splits[0]!.payments).toHaveLength(2);
  });

  it('meldet den Ausgang ohne Beleg als „Beleg fehlt"', () => {
    expect(res.missingReceipts.map((m) => m.txId)).toContain('a5');
  });

  it('meldet den Eingang ohne Zuordnung', () => {
    expect(res.missingIncoming.map((m) => m.txId)).toContain('e5');
  });

  it('klammert die Steuer-Buchung aus (nicht Beleg-fehlt, sondern excluded)', () => {
    expect(res.missingReceipts.map((m) => m.txId)).not.toContain('a6');
    expect(res.excluded.map((e) => e.txId)).toContain('a6');
  });

  it('listet die unbezahlte Ausgangsrechnung (Beleg r5) als unpaidOutgoing', () => {
    expect(res.unpaidOutgoing.map((r) => r.receiptId)).toContain('r5');
  });

  it('listet die unbezahlte Eingangsrechnung (Beleg r6) als unpaidIncoming', () => {
    expect(res.unpaidIncoming.map((r) => r.receiptId)).toContain('r6');
  });

  it('verbucht NICHTS doppelt: jede Bankbuchung höchstens einmal zugeordnet', () => {
    const usedTx = [
      ...res.payments.map((p) => p.match.leftId),
      ...res.combos.map((c) => c.match.txId),
      ...res.splits.flatMap((s) => s.match.txIds),
      ...res.receipts.map((r) => r.match.rightId),
    ];
    expect(new Set(usedTx).size).toBe(usedTx.length);
  });

  it('verbucht keinen Beleg doppelt', () => {
    const usedRec = res.receipts.map((r) => r.match.leftId);
    expect(new Set(usedRec).size).toBe(usedRec.length);
  });
});

describe('Szenario: absichtlich falsche/knifflige Daten', () => {
  it('falsch ausgelesener Betrag wird NICHT falsch verbucht', () => {
    const res = computeReconcile(
      base({
        txRows: [tx('t1', '2026-03-05', 'ACME GmbH', -11900)],
        receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 9900, 'ausgabe')],
      }),
    );
    expect(res.receipts).toHaveLength(0);
    expect(res.missingReceipts).toHaveLength(1);
  });

  it('vertauschte Richtung: Ausgabe-Beleg matcht nicht auf Eingang', () => {
    const res = computeReconcile(
      base({
        txRows: [tx('t1', '2026-03-05', 'Kunde AG', 11900)],
        receiptRows: [receipt('r1', '2026-03-04', 'Kunde AG', 11900, 'ausgabe')],
      }),
    );
    expect(res.receipts).toHaveLength(0);
    expect(res.unpaidIncoming.map((r) => r.receiptId)).toContain('r1');
  });

  it('zwei gleich hohe Ausgänge, ein Beleg → nur EINE Zuordnung, richtiger Händler', () => {
    const res = computeReconcile(
      base({
        txRows: [
          tx('t1', '2026-03-11', 'ACME GmbH', -5000),
          tx('t2', '2026-03-11', 'Fremd GmbH', -5000),
        ],
        receiptRows: [receipt('r1', '2026-03-10', 'ACME GmbH', 5000, 'ausgabe')],
      }),
    );
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.txGegen).toBe('ACME GmbH');
  });

  it('gleicher Betrag, unbekannter Händler → Vorschlag, aber NICHT automatisch', () => {
    const res = computeReconcile(
      base({
        txRows: [tx('t1', '2026-03-05', 'Wildfremd XY', -11900)],
        receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe')],
      }),
    );
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.match.auto).toBe(false);
  });

  it('Beleg 90 Tage entfernt wird nicht (falsch) zugeordnet', () => {
    const res = computeReconcile(
      base({
        txRows: [tx('t1', '2026-06-01', 'ACME GmbH', -11900)],
        receiptRows: [receipt('r1', '2026-03-01', 'ACME GmbH', 11900, 'ausgabe')],
      }),
    );
    expect(res.receipts).toHaveLength(0);
  });
});

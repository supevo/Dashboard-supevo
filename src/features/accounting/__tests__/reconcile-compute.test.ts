import { describe, it, expect } from 'vitest';
import {
  computeReconcile,
  type ReconcileInputRows,
} from '@/features/accounting/reconcile-compute';

// Helpers to build realistic rows the way the DB would return them.
function tx(
  id: string,
  datum: string,
  gegen: string,
  betrag_cents: number,
  zweck = '',
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
  };
}
function receipt(
  id: string,
  beleg_datum: string,
  haendler: string,
  brutto_cents: number | null,
  kind: 'einnahme' | 'ausgabe',
): ReconcileInputRows['receiptRows'][number] {
  return { id, haendler, beleg_datum, brutto_cents, kind };
}
function base(
  over: Partial<ReconcileInputRows> = {},
): ReconcileInputRows {
  return {
    txRows: [],
    allocRows: [],
    invoiceRows: [],
    clientName: new Map(),
    receiptRows: [],
    ...over,
  };
}

describe('computeReconcile – Ausgaben-Belege ↔ Kontoauszug (der Fall des Nutzers)', () => {
  it('ordnet hochgeladene Ausgaben-Belege den passenden Bankausgängen zu', () => {
    const input = base({
      // Kontoauszug: drei Ausgänge (negativ).
      txRows: [
        tx('t1', '2026-03-05', 'ACME GmbH', -11900, 'Rechnung ACME'),
        tx('t2', '2026-03-12', 'Hosting AG', -4990, 'Server März'),
        tx('t3', '2026-03-20', 'Büro Müller', -2500, 'Papier'),
      ],
      // Belege (Ausgaben) mit ausgelesenem Brutto-Betrag.
      receiptRows: [
        receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe'),
        receipt('r2', '2026-03-11', 'Hosting AG', 4990, 'ausgabe'),
        receipt('r3', '2026-03-19', 'Büro Müller', 2500, 'ausgabe'),
      ],
    });

    const res = computeReconcile(input);

    // Alle drei Belege werden ihren Buchungen zugeordnet.
    expect(res.receipts).toHaveLength(3);
    const pairs = res.receipts
      .map((r) => `${r.receiptHaendler}:${r.txBetragCents}`)
      .sort();
    expect(pairs).toEqual([
      'ACME GmbH:-11900',
      'Büro Müller:-2500',
      'Hosting AG:-4990',
    ]);
    // Nichts bleibt als "Beleg fehlt" offen.
    expect(res.missingReceipts).toHaveLength(0);
  });

  it('meldet "Beleg fehlt", wenn zu einem Ausgang kein Beleg da ist', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'ACME GmbH', -11900)],
      receiptRows: [], // kein Beleg hochgeladen
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0);
    expect(res.missingReceipts).toHaveLength(1);
    expect(res.missingReceipts[0]!.txBetragCents).toBe(-11900);
  });

  it('ignoriert Belege ohne ausgelesenen Betrag (brutto_cents null)', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'ACME GmbH', -11900)],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', null, 'ausgabe')],
    });
    const res = computeReconcile(input);
    // Kein Match (Betrag fehlt) → Ausgang gilt als "Beleg fehlt".
    expect(res.receipts).toHaveLength(0);
    expect(res.missingReceipts).toHaveLength(1);
  });

  it('verwechselt Einnahme- und Ausgabe-Belege NICHT (Richtung zählt)', () => {
    // Ein Ausgabe-Beleg darf nicht auf einen Zahlungseingang gematcht werden.
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'Kunde AG', 11900)], // Eingang (positiv)
      receiptRows: [receipt('r1', '2026-03-04', 'Kunde AG', 11900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0); // keine falsche Zuordnung
  });
});

describe('computeReconcile – gemischte Einnahmen und Ausgaben zusammen', () => {
  it('trennt Eingänge (Rechnung) und Ausgänge (Beleg) korrekt im selben Lauf', () => {
    const input = base({
      txRows: [
        tx('tin', '2026-03-10', 'Kunde AG', 119000, 'Zahlung RE-2026-005'),
        tx('tout', '2026-03-12', 'Hosting AG', -4990, 'Server'),
      ],
      invoiceRows: [
        {
          id: 'i1',
          invoice_number: 'RE-2026-005',
          gross_cents: 119000,
          issue_date: '2026-03-01',
          client_company_id: 'c1',
        },
      ],
      clientName: new Map([['c1', 'Kunde AG']]),
      receiptRows: [receipt('r1', '2026-03-11', 'Hosting AG', 4990, 'ausgabe')],
    });

    const res = computeReconcile(input);
    // Eingang ↔ Ausgangsrechnung
    expect(res.payments).toHaveLength(1);
    expect(res.payments[0]!.invoiceNumber).toBe('RE-2026-005');
    // Ausgang ↔ Ausgabe-Beleg
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.receiptHaendler).toBe('Hosting AG');
    expect(res.missingReceipts).toHaveLength(0);
    expect(res.missingIncoming).toHaveLength(0);
  });
});

describe('computeReconcile – Teilzahlungen & bereits verbuchte Posten', () => {
  it('erkennt eine Rechnung, die in mehreren Teilzahlungen beglichen wurde', () => {
    const input = base({
      txRows: [
        tx('p1', '2026-03-05', 'Raten AG', 10000, 'RE-9 Rate 1'),
        tx('p2', '2026-03-20', 'Raten AG', 10000, 'RE-9 Rate 2'),
        tx('p3', '2026-04-05', 'Raten AG', 10000, 'RE-9 Rate 3'),
        tx('p4', '2026-04-20', 'Raten AG', 10000, 'RE-9 Rate 4'),
      ],
      invoiceRows: [
        {
          id: 'i1',
          invoice_number: 'RE-9',
          gross_cents: 40000,
          issue_date: '2026-03-01',
          client_company_id: 'c1',
        },
      ],
      clientName: new Map([['c1', 'Raten AG']]),
    });
    const res = computeReconcile(input);
    expect(res.splits).toHaveLength(1);
    expect(res.splits[0]!.payments).toHaveLength(4);
    expect(res.splits[0]!.match.paidCents).toBe(40000);
  });

  it('blendet bereits zugeordnete Buchungen und Belege aus', () => {
    const input = base({
      txRows: [
        { ...tx('t1', '2026-03-05', 'ACME GmbH', -11900), beleg_id: 'r1' },
      ],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0);
    expect(res.missingReceipts).toHaveLength(0); // t1 hat schon einen Beleg
  });

  it('respektiert "kein Beleg nötig" (nicht als Beleg-fehlt gelistet)', () => {
    const input = base({
      txRows: [
        { ...tx('t1', '2026-03-05', 'Finanzamt', -50000), beleg_nicht_noetig: true },
      ],
    });
    const res = computeReconcile(input);
    expect(res.missingReceipts).toHaveLength(0);
  });
});

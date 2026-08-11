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

describe('computeReconcile – Randfälle & falsche/knifflige Angaben', () => {
  it('matcht mit Skonto auf der Rechnung (bis 3,5 % weniger gezahlt)', () => {
    const input = base({
      txRows: [tx('p1', '2026-03-05', 'Kunde AG', 9650, 'Zahlung RE-5')],
      invoiceRows: [
        {
          id: 'i1',
          invoice_number: 'RE-5',
          gross_cents: 10000,
          issue_date: '2026-03-01',
          client_company_id: 'c1',
        },
      ],
      clientName: new Map([['c1', 'Kunde AG']]),
    });
    const res = computeReconcile(input);
    expect(res.payments).toHaveLength(1);
    expect(res.payments[0]!.invoiceNumber).toBe('RE-5');
  });

  it('matcht Beleg trotz abweichendem Händlernamen, wenn Betrag+Datum exakt', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'PAYPAL *ACME', -11900)],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(1);
  });

  it('matcht NICHT, wenn Beleg und Buchung > 60 Tage auseinander liegen', () => {
    const input = base({
      txRows: [tx('t1', '2026-06-01', 'ACME GmbH', -11900)],
      receiptRows: [receipt('r1', '2026-01-01', 'ACME GmbH', 11900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0);
    expect(res.missingReceipts).toHaveLength(1); // Buchung wird als offen gemeldet
  });

  it('bei gleichem Betrag mehrfach im Monat gewinnt die nächstgelegene Buchung', () => {
    const input = base({
      txRows: [
        tx('t1', '2026-03-11', 'ACME GmbH', -5000),
        tx('t2', '2026-03-24', 'ACME GmbH', -5000),
      ],
      receiptRows: [
        receipt('r1', '2026-03-10', 'ACME GmbH', 5000, 'ausgabe'),
        receipt('r2', '2026-03-25', 'ACME GmbH', 5000, 'ausgabe'),
      ],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(2);
    const byReceiptDate = Object.fromEntries(
      res.receipts.map((r) => [r.receiptDatum, r.txDatum]),
    );
    // r1 (10.) → t1 (11.), r2 (25.) → t2 (24.) – jeweils näheres Datum.
    expect(byReceiptDate['2026-03-10']).toBe('2026-03-11');
    expect(byReceiptDate['2026-03-25']).toBe('2026-03-24');
  });

  it('falsch ausgelesener Betrag matcht nicht (surft als "Beleg fehlt" auf, statt falsch zuzuordnen)', () => {
    const input = base({
      // Beleg-Betrag ist falsch ausgelesen (9900 statt 11900).
      txRows: [tx('t1', '2026-03-05', 'ACME GmbH', -11900)],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 9900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0); // keine falsche Zuordnung
    expect(res.missingReceipts).toHaveLength(1); // Nutzer sieht das Problem
  });

  it('Sammelzahlung und Teilzahlung im selben Lauf, ohne sich zu stören', () => {
    const input = base({
      txRows: [
        // Sammelzahlung: eine Zahlung deckt RE-A + RE-B.
        tx('pс', '2026-03-15', 'Sammel AG', 30000, 'RE-A RE-B'),
        // Teilzahlung: RE-C in zwei Raten.
        tx('pt1', '2026-03-05', 'Raten AG', 25000, 'RE-C Rate 1'),
        tx('pt2', '2026-03-25', 'Raten AG', 25000, 'RE-C Rate 2'),
      ],
      invoiceRows: [
        { id: 'ia', invoice_number: 'RE-A', gross_cents: 10000, issue_date: '2026-03-01', client_company_id: 'c1' },
        { id: 'ib', invoice_number: 'RE-B', gross_cents: 20000, issue_date: '2026-03-02', client_company_id: 'c1' },
        { id: 'ic', invoice_number: 'RE-C', gross_cents: 50000, issue_date: '2026-03-01', client_company_id: 'c2' },
      ],
      clientName: new Map([
        ['c1', 'Sammel AG'],
        ['c2', 'Raten AG'],
      ]),
    });
    const res = computeReconcile(input);
    expect(res.combos).toHaveLength(1);
    expect(res.combos[0]!.invoices).toHaveLength(2);
    expect(res.splits).toHaveLength(1);
    expect(res.splits[0]!.payments).toHaveLength(2);
  });
});

describe('computeReconcile – ausgeklammerte Kategorien', () => {
  it('nimmt Buchungen ausgeklammerter Kategorien komplett aus dem Abgleich', () => {
    const input = base({
      txRows: [
        // Privatentnahme – ausgeklammert.
        tx('t1', '2026-03-05', 'Inhaber', -50000, 'Privat', 'privatentnahme'),
        // Normale Ausgabe – bleibt im Abgleich.
        tx('t2', '2026-03-06', 'ACME GmbH', -11900, '', 'wareneinkauf'),
      ],
      receiptRows: [receipt('r2', '2026-03-05', 'ACME GmbH', 11900, 'ausgabe')],
      excludedCategories: ['privatentnahme'],
    });
    const res = computeReconcile(input);
    // t1 taucht NICHT als "Beleg fehlt" auf, sondern in excluded.
    expect(res.missingReceipts.some((m) => m.txId === 't1')).toBe(false);
    expect(res.excluded.map((e) => e.txId)).toEqual(['t1']);
    // t2 wird ganz normal zugeordnet.
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.match.rightId).toBe('t2');
  });
});

describe('computeReconcile – Fehlzuordnungen vermeiden (mehr Signale)', () => {
  it('gleicher Betrag+Datum aber anderer Händler → nur Vorschlag, NICHT automatisch', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'Ganz Anderer Laden GmbH', -11900)],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(1);
    // Ohne zweites Signal (Nr./Händler) darf es nicht auto-übernommen werden.
    expect(res.receipts[0]!.match.auto).toBe(false);
  });

  it('Rechnungsnummer im Verwendungszweck → sichere (automatische) Zuordnung', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'Unbekannt', -11900, 'Zahlung RE-77 danke')],
      receiptRows: [
        receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe', 'RE-77'),
      ],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.match.auto).toBe(true);
  });

  it('bei zwei gleich hohen Buchungen gewinnt die mit passendem Händler', () => {
    const input = base({
      txRows: [
        tx('t1', '2026-03-11', 'ACME GmbH', -5000),
        tx('t2', '2026-03-11', 'Fremd GmbH', -5000),
      ],
      receiptRows: [receipt('r1', '2026-03-10', 'ACME GmbH', 5000, 'ausgabe')],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(1);
    expect(res.receipts[0]!.txGegen).toBe('ACME GmbH');
  });

  it('abgelehnte Vorschläge kommen nicht wieder', () => {
    const input = base({
      txRows: [tx('t1', '2026-03-05', 'ACME GmbH', -11900)],
      receiptRows: [receipt('r1', '2026-03-04', 'ACME GmbH', 11900, 'ausgabe')],
      dismissed: [{ a_id: 'r1', b_id: 't1' }],
    });
    const res = computeReconcile(input);
    expect(res.receipts).toHaveLength(0);
    // Buchung bleibt offen (taucht als "Beleg fehlt" auf).
    expect(res.missingReceipts).toHaveLength(1);
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

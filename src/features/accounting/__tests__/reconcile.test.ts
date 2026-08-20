import { describe, it, expect } from 'vitest';
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  matchPaymentCombinations,
  matchInvoiceSplitPayments,
  matchReceiptCombinations,
  computePartnerBalances,
  computeAccountBalances,
  computeCreditorBalances,
  matchesCreditor,
  accountRefFromText,
  numberMatchStrength,
  AUTO_THRESHOLD,
  SUGGEST_THRESHOLD,
} from '../reconcile';

describe('Kreditoren', () => {
  it('matchesCreditor erkennt den Anbieter über den Marken-Token', () => {
    expect(matchesCreditor('Google Ireland Limited', ['Google'])).toBe(true);
    expect(matchesCreditor('AMAZON PAYMENTS EUROPE S.C.A.', ['Amazon'])).toBe(true);
    expect(matchesCreditor('Meta Platforms Ireland Limited', ['Meta Platforms'])).toBe(true);
    expect(matchesCreditor('Adobe Systems', ['Google'])).toBe(false);
    expect(matchesCreditor(null, ['Google'])).toBe(false);
  });

  it('computeCreditorBalances bildet Aufwand − Zahlungen je Kreditor', () => {
    const bal = computeCreditorBalances(
      ['Google'],
      [
        { name: 'Google Ireland Limited', cents: 50000 },
        { name: 'Google Ireland Limited', cents: 30000 },
      ],
      [{ name: 'Google', cents: 66806 }],
    );
    expect(bal).toHaveLength(1);
    expect(bal[0]).toMatchObject({
      name: 'Google',
      invoicesSumCents: 66806,
      paymentsSumCents: 80000,
      balanceCents: 66806 - 80000,
    });
  });
});

describe('accountRefFromText (Google Ads Konto-ID)', () => {
  it('extracts the customer id from an ADWORDS purpose', () => {
    expect(accountRefFromText('ADWORDS:1543924365:GG104H1HUM')).toBe('1543924365');
    expect(accountRefFromText('ADWORDS:6179976554:GG104H3UC1')).toBe('6179976554');
  });
  it('returns null for non-Google purposes', () => {
    expect(accountRefFromText('AMZN Mktp DE 4DQKA4IME85XVJ9S')).toBeNull();
    expect(accountRefFromText(null)).toBeNull();
  });
});

describe('computeAccountBalances', () => {
  it('pairs Google payments and invoices by account id and compares sums', () => {
    const payments = [
      { ref: '1543924365', name: 'Google Ireland Limited', cents: 50000 },
      { ref: '1543924365', name: 'Google Ireland Limited', cents: 6305 },
      { ref: '1543924365', name: 'Google Ireland Limited', cents: 50000 },
    ];
    const docs = [
      { ref: '1543924365', name: 'Google', cents: 66806 },
      { ref: '1543924365', name: 'Google', cents: 39499 },
    ];
    const bal = computeAccountBalances(payments, docs);
    expect(bal).toHaveLength(1);
    expect(bal[0]).toMatchObject({
      ref: '1543924365',
      paymentsCount: 3,
      paymentsSumCents: 106305,
      docsCount: 2,
      docsSumCents: 106305,
      kind: 'match',
    });
  });
  it('only pairs accounts present on BOTH sides', () => {
    const bal = computeAccountBalances(
      [{ ref: '6179976554', name: 'Google', cents: 30000 }],
      [{ ref: '1543924365', name: 'Google', cents: 30000 }],
    );
    expect(bal).toHaveLength(0);
  });
});

describe('matchReceiptCombinations', () => {
  it('matches several Amazon receipts summing to one debit', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'Amazon EU', bruttoCents: 1000 },
      { id: 'r2', datum: '2024-03-05', haendler: 'Amazon EU', bruttoCents: 2000 },
      { id: 'r3', datum: '2024-03-05', haendler: 'Amazon EU', bruttoCents: 4000 },
    ];
    const txs = [
      { id: 't1', datum: '2024-03-06', gegen: 'AMAZON PAYMENTS', zweck: 'Bestellung', betragCents: -3000 },
    ];
    const combos = matchReceiptCombinations(receipts, txs);
    expect(combos).toHaveLength(1);
    expect(combos[0]!.receiptIds.sort()).toEqual(['r1', 'r2']);
    expect(combos[0]!.totalCents).toBe(3000);
  });

  it('returns nothing when no receipt subset sums to the payment', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'Amazon', bruttoCents: 1000 },
      { id: 'r2', datum: '2024-03-05', haendler: 'Amazon', bruttoCents: 2000 },
    ];
    const txs = [
      { id: 't1', datum: '2024-03-06', gegen: 'Amazon', zweck: '', betragCents: -5000 },
    ];
    expect(matchReceiptCombinations(receipts, txs)).toHaveLength(0);
  });
});

describe('computePartnerBalances', () => {
  it('groups round Google payments and invoices whose SUM matches', () => {
    const payments = [
      { name: 'Google Ireland Ltd', cents: 50000 },
      { name: 'GOOGLE ADS', cents: 50000 },
      { name: 'Google Ireland Ltd', cents: 30000 },
    ];
    const docs = [
      { name: 'Google', cents: 70000 },
      { name: 'Google', cents: 59000 },
    ];
    const bal = computePartnerBalances(payments, docs, 'ausgabe');
    expect(bal).toHaveLength(1);
    expect(bal[0]).toMatchObject({
      paymentsCount: 3,
      paymentsSumCents: 130000,
      docsCount: 2,
      docsSumCents: 129000,
      kind: 'match',
    });
  });

  it('flags a likely missing invoice when payments exceed invoices', () => {
    const payments = [
      { name: 'Google Ireland Ltd', cents: 50000 },
      { name: 'Google Ireland Ltd', cents: 50000 },
    ];
    const bal = computePartnerBalances(payments, [], 'ausgabe');
    expect(bal).toHaveLength(1);
    expect(bal[0]!.kind).toBe('missing_doc');
    expect(bal[0]!.diffCents).toBe(100000);
  });

  it('flags a likely missing payment when invoices exceed payments', () => {
    const docs = [
      { name: 'Meta Platforms', cents: 20000 },
      { name: 'Meta', cents: 25000 },
    ];
    const bal = computePartnerBalances([], docs, 'ausgabe');
    expect(bal[0]!.kind).toBe('missing_payment');
  });

  it('ignores a lone matched-looking partner (single payment, no doc)', () => {
    const bal = computePartnerBalances(
      [{ name: 'Einmalig GmbH', cents: 5000 }],
      [],
      'ausgabe',
    );
    expect(bal).toHaveLength(0);
  });
});

describe('numberMatchStrength', () => {
  it('strong when the full number (incl. letters) is in the purpose', () => {
    expect(numberMatchStrength('RE-2026-1', 'Zahlung RE 2026/1 danke')).toBe(
      'strong',
    );
    expect(numberMatchStrength('RE-2026-1', 'EREF+RE20261 SVWZ+Rechnung')).toBe(
      'strong',
    );
  });

  it('weak when only the digit groups line up (reformatted separators)', () => {
    // No "RE" in the purpose, but the digit groups 2026 then 1 appear in order.
    expect(numberMatchStrength('RE-2026-1', 'Rechnung 2026 1 Zahlung')).toBe(
      'weak',
    );
    // Purpose merged the number's groups into one run, letters dropped.
    expect(numberMatchStrength('RG-2026/0042', 'Ueberweisung 20260042')).toBe(
      'weak',
    );
  });

  it('does not match a bare year or a short counter (false friends)', () => {
    expect(numberMatchStrength('2026', 'Miete 2026 Januar')).toBe('none');
    expect(numberMatchStrength('RE-7', 'Zahlung 7 Stueck')).toBe('none');
  });

  it('does not match digits hidden inside a longer run (IBAN/amount)', () => {
    // 20261 must not be found inside a longer digit block.
    expect(numberMatchStrength('RE-20261', 'DE12 3456 7890 1202610')).toBe(
      'none',
    );
  });
});

describe('matchPaymentsToInvoices', () => {
  it('auto-matches on invoice number in purpose + exact amount', () => {
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'Kunde AG', zweck: 'Zahlung RE-2024-005', betragCents: 119000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-2024-005', grossCents: 119000, issueDate: '2024-03-01', kunde: 'Kunde AG' },
      { id: 'i2', number: 'RE-2024-006', grossCents: 50000, issueDate: '2024-03-02', kunde: 'Andere GmbH' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 't1', rightId: 'i1' });
    expect(matches[0]!.score).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(matches[0]!.auto).toBe(true);
  });

  it('assigns each side only once (greedy)', () => {
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'Kunde AG', zweck: 'RE-1', betragCents: 10000 },
      { id: 't2', datum: '2024-03-10', gegen: 'Kunde AG', zweck: 'RE-1', betragCents: 10000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-1', grossCents: 10000, issueDate: '2024-03-01', kunde: 'Kunde AG' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices);
    expect(matches).toHaveLength(1);
  });

  it('ignores outgoing transactions as payments', () => {
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'x', zweck: 'RE-1', betragCents: -10000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-1', grossCents: 10000, issueDate: '2024-03-01', kunde: 'x' },
    ];
    expect(matchPaymentsToInvoices(payments, invoices)).toHaveLength(0);
  });

  it('suggests a reformatted invoice number (digits only) but does not auto-book', () => {
    const payments = [
      // Bank dropped the "RE" and reformatted the separators.
      { id: 't1', datum: '2024-03-10', gegen: 'Fremd XY', zweck: 'Ueberweisung 2024 5', betragCents: 119000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-2024-5', grossCents: 119000, issueDate: '2024-03-08', kunde: 'Kunde AG' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(SUGGEST_THRESHOLD);
    // Digit-only correspondence must not auto-book on its own.
    expect(matches[0]!.auto).toBe(false);
  });

  it('matches on the external transaction number when the invoice number is absent', () => {
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'Kunde AG', zweck: 'PayPal Zahlung ORD-77KX', betragCents: 119000 },
    ];
    const invoices = [
      {
        id: 'i1',
        number: 'RE-2024-5',
        grossCents: 119000,
        issueDate: '2024-03-08',
        kunde: 'Kunde AG',
        paymentRef: 'ORD-77KX',
      },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 't1', rightId: 'i1' });
    expect(matches[0]!.score).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
  });

  it('auto-matches via a learned counterparty IBAN even without a number in the purpose', () => {
    const ibanClientId = new Map([['DE02120300000000202051', 'client-1']]);
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'ACME I.G.', zweck: 'Zahlung', betragCents: 119000, gegenIban: 'DE02120300000000202051' },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-2024-5', grossCents: 119000, issueDate: '2024-03-08', kunde: 'Ganz anderer Name', clientId: 'client-1' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices, undefined, ibanClientId);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 't1', rightId: 'i1' });
    expect(matches[0]!.score).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(matches[0]!.auto).toBe(true);
  });

  it('does not use an IBAN mapped to a different client', () => {
    const ibanClientId = new Map([['DE02120300000000202051', 'client-1']]);
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'Fremd XY', zweck: 'Zahlung', betragCents: 119000, gegenIban: 'DE02120300000000202051' },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-2024-5', grossCents: 119000, issueDate: '2024-03-08', kunde: 'Wildfremd', clientId: 'client-2' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices, undefined, ibanClientId);
    // Only amount coincides → not auto (no corroboration).
    expect(matches[0]?.auto ?? false).toBe(false);
  });

  it('a partial debit is suggested but never auto-booked as fully paid', () => {
    const payments = [
      { id: 't1', datum: '2024-03-10', gegen: 'Kunde AG', zweck: 'Anzahlung RE-2024-5', betragCents: 50000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-2024-5', grossCents: 119000, issueDate: '2024-03-08', kunde: 'Kunde AG' },
    ];
    const matches = matchPaymentsToInvoices(payments, invoices);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.auto).toBe(false);
  });
});

describe('matchPaymentCombinations', () => {
  it('matches one payment to a sum of several invoices (same client)', () => {
    const payments = [
      { id: 't1', datum: '2024-03-20', gegen: 'Kunde AG', zweck: 'Sammelzahlung', betragCents: 30000 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-1', grossCents: 10000, issueDate: '2024-03-01', kunde: 'Kunde AG' },
      { id: 'i2', number: 'RE-2', grossCents: 20000, issueDate: '2024-03-02', kunde: 'Kunde AG' },
      { id: 'i3', number: 'RE-3', grossCents: 55000, issueDate: '2024-03-03', kunde: 'Kunde AG' },
    ];
    const combos = matchPaymentCombinations(payments, invoices);
    expect(combos).toHaveLength(1);
    expect(combos[0]!.invoiceIds.sort()).toEqual(['i1', 'i2']);
    expect(combos[0]!.totalCents).toBe(30000);
    expect(combos[0]!.auto).toBe(true);
  });

  it('returns nothing when no subset sums to the payment', () => {
    const payments = [
      { id: 't1', datum: '2024-03-20', gegen: 'Kunde AG', zweck: 'x', betragCents: 12345 },
    ];
    const invoices = [
      { id: 'i1', number: 'RE-1', grossCents: 10000, issueDate: '2024-03-01', kunde: 'Kunde AG' },
      { id: 'i2', number: 'RE-2', grossCents: 20000, issueDate: '2024-03-02', kunde: 'Kunde AG' },
    ];
    expect(matchPaymentCombinations(payments, invoices)).toHaveLength(0);
  });
});

describe('matchInvoiceSplitPayments', () => {
  it('matches one invoice total to several partial payments (same client)', () => {
    const invoices = [
      { id: 'i1', number: 'RE-9', grossCents: 40000, issueDate: '2024-03-01', kunde: 'Raten AG' },
    ];
    const payments = [
      { id: 't1', datum: '2024-03-05', gegen: 'Raten AG', zweck: 'RE-9 Rate 1', betragCents: 10000 },
      { id: 't2', datum: '2024-03-20', gegen: 'Raten AG', zweck: 'RE-9 Rate 2', betragCents: 10000 },
      { id: 't3', datum: '2024-04-05', gegen: 'Raten AG', zweck: 'RE-9 Rate 3', betragCents: 10000 },
      { id: 't4', datum: '2024-04-20', gegen: 'Raten AG', zweck: 'RE-9 Rate 4', betragCents: 10000 },
    ];
    const splits = matchInvoiceSplitPayments(payments, invoices);
    expect(splits).toHaveLength(1);
    expect(splits[0]!.invoiceId).toBe('i1');
    expect(splits[0]!.txIds.sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(splits[0]!.paidCents).toBe(40000);
    // Suggest-only – never auto-applied.
    expect(splits[0]!.auto).toBe(false);
  });

  it('does not match unrelated payments that happen to sum up', () => {
    const invoices = [
      { id: 'i1', number: 'RE-9', grossCents: 30000, issueDate: '2024-03-01', kunde: 'Raten AG' },
    ];
    const payments = [
      { id: 't1', datum: '2024-03-05', gegen: 'Fremd GmbH', zweck: '', betragCents: 10000 },
      { id: 't2', datum: '2024-03-06', gegen: 'Anders KG', zweck: '', betragCents: 20000 },
    ];
    expect(matchInvoiceSplitPayments(payments, invoices)).toHaveLength(0);
  });

  it('ignores a single payment that already equals the invoice (1:1, not a split)', () => {
    const invoices = [
      { id: 'i1', number: 'RE-9', grossCents: 10000, issueDate: '2024-03-01', kunde: 'Raten AG' },
    ];
    const payments = [
      { id: 't1', datum: '2024-03-05', gegen: 'Raten AG', zweck: 'RE-9', betragCents: 10000 },
    ];
    expect(matchInvoiceSplitPayments(payments, invoices)).toHaveLength(0);
  });
});

describe('matchReceiptsToTransactions', () => {
  it('matches on close amount + near date', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'ACME GmbH', bruttoCents: 11900 },
    ];
    const outgoing = [
      { id: 't1', datum: '2024-03-06', gegen: 'ACME GmbH', zweck: 'Rechnung', betragCents: -11900 },
      { id: 't2', datum: '2024-03-06', gegen: 'Other', zweck: '', betragCents: -5000 },
    ];
    const matches = matchReceiptsToTransactions(receipts, outgoing);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 'r1', rightId: 't1' });
    expect(matches[0]!.auto).toBe(true);
  });

  it('does not match when amounts differ too much', () => {
    const receipts = [{ id: 'r1', datum: '2024-03-05', haendler: 'x', bruttoCents: 10000 }];
    const outgoing = [
      { id: 't1', datum: '2024-03-05', gegen: 'x', zweck: '', betragCents: -20000 },
    ];
    expect(matchReceiptsToTransactions(receipts, outgoing)).toHaveLength(0);
  });

  it('matches a merchant paid via an intermediary (PayPal → Meta in purpose)', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'Meta Platforms Ireland', bruttoCents: 5000 },
    ];
    const outgoing = [
      { id: 't1', datum: '2024-03-06', gegen: 'PayPal Europe Sarl', zweck: 'PP.4711 Meta Platforms', betragCents: -5000 },
    ];
    const matches = matchReceiptsToTransactions(receipts, outgoing);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 'r1', rightId: 't1' });
  });

  it('matches a foreign-currency receipt whose bank amount differs by the FX rate', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'Voiceflow', bruttoCents: 5000, waehrung: 'USD', rechnungsnummer: 'VF-99' },
    ];
    const outgoing = [
      // 46 € debited for a 50 USD invoice; number in the purpose corroborates.
      { id: 't1', datum: '2024-03-06', gegen: 'Kreditkartenabrechnung', zweck: 'VF-99', betragCents: -4600 },
    ];
    const matches = matchReceiptsToTransactions(receipts, outgoing);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ leftId: 'r1', rightId: 't1' });
  });

  it('does NOT match a foreign-currency receipt on the FX-wide amount alone', () => {
    const receipts = [
      { id: 'r1', datum: '2024-03-05', haendler: 'Voiceflow', bruttoCents: 5000, waehrung: 'USD' },
    ];
    const outgoing = [
      { id: 't1', datum: '2024-03-06', gegen: 'Fremd', zweck: '', betragCents: -4600 },
    ];
    expect(matchReceiptsToTransactions(receipts, outgoing)).toHaveLength(0);
  });
});

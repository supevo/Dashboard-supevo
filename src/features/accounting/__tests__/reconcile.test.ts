import { describe, it, expect } from 'vitest';
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  matchPaymentCombinations,
  matchInvoiceSplitPayments,
  numberMatchStrength,
  AUTO_THRESHOLD,
  SUGGEST_THRESHOLD,
} from '../reconcile';

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
});

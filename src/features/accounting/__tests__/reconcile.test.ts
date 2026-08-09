import { describe, it, expect } from 'vitest';
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  matchPaymentCombinations,
  AUTO_THRESHOLD,
} from '../reconcile';

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

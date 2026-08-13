import { describe, it, expect } from 'vitest';
import {
  findDuplicateGroups,
  duplicateReceiptIds,
  type DupReceipt,
} from '@/features/accounting/receipt-duplicates';

function r(over: Partial<DupReceipt> & { id: string }): DupReceipt {
  return {
    kind: 'ausgabe',
    brutto_cents: null,
    beleg_datum: null,
    haendler: null,
    rechnungsnummer: null,
    ...over,
  };
}

describe('findDuplicateGroups', () => {
  it('findet Dublette über gleiche Rechnungsnummer', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a', rechnungsnummer: 'RE-100', haendler: 'ACME' }),
      r({ id: 'b', rechnungsnummer: 're 100', haendler: 'Anders' }),
      r({ id: 'c', rechnungsnummer: 'RE-999' }),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('findet Dublette über Betrag + Datum + Händler', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a', brutto_cents: 11900, beleg_datum: '2026-03-04', haendler: 'ACME GmbH' }),
      r({ id: 'b', brutto_cents: 11900, beleg_datum: '2026-03-04', haendler: 'ACME gmbh' }),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('trennt gleiche Beträge in verschiedenen Monaten (kein Fehlalarm)', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a', brutto_cents: 4990, beleg_datum: '2026-01-05', haendler: 'Hosting AG' }),
      r({ id: 'b', brutto_cents: 4990, beleg_datum: '2026-02-05', haendler: 'Hosting AG' }),
      r({ id: 'c', brutto_cents: 4990, beleg_datum: '2026-03-05', haendler: 'Hosting AG' }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('trennt Einnahme und Ausgabe (unterschiedliche Art)', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a', kind: 'ausgabe', rechnungsnummer: 'X-1' }),
      r({ id: 'b', kind: 'einnahme', rechnungsnummer: 'X-1' }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('gruppiert transitiv (A≡B über Nr., B≡C über Betrag)', () => {
    const groups = findDuplicateGroups([
      r({ id: 'a', rechnungsnummer: 'RE-1', brutto_cents: 5000, beleg_datum: '2026-03-01', haendler: 'X' }),
      r({ id: 'b', rechnungsnummer: 'RE-1', brutto_cents: 5000, beleg_datum: '2026-03-01', haendler: 'X' }),
      r({ id: 'c', brutto_cents: 5000, beleg_datum: '2026-03-01', haendler: 'X' }),
    ]);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]!.sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignoriert Belege ohne Betrag/Nummer (nicht ausgelesen)', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a' }),
      r({ id: 'b' }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('braucht einen Händler für den Betrag+Datum-Treffer', () => {
    const ids = duplicateReceiptIds([
      r({ id: 'a', brutto_cents: 5000, beleg_datum: '2026-03-01' }),
      r({ id: 'b', brutto_cents: 5000, beleg_datum: '2026-03-01' }),
    ]);
    expect(ids.size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { categorizeTransaction } from '../categorize';
import { KATEGORIEN } from '../categories';

const ids = new Set(KATEGORIEN.map((k) => k.id));

describe('categorizeTransaction', () => {
  it('always returns a known category id', () => {
    const g = categorizeTransaction({ gegen: 'x', zweck: 'y', betragCents: -100 });
    expect(g).not.toBeNull();
    expect(ids.has(g!.kategorieId)).toBe(true);
  });

  it('matches clear rules with high confidence', () => {
    expect(
      categorizeTransaction({ gegen: 'Finanzamt Berlin', zweck: 'Umsatzsteuer', betragCents: -50000 }),
    ).toMatchObject({ kategorieId: 'ust_zahlung', konfidenz: 0.9 });

    expect(
      categorizeTransaction({ gegen: 'AOK Nordost', zweck: 'Beitrag', betragCents: -80000 }),
    ).toMatchObject({ kategorieId: 'sozialversicherung' });

    expect(
      categorizeTransaction({ gegen: 'Hausverwaltung Müller', zweck: 'Miete März', betragCents: -120000 }),
    ).toMatchObject({ kategorieId: 'raumkosten' });

    expect(
      categorizeTransaction({ gegen: 'Google Ireland', zweck: 'Google Workspace', betragCents: -1190 }),
    ).toMatchObject({ kategorieId: 'software_lizenzen' });
  });

  it('does not apply out-only rules to incoming money', () => {
    const g = categorizeTransaction({ gegen: 'Kunde AG', zweck: 'Zahlung RE-5', betragCents: 119000 });
    expect(g?.kategorieId).toBe('umsatz_19');
    expect(g?.konfidenz).toBe(0.4);
  });

  it('falls back to sonstige_ausgaben for unknown outgoing', () => {
    expect(
      categorizeTransaction({ gegen: 'Unbekannt', zweck: 'irgendwas', betragCents: -4200 }),
    ).toMatchObject({ kategorieId: 'sonstige_ausgaben', konfidenz: 0.4 });
  });
});

import { describe, it, expect } from 'vitest';
import { parseBinIcs, binKeyFromSummary } from '@/features/bins/ics';

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260820
SUMMARY:Restabfalltonne
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260901
SUMMARY:Biotonne
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260828
SUMMARY:Gelbe Tonne
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260911
SUMMARY:Blaue Tonne
END:VEVENT
END:VCALENDAR`;

describe('binKeyFromSummary', () => {
  it('mappt die EVS-Tonnennamen', () => {
    expect(binKeyFromSummary('Restabfalltonne')).toBe('rest');
    expect(binKeyFromSummary('Biotonne')).toBe('bio');
    expect(binKeyFromSummary('Gelbe Tonne')).toBe('gelb');
    expect(binKeyFromSummary('Blaue Tonne')).toBe('blau');
    expect(binKeyFromSummary('Papiertonne')).toBe('blau');
    expect(binKeyFromSummary('Sondermüll')).toBe('other');
  });
});

describe('parseBinIcs', () => {
  it('parst Termine, mappt Tonnen und sortiert nach Datum', () => {
    const out = parseBinIcs(SAMPLE);
    expect(out).toEqual([
      { binKey: 'rest', binLabel: 'Restabfalltonne', date: '2026-08-20' },
      { binKey: 'gelb', binLabel: 'Gelbe Tonne', date: '2026-08-28' },
      { binKey: 'bio', binLabel: 'Biotonne', date: '2026-09-01' },
      { binKey: 'blau', binLabel: 'Blaue Tonne', date: '2026-09-11' },
    ]);
  });

  it('dedupliziert gleiche Tonne+Datum und ignoriert Kaputtes', () => {
    const out = parseBinIcs(`${SAMPLE}\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260820\nSUMMARY:Restabfalltonne\nEND:VEVENT`);
    expect(out.filter((p) => p.binKey === 'rest' && p.date === '2026-08-20')).toHaveLength(1);
  });
});

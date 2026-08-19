/** Ein geparster Abfuhrtermin aus der ICS. */
export interface BinPickup {
  binKey: string; // 'rest' | 'bio' | 'gelb' | 'blau' | 'other'
  binLabel: string; // Original-SUMMARY
  date: string; // 'YYYY-MM-DD'
}

/** SUMMARY → normalisierter Tonnen-Schlüssel (robust über Stichwörter). */
export function binKeyFromSummary(summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes('rest')) return 'rest';
  if (s.includes('bio')) return 'bio';
  if (s.includes('gelb') || s.includes('gelber sack') || s.includes('verpack'))
    return 'gelb';
  if (s.includes('blau') || s.includes('papier') || s.includes('pappe'))
    return 'blau';
  return 'other';
}

/** Anzeigelabel je Schlüssel (mit Emoji). */
export function binDisplayLabel(binKey: string, fallback: string): string {
  switch (binKey) {
    case 'rest':
      return '⚫ Restabfalltonne';
    case 'bio':
      return '🟢 Biotonne';
    case 'gelb':
      return '🟡 Gelbe Tonne';
    case 'blau':
      return '🔵 Blaue Tonne';
    default:
      return fallback;
  }
}

function toIsoDate(raw: string): string | null {
  // 'YYYYMMDD' → 'YYYY-MM-DD'
  const m = raw.trim().match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Parst eine ICS-Datei (Müllabfuhr) in Abfuhrtermine. Robust gegenüber
 * Zeilenfaltung und unterschiedlichen DTSTART-Formaten. Termine ohne erkennbares
 * Datum werden übersprungen. Ergebnis ist nach Datum sortiert und dedupliziert.
 */
export function parseBinIcs(text: string): BinPickup[] {
  // Zeilenfaltung auflösen (RFC 5545: Folgezeile beginnt mit Space/Tab).
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const out: BinPickup[] = [];
  const seen = new Set<string>();
  let inEvent = false;
  let date: string | null = null;
  let summary: string | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      date = null;
      summary = null;
      continue;
    }
    if (upper.startsWith('END:VEVENT')) {
      if (date && summary) {
        const binKey = binKeyFromSummary(summary);
        const key = `${binKey}:${date}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ binKey, binLabel: summary.trim(), date });
        }
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (upper.startsWith('DTSTART')) {
      const value = line.slice(line.lastIndexOf(':') + 1);
      date = toIsoDate(value);
    } else if (upper.startsWith('SUMMARY')) {
      summary = line.slice(line.indexOf(':') + 1).trim();
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

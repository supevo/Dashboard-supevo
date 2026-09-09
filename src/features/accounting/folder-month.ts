/**
 * Leitet aus einem OneDrive-Ordnerpfad den Belegmonat ab. Die Steuerberater-
 * Ordner sind nach Jahr/Monat sortiert, z. B. „…/2026/08. August". Erkannt wird
 * das Jahr (4-stellig, 20xx) und der Monat – entweder als führende Zahl
 * („08.", „8 ") oder als deutscher Monatsname. Rückgabe: YYYY-MM-01, oder null,
 * wenn Jahr oder Monat nicht eindeutig sind.
 */
const MONTH_NAMES: [string, number][] = [
  ['januar', 1],
  ['februar', 2],
  ['märz', 3],
  ['maerz', 3],
  ['april', 4],
  ['mai', 5],
  ['juni', 6],
  ['juli', 7],
  ['august', 8],
  ['september', 9],
  ['oktober', 10],
  ['november', 11],
  ['dezember', 12],
];

export function folderMonthDate(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const segments = path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  let year: number | null = null;
  let month: number | null = null;

  for (const seg of segments) {
    // Jahr: eigenständige 4-stellige Zahl 2000–2099.
    const y = seg.match(/\b(20\d{2})\b/);
    if (y) year = Number(y[1]);

    // Monat 1: führende Zahl wie „08.", „8 ", „08_", „8-".
    const mNum = seg.match(/^\s*(\d{1,2})[.\s_-]/);
    if (mNum) {
      const n = Number(mNum[1]);
      if (n >= 1 && n <= 12) month = n;
    }

    // Monat 2 (Fallback): deutscher Monatsname im Segment.
    if (month == null) {
      const low = seg.toLowerCase();
      for (const [name, n] of MONTH_NAMES) {
        if (low.includes(name)) {
          month = n;
          break;
        }
      }
    }
  }

  if (!year || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Nur das Jahr aus einem Ordnerpfad (4-stellig, 20xx), unabhängig vom Monat.
 * Für den Import-Jahresfilter (z. B. „erst ab 2026"). Null, wenn kein Jahr
 * im Pfad steht.
 */
export function folderYear(path: string | null | undefined): number | null {
  if (!path) return null;
  const m = path.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

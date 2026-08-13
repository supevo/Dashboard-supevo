/**
 * Inhaltliche Dubletten-Erkennung für Belege (rein, testbar). Der OneDrive-Import
 * entdoppelt bereits über die Datei-ID; hier geht es um denselben Beleg als
 * ZWEI verschiedene Dateien (zweimal gescannt, oder per Upload UND aus OneDrive).
 *
 * Zwei Belege gelten als mögliche Dublette, wenn – bei gleicher Art (Einnahme/
 * Ausgabe) – entweder dieselbe Rechnungsnummer ODER dieselbe Kombination aus
 * Bruttobetrag + Belegdatum + (normalisiertem) Händler vorliegt. Bewusst nur ein
 * HINWEIS, nie automatisches Löschen – GoBD verlangt Nachvollziehbarkeit.
 */

export interface DupReceipt {
  id: string;
  kind: string;
  brutto_cents: number | null;
  beleg_datum: string | null;
  haendler: string | null;
  rechnungsnummer: string | null;
}

const LEGAL_FORMS = /\b(gmbh|ug|ag|kg|ohg|gbr|e\.?k\.?|mbh|co|ltd|inc|e\.?v\.?)\b/gi;

function normHaendler(s: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();
}

function normNummer(s: string | null): string {
  return (s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Groups receipts into duplicate clusters. Returns only clusters with ≥ 2
 * members, keyed by a stable signature. A receipt can join via its invoice
 * number or via amount+date+merchant; both keys feed the SAME union so a chain
 * (A≡B by number, B≡C by amount) ends up in one group.
 */
export function findDuplicateGroups(receipts: DupReceipt[]): Map<string, string[]> {
  // Union-Find über die Belege, damit transitive Dubletten in einer Gruppe landen.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };
  for (const r of receipts) parent.set(r.id, r.id);

  const byNumber = new Map<string, string>();
  const byAmount = new Map<string, string>();
  for (const r of receipts) {
    const num = normNummer(r.rechnungsnummer);
    if (num.length >= 3) {
      const key = `${r.kind}|n|${num}`;
      const prev = byNumber.get(key);
      if (prev) union(prev, r.id);
      else byNumber.set(key, r.id);
    }
    if (r.brutto_cents != null && r.beleg_datum) {
      const h = normHaendler(r.haendler);
      // Ohne Händler kein Amount+Datum-Treffer – zu unspezifisch.
      if (h) {
        const key = `${r.kind}|a|${r.brutto_cents}|${r.beleg_datum.slice(0, 10)}|${h}`;
        const prev = byAmount.get(key);
        if (prev) union(prev, r.id);
        else byAmount.set(key, r.id);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const r of receipts) {
    const root = find(r.id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(r.id);
  }
  const result = new Map<string, string[]>();
  for (const [root, ids] of groups) {
    if (ids.length >= 2) result.set(root, ids);
  }
  return result;
}

/** Convenience: the set of receipt ids that are part of any duplicate cluster. */
export function duplicateReceiptIds(receipts: DupReceipt[]): Set<string> {
  const ids = new Set<string>();
  for (const group of findDuplicateGroups(receipts).values()) {
    for (const id of group) ids.add(id);
  }
  return ids;
}

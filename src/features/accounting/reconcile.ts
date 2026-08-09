/**
 * Abgleich (reine, testbare Logik). Zwei Richtungen:
 *  1. Zahlungen (Bankeingänge) ↔ Ausgangsrechnungen
 *  2. Belege (Ausgaben) ↔ Bankausgänge
 *
 * Regeln zuerst, gewichtet: Rechnungsnummer im Verwendungszweck (stärkstes
 * Signal), Betrag (exakt / Skonto bis 3,5 % / Rundung / Teilzahlung),
 * Zeitfenster, Namensähnlichkeit (rechtsformbereinigt). Nur Vorschläge ≥ 0.55,
 * automatische Übernahme ab 0.85. Greedy: jede Seite nur einmal.
 */

export const SUGGEST_THRESHOLD = 0.55;
export const AUTO_THRESHOLD = 0.85;

export interface TxLite {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betragCents: number;
}
export interface InvoiceLite {
  id: string;
  number: string | null;
  grossCents: number;
  issueDate: string | null;
  kunde: string | null;
}
export interface ReceiptLite {
  id: string;
  datum: string | null;
  haendler: string | null;
  bruttoCents: number | null;
}

export interface Match {
  leftId: string;
  rightId: string;
  score: number;
  reason: string;
  auto: boolean;
}

const LEGAL_FORMS = /\b(gmbh|ug|ag|kg|ohg|gbr|e\.?k\.?|mbh|co|ltd|inc|e\.?v\.?)\b/gi;

function normName(s: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^a-z0-9äöüß ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over word tokens (0..1). */
function nameSimilarity(a: string | null, b: string | null): number {
  const ta = new Set(normName(a).split(' ').filter((t) => t.length > 2));
  const tb = new Set(normName(b).split(' ').filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return (2 * inter) / (ta.size + tb.size);
}

/** True if the (normalized) invoice number appears in the purpose text. */
function numberInPurpose(number: string | null, zweck: string | null): boolean {
  if (!number || !zweck) return false;
  const n = number.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (n.length < 3) return false;
  const z = zweck.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return z.includes(n);
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86_400_000;
}

/** Amount score for a payment vs. an invoice gross (0..0.3). */
function amountScore(paidCents: number, grossCents: number): number {
  if (grossCents <= 0) return 0;
  const diff = paidCents - grossCents;
  if (diff === 0) return 0.3; // exact
  if (Math.abs(diff) <= 2) return 0.28; // rounding
  if (diff < 0 && -diff <= grossCents * 0.035) return 0.24; // Skonto ≤ 3,5 %
  if (diff < 0 && paidCents >= grossCents * 0.1) return 0.12; // partial payment
  return 0;
}

/** Scores one payment↔invoice pair; returns null below the suggest threshold. */
function scorePaymentInvoice(tx: TxLite, inv: InvoiceLite): Match | null {
  let s = 0;
  const reasons: string[] = [];

  if (numberInPurpose(inv.number, tx.zweck)) {
    s += 0.6;
    reasons.push('Rechnungsnummer im Zweck');
  }
  const amt = amountScore(tx.betragCents, inv.grossCents);
  if (amt > 0) {
    s += amt;
    reasons.push(amt >= 0.3 ? 'Betrag exakt' : 'Betrag passend');
  }
  if (inv.issueDate && daysBetween(tx.datum, inv.issueDate) <= 90) {
    s += 0.1;
    reasons.push('Zeitfenster');
  }
  const sim = nameSimilarity(tx.gegen, inv.kunde);
  if (sim > 0.3) {
    s += 0.1 * sim;
    reasons.push('Name ähnlich');
  }

  s = Math.min(1, s);
  if (s < SUGGEST_THRESHOLD) return null;
  return {
    leftId: tx.id,
    rightId: inv.id,
    score: Math.round(s * 100) / 100,
    reason: reasons.join(', '),
    auto: s >= AUTO_THRESHOLD,
  };
}

/** Greedy assignment: highest score first, each side used once. */
function greedy(candidates: Match[]): Match[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const out: Match[] = [];
  for (const m of sorted) {
    if (usedLeft.has(m.leftId) || usedRight.has(m.rightId)) continue;
    usedLeft.add(m.leftId);
    usedRight.add(m.rightId);
    out.push(m);
  }
  return out;
}

/** Matches incoming payments to unpaid invoices (leftId=tx, rightId=invoice). */
export function matchPaymentsToInvoices(
  payments: TxLite[],
  invoices: InvoiceLite[],
): Match[] {
  const candidates: Match[] = [];
  for (const tx of payments) {
    if (tx.betragCents <= 0) continue;
    for (const inv of invoices) {
      const m = scorePaymentInvoice(tx, inv);
      if (m) candidates.push(m);
    }
  }
  return greedy(candidates);
}

/** Scores one receipt↔outgoing-transaction pair (amount AND date matter). */
function scoreReceiptTx(rec: ReceiptLite, tx: TxLite): Match | null {
  if (rec.bruttoCents == null || rec.bruttoCents <= 0) return null;
  const outCents = Math.abs(tx.betragCents);
  let s = 0;
  const reasons: string[] = [];

  const diff = Math.abs(outCents - rec.bruttoCents);
  if (diff === 0) {
    s += 0.55;
    reasons.push('Betrag exakt');
  } else if (diff <= 2) {
    s += 0.45;
    reasons.push('Betrag ~gerundet');
  } else if (diff <= rec.bruttoCents * 0.02) {
    s += 0.3;
    reasons.push('Betrag nahe');
  } else {
    return null; // amount must be close for receipts
  }

  if (rec.datum) {
    const d = daysBetween(tx.datum, rec.datum);
    if (d <= 3) {
      s += 0.3;
      reasons.push('Datum ±3 Tage');
    } else if (d <= 14) {
      s += 0.2;
      reasons.push('Datum ±14 Tage');
    } else if (d <= 45) {
      s += 0.1;
      reasons.push('Datum ±45 Tage');
    }
  }

  const sim = nameSimilarity(tx.gegen, rec.haendler);
  if (sim > 0.3) {
    s += 0.1 * sim;
    reasons.push('Händler ähnlich');
  }

  s = Math.min(1, s);
  if (s < SUGGEST_THRESHOLD) return null;
  return {
    leftId: rec.id,
    rightId: tx.id,
    score: Math.round(s * 100) / 100,
    reason: reasons.join(', '),
    auto: s >= AUTO_THRESHOLD,
  };
}

/** Matches receipts to outgoing transactions (leftId=receipt, rightId=tx). */
export function matchReceiptsToTransactions(
  receipts: ReceiptLite[],
  outgoing: TxLite[],
): Match[] {
  const candidates: Match[] = [];
  for (const rec of receipts) {
    for (const tx of outgoing) {
      if (tx.betragCents >= 0) continue;
      const m = scoreReceiptTx(rec, tx);
      if (m) candidates.push(m);
    }
  }
  return greedy(candidates);
}

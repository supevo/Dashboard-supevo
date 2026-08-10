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

export interface ComboMatch {
  txId: string;
  invoiceIds: string[];
  score: number;
  reason: string;
  paymentCents: number;
  totalCents: number;
  auto: boolean;
}

/** Acceptance + score for a combination of invoices vs. one payment. */
function comboAmountScore(sumCents: number, paidCents: number): number {
  if (sumCents === paidCents) return 0.9;
  if (Math.abs(sumCents - paidCents) <= 2) return 0.88;
  // Skonto: paid a bit less than the invoices' total.
  if (paidCents < sumCents && sumCents - paidCents <= sumCents * 0.035) return 0.82;
  return 0;
}

/**
 * Finds, for one payment, the best combination (2..4) of the candidate invoices
 * whose gross sums to the payment (exact / rounding / Skonto). DFS over a bounded
 * candidate set; returns the subset closest to the target with the fewest items.
 */
function bestCombo(
  paidCents: number,
  candidates: InvoiceLite[],
): { ids: string[]; sum: number } | null {
  const sorted = [...candidates]
    .filter((c) => c.grossCents > 0 && c.grossCents <= paidCents)
    .sort((a, b) => b.grossCents - a.grossCents)
    .slice(0, 12);
  const upper = paidCents * 1.037 + 2;
  const maxK = 4;

  const found: { ids: string[]; sum: number; delta: number }[] = [];
  const chosen: InvoiceLite[] = [];

  function consider(): void {
    if (chosen.length < 2) return;
    const sum = chosen.reduce((s, c) => s + c.grossCents, 0);
    if (comboAmountScore(sum, paidCents) <= 0) return;
    found.push({
      ids: chosen.map((c) => c.id),
      sum,
      delta: Math.abs(sum - paidCents),
    });
  }

  function dfs(start: number, partial: number): void {
    consider();
    if (chosen.length >= maxK) return;
    for (let i = start; i < sorted.length; i += 1) {
      const next = partial + sorted[i]!.grossCents;
      if (next > upper) continue; // prune – too large already
      chosen.push(sorted[i]!);
      dfs(i + 1, next);
      chosen.pop();
    }
  }

  dfs(0, 0);
  if (found.length === 0) return null;
  // Closest sum first, then fewest invoices.
  found.sort((a, b) => a.delta - b.delta || a.ids.length - b.ids.length);
  const best = found[0]!;
  return { ids: best.ids, sum: best.sum };
}

/**
 * Matches incoming payments to a COMBINATION of open invoices (Sammelzahlungen).
 * Candidates per payment are invoices of the same client (name similar) or whose
 * number appears in the purpose. Greedy: each payment and invoice used once.
 */
export function matchPaymentCombinations(
  payments: TxLite[],
  invoices: InvoiceLite[],
): ComboMatch[] {
  const results: ComboMatch[] = [];
  const usedInvoices = new Set<string>();

  // Strongest payments first (larger sums are likelier true collective payments).
  const ordered = [...payments]
    .filter((p) => p.betragCents > 0)
    .sort((a, b) => b.betragCents - a.betragCents);

  for (const pay of ordered) {
    const candidates = invoices.filter((inv) => {
      if (usedInvoices.has(inv.id)) return false;
      const byNumber = numberInPurpose(inv.number, pay.zweck);
      const byName = nameSimilarity(pay.gegen, inv.kunde) > 0.3;
      if (!byNumber && !byName) return false;
      if (inv.issueDate && daysBetween(pay.datum, inv.issueDate) > 120) return false;
      return true;
    });
    if (candidates.length < 2) continue;

    const combo = bestCombo(pay.betragCents, candidates);
    if (!combo) continue;

    const score = comboAmountScore(combo.sum, pay.betragCents);
    if (score <= 0) continue;

    combo.ids.forEach((id) => usedInvoices.add(id));
    results.push({
      txId: pay.id,
      invoiceIds: combo.ids,
      score,
      reason:
        combo.sum === pay.betragCents
          ? `${combo.ids.length} Rechnungen, Summe exakt`
          : `${combo.ids.length} Rechnungen, Summe passend`,
      paymentCents: pay.betragCents,
      totalCents: combo.sum,
      auto: score >= AUTO_THRESHOLD,
    });
  }
  return results;
}

/** Matches receipts to outgoing transactions (leftId=receipt, rightId=tx). */
/**
 * Matches receipts to bank transactions. `sign` selects the direction: 'out'
 * pairs Ausgabe-Belege with outgoing payments, 'in' pairs Einnahme-Belege with
 * incoming payments. Amount is compared on absolute values in scoreReceiptTx.
 */
export function matchReceiptsToTransactions(
  receipts: ReceiptLite[],
  txs: TxLite[],
  sign: 'out' | 'in' = 'out',
): Match[] {
  const candidates: Match[] = [];
  for (const rec of receipts) {
    for (const tx of txs) {
      if (sign === 'out' && tx.betragCents >= 0) continue;
      if (sign === 'in' && tx.betragCents <= 0) continue;
      const m = scoreReceiptTx(rec, tx);
      if (m) candidates.push(m);
    }
  }
  return greedy(candidates);
}

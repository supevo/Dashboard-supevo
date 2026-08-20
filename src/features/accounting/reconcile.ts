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
/** Lower bar for the "erneut abgleichen" pass: surfaces borderline candidates
 *  (35–55 %) so under-80 % bookings get a second, manual chance. */
export const WEAK_THRESHOLD = 0.35;

export interface TxLite {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betragCents: number;
  /** IBAN der Gegenpartei (Zahler), falls im Auszug vorhanden. */
  gegenIban?: string | null;
}
export interface InvoiceLite {
  id: string;
  number: string | null;
  grossCents: number;
  issueDate: string | null;
  kunde: string | null;
  /** Externe Transaktions-/Referenznummer (Stripe, PayPal, Bestellnr. …). */
  paymentRef?: string | null;
  /** Kunde der Rechnung – für den IBAN-Abgleich (gelernte IBAN → Kunde). */
  clientId?: string | null;
}

/**
 * Gelernte Zuordnung „Gegen-IBAN → Kunde", abgeleitet aus früher bestätigten
 * Zahlungen. Eine übereinstimmende IBAN ist ein eindeutiges Signal.
 */
export type IbanClientMap = Map<string, string>;

/** True, wenn die Gegen-IBAN der Zahlung zum Kunden der Rechnung gelernt wurde. */
function ibanMatches(
  tx: TxLite,
  inv: InvoiceLite,
  ibanClientId: IbanClientMap,
): boolean {
  if (!tx.gegenIban || !inv.clientId) return false;
  return ibanClientId.get(tx.gegenIban) === inv.clientId;
}
export interface ReceiptLite {
  id: string;
  datum: string | null;
  haendler: string | null;
  bruttoCents: number | null;
  /** Von der KI ausgelesene Rechnungs-/Belegnummer (falls vorhanden). */
  rechnungsnummer?: string | null;
  /** ISO-Währungscode des Belegs (z. B. "USD"); null/"EUR" = Euro. */
  waehrung?: string | null;
  /** Externe Konto-/Kundennummer (z. B. Google-Ads-Konto-ID). */
  kontoRef?: string | null;
}

export interface Match {
  leftId: string;
  rightId: string;
  score: number;
  reason: string;
  auto: boolean;
  /** Days between the two dates – used to break ties toward the closest match. */
  dist?: number;
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

/**
 * True if a distinctive token of `name` appears in the purpose text. Handles
 * payment intermediaries: paying Meta via PayPal shows gegen="PayPal" while the
 * real merchant ("Meta"/"Facebook") sits in the Verwendungszweck. Tokens must be
 * ≥ 4 chars to stay distinctive.
 */
function nameInPurpose(name: string | null, zweck: string | null): boolean {
  if (!name || !zweck) return false;
  const zt = new Set(
    normName(zweck)
      .split(' ')
      .filter((t) => t.length >= 4),
  );
  if (zt.size === 0) return false;
  return normName(name)
    .split(' ')
    .filter((t) => t.length >= 4)
    .some((t) => zt.has(t));
}

/** Only the alphanumeric characters, lowercased ("RE-2026/1" → "re20261"). */
function alnum(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Sequences of consecutive digits in the string ("RE 2026-1" → ["2026","1"]). */
function digitRuns(s: string | null): string[] {
  return (s ?? '').match(/\d+/g) ?? [];
}

/** True if `needle` occurs as a contiguous block inside `hay` (element-wise). */
function isContiguousSubsequence(needle: string[], hay: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export type NumberMatch = 'strong' | 'weak' | 'none';

/**
 * How strongly an invoice/receipt/transaction number is reflected in a bank
 * purpose text. Bank exports reformat references heavily (different separators,
 * merged or split groups, EREF/KREF blocks), so a plain substring test misses
 * real matches.
 *  - 'strong': the number *including its letters* appears contiguously
 *    ("RE-2026-1" → "…RE20261…"). Distinctive enough to corroborate an automatic
 *    booking.
 *  - 'weak': only the DIGIT part lines up – the digit groups appear in order
 *    (separators reformatted) or merged into one run. A good suggestion, but on
 *    its own not enough to auto-book, because amounts/dates can coincide.
 */
export function numberMatchStrength(
  number: string | null,
  zweck: string | null,
): NumberMatch {
  if (!number || !zweck) return 'none';
  const nFull = alnum(number);
  const zFull = alnum(zweck);
  const hasLetters = /[a-z]/.test(nFull);
  // A number carrying letters (e.g. "RE-…") is distinctive: a contiguous
  // occurrence incl. its letters is a strong signal.
  if (hasLetters && nFull.length >= 3 && zFull.includes(nFull)) return 'strong';

  const nRuns = digitRuns(number);
  const digits = nRuns.join('');
  // Distinctiveness guard against false friends: a bare 4-digit year or a short
  // counter. Require ≥5 digits, or ≥2 separate groups (year + counter), so
  // "2026-1" counts but a lone "2026" does not.
  if (digits.length < 4 || (nRuns.length < 2 && digits.length < 5)) return 'none';

  const zRuns = digitRuns(zweck);
  // Purpose merged the groups into one isolated run ("RE20261" → "20261"), or the
  // number's digit-group sequence appears verbatim (separators reformatted). For
  // a purely numeric number an isolated match is itself strong; for a lettered
  // number the missing letters make it only a (still useful) weak suggestion.
  const digitHit =
    zRuns.includes(digits) || isContiguousSubsequence(nRuns, zRuns);
  if (digitHit) return hasLetters ? 'weak' : 'strong';
  return 'none';
}

const NUMBER_MATCH_RANK: Record<NumberMatch, number> = {
  none: 0,
  weak: 1,
  strong: 2,
};

/** Strongest match across several candidate numbers (invoice no. + payment ref). */
export function bestNumberMatch(
  numbers: (string | null | undefined)[],
  zweck: string | null,
): NumberMatch {
  let best: NumberMatch = 'none';
  for (const n of numbers) {
    const m = numberMatchStrength(n ?? null, zweck);
    if (NUMBER_MATCH_RANK[m] > NUMBER_MATCH_RANK[best]) best = m;
  }
  return best;
}

/** True for any (strong or weak) number correspondence – broadens candidates. */
function numberInPurpose(
  numbers: (string | null | undefined)[] | string | null,
  zweck: string | null,
): boolean {
  const list = Array.isArray(numbers) ? numbers : [numbers];
  return bestNumberMatch(list, zweck) !== 'none';
}

/**
 * Externe Konto-/Kundennummer aus einem Bank-Verwendungszweck – aktuell Google
 * Ads („ADWORDS:1543924365:GG104H1HUM" → „1543924365"). Google-Zahlungen sind
 * Vorauszahlungen und passen nicht 1:1 zu einzelnen Rechnungen; die Konto-ID ist
 * der stabile gemeinsame Parameter.
 */
export function accountRefFromText(text: string | null): string | null {
  if (!text) return null;
  const m = text.toUpperCase().match(/ADWORDS[\s:._-]*([0-9]{6,})/);
  return m ? m[1]! : null;
}

/** Ziffern einer Konto-/Kundennummer (z. B. „154-392-4365" → „1543924365"). */
function accountRefDigits(ref: string | null | undefined): string | null {
  const d = (ref ?? '').replace(/\D/g, '');
  return d.length >= 6 ? d : null;
}

/** True, wenn die Konto-ID im Zweck der Konto-Referenz des Belegs entspricht. */
function accountRefMatches(
  zweck: string | null,
  kontoRef: string | null | undefined,
): boolean {
  const a = accountRefFromText(zweck);
  const b = accountRefDigits(kontoRef);
  return !!a && !!b && a === b;
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

/** Scores one payment↔invoice pair; returns null below `minScore`. */
function scorePaymentInvoice(
  tx: TxLite,
  inv: InvoiceLite,
  minScore = SUGGEST_THRESHOLD,
  ibanClientId: IbanClientMap = new Map(),
): Match | null {
  let s = 0;
  const reasons: string[] = [];

  const ibanHit = ibanMatches(tx, inv, ibanClientId);
  if (ibanHit) {
    s += 0.5;
    reasons.push('Kunden-IBAN stimmt überein');
  }

  const numMatch = bestNumberMatch([inv.number, inv.paymentRef], tx.zweck);
  if (numMatch === 'strong') {
    s += 0.6;
    reasons.push('Rechnungs-/Transaktionsnr. im Zweck');
  } else if (numMatch === 'weak') {
    s += 0.45;
    reasons.push('Rechnungs-/Transaktionsnr. (Ziffern) im Zweck');
  }
  const amt = amountScore(tx.betragCents, inv.grossCents);
  // A full-ish amount (exact / rounding / Skonto) may corroborate an automatic
  // booking; a partial debit (0.12 tier) must stay a suggestion – it must never
  // silently mark an invoice as fully paid.
  const amountFull = amt >= 0.24;
  if (amt > 0) {
    s += amt;
    reasons.push(
      amt >= 0.3 ? 'Betrag exakt' : amountFull ? 'Betrag passend' : 'Teilbetrag',
    );
  }
  // Graduated time proximity: a payment close to the invoice date scores higher
  // than one months apart (so recurring same-amount items pick the right date).
  let dist = Number.POSITIVE_INFINITY;
  if (inv.issueDate) {
    dist = daysBetween(tx.datum, inv.issueDate);
    if (dist <= 7) {
      s += 0.15;
      reasons.push('Zeitfenster ±7 Tage');
    } else if (dist <= 30) {
      s += 0.1;
      reasons.push('Zeitfenster ±30 Tage');
    } else if (dist <= 90) {
      s += 0.05;
      reasons.push('Zeitfenster ±90 Tage');
    }
  }
  const sim = nameSimilarity(tx.gegen, inv.kunde);
  const nameInZweck = nameInPurpose(inv.kunde, tx.zweck);
  if (sim > 0.3) {
    s += 0.1 * sim;
    reasons.push('Name ähnlich');
  } else if (nameInZweck) {
    s += 0.1;
    reasons.push('Kundenname im Zweck');
  }

  s = Math.min(1, s);
  if (s < minScore) return null;
  // Automatisch nur übernehmen, wenn (a) der volle Betrag passt, UND (b) ein
  // eindeutiges Zusatzsignal vorliegt: die vollständige Rechnungsnummer (inkl.
  // Buchstaben) im Zweck, eine übereinstimmende Kunden-IBAN ODER klar gleicher
  // Kunde. Eine nur ziffernweise Übereinstimmung oder ein Teilbetrag bleibt
  // Vorschlag – gegen zufällig gleiche Beträge verschiedener Rechnungen.
  const corroborated =
    numMatch === 'strong' || ibanHit || sim > 0.5 || nameInZweck;
  return {
    leftId: tx.id,
    rightId: inv.id,
    score: Math.round(s * 100) / 100,
    reason: reasons.join(', '),
    auto: s >= AUTO_THRESHOLD && corroborated && amountFull,
    dist,
  };
}

/** Greedy assignment: highest score first, ties broken toward the closest date;
 *  each side used once. */
function greedy(candidates: Match[]): Match[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      b.score - a.score ||
      (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY),
  );
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
  minScore = SUGGEST_THRESHOLD,
  ibanClientId: IbanClientMap = new Map(),
): Match[] {
  const candidates: Match[] = [];
  for (const tx of payments) {
    if (tx.betragCents <= 0) continue;
    for (const inv of invoices) {
      const m = scorePaymentInvoice(tx, inv, minScore, ibanClientId);
      if (m) candidates.push(m);
    }
  }
  return greedy(candidates);
}

/**
 * True if this incoming payment plausibly belongs to an ALREADY-PAID invoice.
 * Such bookings are NOT really unassigned – the invoice is settled – so they are
 * excluded from the „Eingänge ohne Zuordnung" list (otherwise the Abgleich
 * contradicts the Monatsabschluss, which only looks at the invoice status).
 */
export function paymentMatchesPaidInvoice(
  tx: TxLite,
  paidInvoices: InvoiceLite[],
  ibanClientId: IbanClientMap = new Map(),
): boolean {
  if (tx.betragCents <= 0) return false;
  for (const inv of paidInvoices) {
    const num = bestNumberMatch([inv.number, inv.paymentRef], tx.zweck);
    if (num === 'strong') return true;
    if (ibanMatches(tx, inv, ibanClientId)) return true;
    const amountFull = amountScore(tx.betragCents, inv.grossCents) >= 0.24;
    if (!amountFull) continue;
    const nameSig =
      nameSimilarity(tx.gegen, inv.kunde) > 0.5 ||
      nameInPurpose(inv.kunde, tx.zweck);
    if (num !== 'none' || nameSig) return true;
  }
  return false;
}

/** Scores one receipt↔outgoing-transaction pair (amount AND date matter). */
function scoreReceiptTx(
  rec: ReceiptLite,
  tx: TxLite,
  minScore = SUGGEST_THRESHOLD,
): Match | null {
  if (rec.bruttoCents == null || rec.bruttoCents <= 0) return null;
  const outCents = Math.abs(tx.betragCents);
  let s = 0;
  const reasons: string[] = [];

  const isForeign = !!rec.waehrung && rec.waehrung.toUpperCase() !== 'EUR';
  const diff = Math.abs(outCents - rec.bruttoCents);
  if (diff === 0) {
    s += 0.5;
    reasons.push('Betrag exakt');
  } else if (diff <= 2) {
    s += 0.4;
    reasons.push('Betrag ~gerundet');
  } else if (diff <= rec.bruttoCents * 0.02) {
    s += 0.28;
    reasons.push('Betrag nahe');
  } else if (isForeign && diff <= rec.bruttoCents * 0.15) {
    // Fremdwährungsbeleg: der Bankbetrag weicht durch den Wechselkurs ab. Nur
    // ein schwaches Betragssignal – der Treffer braucht Datum + Nummer/Name, um
    // die 55 %-Schwelle zu erreichen (sonst kein Vorschlag).
    s += 0.15;
    reasons.push(`Betrag ~ (${rec.waehrung}-Kurs)`);
  } else {
    return null; // amount must be close for receipts
  }

  let dist = Number.POSITIVE_INFINITY;
  if (rec.datum) {
    dist = daysBetween(tx.datum, rec.datum);
    // A receipt and its bank payment are days–weeks apart, not months. Beyond
    // ~60 days it is not the same payment – don't suggest it at all, so a
    // recurring same-amount booking from an earlier month can't be picked.
    if (dist > 60) return null;
    if (dist <= 3) {
      s += 0.25;
      reasons.push('Datum ±3 Tage');
    } else if (dist <= 14) {
      s += 0.15;
      reasons.push('Datum ±14 Tage');
    } else if (dist <= 45) {
      s += 0.08;
      reasons.push('Datum ±45 Tage');
    } else {
      s += 0.03;
      reasons.push('Datum ±60 Tage');
    }
  }

  // Starkes Zusatzsignal: die Rechnungs-/Belegnummer taucht im Verwendungszweck
  // der Bankbuchung auf (auch ziffernweise, falls die Bank sie umformatiert hat).
  const numMatch = numberMatchStrength(rec.rechnungsnummer ?? null, tx.zweck);
  if (numMatch === 'strong') {
    s += 0.4;
    reasons.push('Rechnungsnr. im Zweck');
  } else if (numMatch === 'weak') {
    s += 0.28;
    reasons.push('Rechnungsnr. (Ziffern) im Zweck');
  }

  const sim = nameSimilarity(tx.gegen, rec.haendler);
  const nameInZweck = nameInPurpose(rec.haendler, tx.zweck);
  if (sim > 0.3) {
    s += 0.15 * sim;
    reasons.push('Händler ähnlich');
  } else if (nameInZweck) {
    // Intermediär (z. B. PayPal): der Händler steht im Verwendungszweck.
    s += 0.15;
    reasons.push('Händlername im Zweck');
  }

  s = Math.min(1, s);
  if (s < minScore) return null;
  // Automatisch nur übernehmen, wenn außer Betrag/Datum ein weiteres Signal
  // passt (vollständige Rechnungsnr. ODER klar gleicher Händler). Sonst nur
  // Vorschlag – damit zufällig gleiche Beträge verschiedener Belege nicht falsch
  // verbucht werden (häufigste Fehlzuordnung).
  const corroborated = numMatch === 'strong' || sim > 0.5 || nameInZweck;
  return {
    leftId: rec.id,
    rightId: tx.id,
    score: Math.round(s * 100) / 100,
    reason: reasons.join(', '),
    auto: s >= AUTO_THRESHOLD && corroborated,
    dist,
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
  ibanClientId: IbanClientMap = new Map(),
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
      const byNumber = numberInPurpose([inv.number, inv.paymentRef], pay.zweck);
      const byName =
        nameSimilarity(pay.gegen, inv.kunde) > 0.3 ||
        nameInPurpose(inv.kunde, pay.zweck);
      const byIban = ibanMatches(pay, inv, ibanClientId);
      if (!byNumber && !byName && !byIban) return false;
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

export interface SplitMatch {
  invoiceId: string;
  txIds: string[];
  score: number;
  reason: string;
  invoiceCents: number;
  paidCents: number;
  auto: boolean;
}

/**
 * Best subset (2..maxK) of incoming payments whose sum matches the invoice
 * gross (exact / rounding / Skonto). DFS over a bounded, sorted candidate set;
 * returns the subset closest to the target with the fewest items.
 */
function bestPaymentSubset(
  targetCents: number,
  candidates: TxLite[],
  maxK = 6,
): { ids: string[]; sum: number } | null {
  const sorted = [...candidates]
    .filter((c) => c.betragCents > 0 && c.betragCents <= targetCents)
    .sort((a, b) => b.betragCents - a.betragCents)
    .slice(0, 16);
  const upper = targetCents + 2; // payments never exceed the invoice (allow rounding)

  const found: { ids: string[]; sum: number; delta: number }[] = [];
  const chosen: TxLite[] = [];

  function consider(): void {
    if (chosen.length < 2) return;
    const sum = chosen.reduce((s, c) => s + c.betragCents, 0);
    if (comboAmountScore(sum, targetCents) <= 0) return;
    found.push({
      ids: chosen.map((c) => c.id),
      sum,
      delta: Math.abs(sum - targetCents),
    });
  }

  function dfs(start: number, partial: number): void {
    consider();
    if (chosen.length >= maxK) return;
    for (let i = start; i < sorted.length; i += 1) {
      const next = partial + sorted[i]!.betragCents;
      if (next > upper) continue; // prune – overshoots the invoice
      chosen.push(sorted[i]!);
      dfs(i + 1, next);
      chosen.pop();
    }
  }

  dfs(0, 0);
  if (found.length === 0) return null;
  found.sort((a, b) => a.delta - b.delta || a.ids.length - b.ids.length);
  const best = found[0]!;
  return { ids: best.ids, sum: best.sum };
}

/**
 * Matches ONE invoice (a total amount) to SEVERAL incoming payments that
 * together sum to it (Teilzahlungen/Ratenzahlung). The inverse of
 * matchPaymentCombinations. Candidates per invoice are payments of the same
 * client (name similar) or whose purpose carries the invoice number, each
 * smaller than the total. Greedy: each payment used at most once. Suggest-only
 * (never auto) – splitting money across an invoice deserves a human confirm.
 */
export function matchInvoiceSplitPayments(
  payments: TxLite[],
  invoices: InvoiceLite[],
  ibanClientId: IbanClientMap = new Map(),
): SplitMatch[] {
  const results: SplitMatch[] = [];
  const usedTx = new Set<string>();

  // Largest invoices first – they are the likelier candidates for instalments.
  const ordered = [...invoices]
    .filter((i) => i.grossCents > 0)
    .sort((a, b) => b.grossCents - a.grossCents);

  for (const inv of ordered) {
    const candidates = payments.filter((p) => {
      if (usedTx.has(p.id)) return false;
      if (p.betragCents <= 0 || p.betragCents >= inv.grossCents) return false;
      const byNumber = numberInPurpose([inv.number, inv.paymentRef], p.zweck);
      const byName =
        nameSimilarity(p.gegen, inv.kunde) > 0.3 ||
        nameInPurpose(inv.kunde, p.zweck);
      const byIban = ibanMatches(p, inv, ibanClientId);
      if (!byNumber && !byName && !byIban) return false;
      if (inv.issueDate && daysBetween(p.datum, inv.issueDate) > 180) return false;
      return true;
    });
    if (candidates.length < 2) continue;

    const subset = bestPaymentSubset(inv.grossCents, candidates);
    if (!subset) continue;

    const score = comboAmountScore(subset.sum, inv.grossCents);
    if (score <= 0) continue;

    subset.ids.forEach((id) => usedTx.add(id));
    results.push({
      invoiceId: inv.id,
      txIds: subset.ids,
      score,
      reason:
        subset.sum === inv.grossCents
          ? `${subset.ids.length} Zahlungen, Summe exakt`
          : `${subset.ids.length} Zahlungen, Summe passend`,
      invoiceCents: inv.grossCents,
      paidCents: subset.sum,
      auto: false,
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
  minScore = SUGGEST_THRESHOLD,
): Match[] {
  const candidates: Match[] = [];
  for (const rec of receipts) {
    for (const tx of txs) {
      if (sign === 'out' && tx.betragCents >= 0) continue;
      if (sign === 'in' && tx.betragCents <= 0) continue;
      const m = scoreReceiptTx(rec, tx, minScore);
      if (m) candidates.push(m);
    }
  }
  return greedy(candidates);
}

export interface ReceiptComboMatch {
  txId: string;
  receiptIds: string[];
  score: number;
  reason: string;
  /** Betrags-MAGNITUDE der Zahlung (positiv). */
  paymentCents: number;
  totalCents: number;
  auto: boolean;
}

/**
 * Best subset (2..maxK) of Ausgabe-Belege whose brutto sums to the payment
 * (exact/rounding). Same DFS shape as bestPaymentSubset.
 */
function bestReceiptSubset(
  targetCents: number,
  candidates: ReceiptLite[],
  maxK = 6,
): { ids: string[]; sum: number } | null {
  const sorted = candidates
    .filter(
      (c): c is ReceiptLite & { bruttoCents: number } =>
        c.bruttoCents != null && c.bruttoCents > 0 && c.bruttoCents <= targetCents,
    )
    .sort((a, b) => b.bruttoCents - a.bruttoCents)
    .slice(0, 16);
  const upper = targetCents + 2;

  const found: { ids: string[]; sum: number; delta: number }[] = [];
  const chosen: (ReceiptLite & { bruttoCents: number })[] = [];

  function consider(): void {
    if (chosen.length < 2) return;
    const sum = chosen.reduce((s, c) => s + c.bruttoCents, 0);
    if (comboAmountScore(sum, targetCents) <= 0) return;
    found.push({
      ids: chosen.map((c) => c.id),
      sum,
      delta: Math.abs(sum - targetCents),
    });
  }

  function dfs(start: number, partial: number): void {
    consider();
    if (chosen.length >= maxK) return;
    for (let i = start; i < sorted.length; i += 1) {
      const next = partial + sorted[i]!.bruttoCents;
      if (next > upper) continue;
      chosen.push(sorted[i]!);
      dfs(i + 1, next);
      chosen.pop();
    }
  }

  dfs(0, 0);
  if (found.length === 0) return null;
  found.sort((a, b) => a.delta - b.delta || a.ids.length - b.ids.length);
  const best = found[0]!;
  return { ids: best.ids, sum: best.sum };
}

/**
 * Matches ONE outgoing payment to SEVERAL Ausgabe-Belege whose brutto together
 * sum to it. Deckt den Amazon-Fall ab: ein PDF mit mehreren Rechnungs-Seiten,
 * die zusammen dem abgebuchten Betrag entsprechen. Kandidaten je Zahlung sind
 * Belege desselben Händlers (Name ~ oder im Zweck) in einem 60-Tage-Fenster.
 * Greedy: jede Zahlung und jeder Beleg höchstens einmal. Nur Vorschlag.
 */
export function matchReceiptCombinations(
  receipts: ReceiptLite[],
  txs: TxLite[],
): ReceiptComboMatch[] {
  const results: ReceiptComboMatch[] = [];
  const usedRec = new Set<string>();

  const ordered = [...txs]
    .filter((t) => t.betragCents < 0)
    .sort((a, b) => Math.abs(b.betragCents) - Math.abs(a.betragCents));

  for (const tx of ordered) {
    const target = Math.abs(tx.betragCents);
    const candidates = receipts.filter((r) => {
      if (usedRec.has(r.id)) return false;
      if (r.bruttoCents == null || r.bruttoCents <= 0 || r.bruttoCents > target) {
        return false;
      }
      const byName =
        nameSimilarity(tx.gegen, r.haendler) > 0.3 ||
        nameInPurpose(r.haendler, tx.zweck);
      const byNumber = numberInPurpose(r.rechnungsnummer ?? null, tx.zweck);
      const byAccount = accountRefMatches(tx.zweck, r.kontoRef);
      if (!byName && !byNumber && !byAccount) return false;
      if (r.datum && daysBetween(tx.datum, r.datum) > 60) return false;
      return true;
    });
    if (candidates.length < 2) continue;

    const subset = bestReceiptSubset(target, candidates);
    if (!subset) continue;
    const score = comboAmountScore(subset.sum, target);
    if (score <= 0) continue;

    subset.ids.forEach((id) => usedRec.add(id));
    results.push({
      txId: tx.id,
      receiptIds: subset.ids,
      score,
      reason:
        subset.sum === target
          ? `${subset.ids.length} Belege, Summe exakt`
          : `${subset.ids.length} Belege, Summe passend`,
      paymentCents: target,
      totalCents: subset.sum,
      auto: false,
    });
  }
  return results;
}

// --- Konto-Abgleich (Google Ads u. a.) --------------------------------------

export interface AccountBalanceItem {
  ref: string | null;
  name: string | null;
  cents: number;
}
export interface AccountBalance {
  /** Konto-/Kundennummer (nur Ziffern). */
  ref: string;
  name: string;
  paymentsCount: number;
  paymentsSumCents: number;
  docsCount: number;
  docsSumCents: number;
  /** paymentsSum − docsSum (positiv = mehr gezahlt als berechnet). */
  diffCents: number;
  kind: 'match' | 'missing_doc' | 'missing_payment';
}

/**
 * Stellt je Konto-ID die Summe der offenen Zahlungen der Summe der offenen
 * Rechnungen gegenüber. Für Anbieter wie Google Ads, deren Abbuchungen
 * (Vorauszahlungen) nicht 1:1 zu den Rechnungen passen – die Konto-ID
 * (aus dem Bank-Zweck bzw. von der Rechnung) verbindet beide Seiten.
 */
export function computeAccountBalances(
  payments: AccountBalanceItem[],
  docs: AccountBalanceItem[],
): AccountBalance[] {
  interface Agg {
    name: string;
    count: number;
    sum: number;
  }
  const agg = (items: AccountBalanceItem[]): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const it of items) {
      const key = it.ref;
      if (!key || it.cents <= 0) continue;
      const a = m.get(key) ?? { name: it.name ?? key, count: 0, sum: 0 };
      a.count += 1;
      a.sum += it.cents;
      m.set(key, a);
    }
    return m;
  };
  const pay = agg(payments);
  const doc = agg(docs);

  const out: AccountBalance[] = [];
  for (const ref of new Set([...pay.keys(), ...doc.keys()])) {
    const p = pay.get(ref);
    const d = doc.get(ref);
    // Nur sinnvoll, wenn zu einer Konto-ID BEIDE Seiten vorliegen.
    if (!p || !d) continue;
    const diff = p.sum - d.sum;
    const tol = Math.max(100, Math.round(Math.max(p.sum, d.sum) * 0.01));
    const kind =
      Math.abs(diff) <= tol ? 'match' : diff > 0 ? 'missing_doc' : 'missing_payment';
    out.push({
      ref,
      name: d.name || p.name,
      paymentsCount: p.count,
      paymentsSumCents: p.sum,
      docsCount: d.count,
      docsSumCents: d.sum,
      diffCents: diff,
      kind,
    });
  }
  out.sort(
    (a, b) =>
      Math.abs(b.diffCents) - Math.abs(a.diffCents) ||
      b.paymentsSumCents + b.docsSumCents - (a.paymentsSumCents + a.docsSumCents),
  );
  return out;
}

// --- Saldo je Partner -------------------------------------------------------

export interface PartnerBalanceItem {
  name: string | null;
  cents: number;
}
export interface PartnerBalance {
  art: 'ausgabe' | 'einnahme';
  /** Repräsentativer Klartext-Name des Partners. */
  name: string;
  paymentsCount: number;
  /** Betrags-MAGNITUDE der offenen Zahlungen (immer positiv). */
  paymentsSumCents: number;
  docsCount: number;
  /** Betrags-MAGNITUDE der offenen Rechnungen/Belege (immer positiv). */
  docsSumCents: number;
  /** paymentsSum − docsSum (positiv = mehr gezahlt als berechnet). */
  diffCents: number;
  /**
   *  match           – Summen passen ~ (wahrscheinlich Teilzahlungen).
   *  missing_doc     – mehr gezahlt als berechnet → evtl. fehlt eine Rechnung.
   *  missing_payment – mehr berechnet als gezahlt → evtl. fehlt eine Zahlung.
   */
  kind: 'match' | 'missing_doc' | 'missing_payment';
}

// Geo-/Konzern-Zusätze, die zwei Schreibweisen desselben Partners trennen würden
// ("Google Ireland Ltd" vs. "Google Ads") – für die Gruppierung ausgeblendet.
const PARTNER_STOP = new Set([
  'ireland', 'europe', 'international', 'payments', 'payment', 'limited',
  'holding', 'group', 'deutschland', 'germany', 'ads', 'pay', 'technologies',
  'platforms', 'services', 'service', 'online', 'company', 'digital', 'media',
  'marketing', 'inc', 'llc', 'corp', 'sarl', 'operations',
]);

/** Gruppierungs-Schlüssel eines Partnernamens (Marken-Token, ohne Zusätze). */
function partnerKey(name: string | null): string | null {
  const toks = normName(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !PARTNER_STOP.has(t));
  if (toks.length === 0) return null;
  toks.sort();
  return toks.join(' ');
}

/**
 * Saldo je Partner: gruppiert offene Zahlungen und offene Rechnungen/Belege nach
 * Partner (Marken-Token) und vergleicht die Summen. Fängt Muster wie Google-Ads
 * ab, wo runde Abbuchungen (500/300) nicht zu einzelnen Rechnungen passen, ihre
 * SUMME aber schon – oder wo eine Rechnung/Zahlung offensichtlich fehlt.
 */
export function computePartnerBalances(
  payments: PartnerBalanceItem[],
  docs: PartnerBalanceItem[],
  art: 'ausgabe' | 'einnahme',
): PartnerBalance[] {
  interface Agg {
    name: string;
    count: number;
    sum: number;
  }
  const agg = (items: PartnerBalanceItem[]): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const it of items) {
      const key = partnerKey(it.name);
      if (!key || it.cents <= 0) continue;
      const a = m.get(key) ?? { name: it.name ?? key, count: 0, sum: 0 };
      a.count += 1;
      a.sum += it.cents;
      m.set(key, a);
    }
    return m;
  };
  const pay = agg(payments);
  const doc = agg(docs);

  const out: PartnerBalance[] = [];
  for (const key of new Set([...pay.keys(), ...doc.keys()])) {
    const p = pay.get(key);
    const d = doc.get(key);
    const pc = p?.count ?? 0;
    const ps = p?.sum ?? 0;
    const dc = d?.count ?? 0;
    const ds = d?.sum ?? 0;

    // Nur aussagekräftige Fälle: beide Seiten vorhanden, oder mehrere gleich-
    // artige (mehrere Zahlungen ohne jede Rechnung / umgekehrt).
    const bothSides = pc >= 1 && dc >= 1;
    const manyPaymentsNoDoc = pc >= 2 && dc === 0;
    const manyDocsNoPayment = dc >= 2 && pc === 0;
    if (!bothSides && !manyPaymentsNoDoc && !manyDocsNoPayment) continue;
    if (Math.max(ps, ds) < 100) continue;

    const diff = ps - ds;
    const tol = Math.max(100, Math.round(Math.max(ps, ds) * 0.01));
    const kind =
      Math.abs(diff) <= tol ? 'match' : diff > 0 ? 'missing_doc' : 'missing_payment';

    out.push({
      art,
      name: p?.name ?? d?.name ?? key,
      paymentsCount: pc,
      paymentsSumCents: ps,
      docsCount: dc,
      docsSumCents: ds,
      diffCents: diff,
      kind,
    });
  }
  // Größte Auffälligkeit zuerst (Differenz, dann Volumen).
  out.sort(
    (a, b) =>
      Math.abs(b.diffCents) - Math.abs(a.diffCents) ||
      b.paymentsSumCents + b.docsSumCents - (a.paymentsSumCents + a.docsSumCents),
  );
  return out.slice(0, 25);
}

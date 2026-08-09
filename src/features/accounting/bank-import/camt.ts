import {
  type ParsedTransaction,
  type ParseResult,
  normalizeDate,
  cleanText,
} from './types';

/** All non-overlapping matches of a tag's inner text. */
function allTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? '');
  return out;
}

/** First match of a tag's inner text within a fragment. */
function firstTag(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`),
  );
  return m ? (m[1] ?? null) : null;
}

/** Amount in ISO format (dot decimal, always positive) to cents. */
function isoAmountToCents(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Parses a CAMT.053 (ISO-20022) bank statement. Reads each <Ntry>: amount +
 * CdtDbtInd for the sign, booking date, the counterparty (Dbtr on a credit,
 * Cdtr on a debit) and the unstructured remittance info. Namespace prefixes are
 * tolerated.
 */
export function parseCamt053(xml: string): ParseResult {
  // Own account IBAN: the first <IBAN> (inside <Acct>) at statement level.
  const accountIban = cleanText(firstTag(xml, 'IBAN'));

  const entries = allTags(xml, 'Ntry');
  const transactions: ParsedTransaction[] = [];

  for (const entry of entries) {
    const amt = isoAmountToCents(firstTag(entry, 'Amt'));
    if (amt == null) continue;
    const ind = (firstTag(entry, 'CdtDbtInd') ?? '').trim().toUpperCase();
    const betragCents = ind === 'DBIT' ? -Math.abs(amt) : Math.abs(amt);

    const bookg = firstTag(entry, 'BookgDt');
    const dateRaw = bookg ? firstTag(bookg, 'Dt') ?? firstTag(bookg, 'DtTm') : null;
    const datum = dateRaw ? normalizeDate(dateRaw) : null;
    if (!datum) continue;

    // Counterparty: opposite party to the direction of the money.
    const rlt = firstTag(entry, 'RltdPties') ?? entry;
    const cdtr = firstTag(firstTag(rlt, 'Cdtr') ?? '', 'Nm');
    const dbtr = firstTag(firstTag(rlt, 'Dbtr') ?? '', 'Nm');
    const gegen = cleanText(ind === 'DBIT' ? cdtr : dbtr) ?? cleanText(cdtr ?? dbtr);

    const zweck = cleanText(allTags(entry, 'Ustrd').join(' '));

    transactions.push({ datum, gegen, zweck, betragCents });
  }

  return { transactions, accountIban, format: 'camt053' };
}

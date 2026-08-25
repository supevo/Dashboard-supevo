import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatEuroCents } from '@/lib/money';
import type { ContractData } from '@/features/contracts/queries';

function decodePngDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/** Draws wrapped text and returns the y after the block. */
function paragraph(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size = 11,
  lineGap = 5,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursor, size, font, color: rgb(0.1, 0.1, 0.12) });
      cursor -= size + lineGap;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursor, size, font, color: rgb(0.1, 0.1, 0.12) });
    cursor -= size + lineGap;
  }
  return cursor;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

async function signatureBlock(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  opts: { signaturePng: string; signer: string; signedAt: string; ip: string },
  x: number,
  y: number,
): Promise<void> {
  try {
    const img = await doc.embedPng(decodePngDataUrl(opts.signaturePng));
    const w = 200;
    const h = (img.height / img.width) * w;
    page.drawImage(img, { x, y: y - h, width: w, height: Math.min(h, 80) });
    page.drawLine({
      start: { x, y: y - Math.min(h, 80) - 4 },
      end: { x: x + 240, y: y - Math.min(h, 80) - 4 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= Math.min(h, 80) + 18;
  } catch {
    y -= 20;
  }
  page.drawText(`Unterschrift: ${opts.signer}`, { x, y, size: 10, font: bold });
  page.drawText(
    `Digital signiert am ${fmtDateTime(opts.signedAt)} · IP ${opts.ip}`,
    { x, y: y - 14, size: 8, font, color: rgb(0.4, 0.4, 0.45) },
  );
}

/** Contract confirmation PDF (audit record of the click-to-sign agreement). */
export async function renderContractPdf(params: {
  agencyName: string;
  clientName: string;
  signer: string;
  signedAt: string;
  ip: string;
  signaturePng: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 50;
  const maxW = 495;
  let y = 780;

  page.drawText('Dienstleistungsvertrag – Auftragsbestätigung', {
    x: left, y, size: 18, font: bold,
  });
  y -= 30;
  page.drawText(`${params.agencyName}  ·  ${params.clientName}`, {
    x: left, y, size: 11, font, color: rgb(0.35, 0.35, 0.4),
  });
  y -= 30;

  y = paragraph(page, font,
    `Mit der digitalen Unterschrift bestätigt ${params.clientName} den Dienstleistungsvertrag mit ${params.agencyName} und beauftragt die vereinbarten Marketing-Leistungen.`,
    left, y, maxW);
  y -= 8;
  y = paragraph(page, font,
    'Diese digitale Unterschrift dient als Nachweis der Zustimmung. Der vollständige Vertragstext wurde dem Kunden vorab bereitgestellt.',
    left, y, maxW);

  await signatureBlock(doc, page, font, bold, params, left, y - 30);
  return doc.save();
}

export interface MembershipContractParams {
  agency: {
    name: string;
    addressLines: string[];
    phone?: string | null;
    email?: string | null;
    vatId?: string | null;
  };
  client: { name: string; addressLines: string[] };
  /** ISO yyyy-mm-dd start of the cooperation. */
  startDate: string;
  /** Formatted net monthly fee, e.g. "4.356,00 €". */
  monthlyNet: string;
  /** "monatlich" | "quartalsweise" | "jährlich". */
  billingInterval: string;
  planLabel: string;
  city: string;
}

function ddmmyyyy(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Generates the full "Vertrag zur strategischen Online-Marketing-Zusammenarbeit"
 * from the client's configured membership: the parties, start date (§2), fee and
 * billing interval (§3) are filled in; the remaining clauses are the standard
 * agreement text. Multi-page with automatic page breaks. The client reads and
 * signs this via the normal contract flow (a signature page is appended).
 */
export async function renderMembershipContractPdf(
  params: MembershipContractParams,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const left = 50;
  const right = 50;
  const maxW = PAGE_W - left - right;
  const bottom = 60;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 60;

  const ensure = (need: number) => {
    if (y - need < bottom) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 60;
    }
  };

  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const out: string[] = [];
    for (const raw of text.split('\n')) {
      const words = raw.split(/\s+/);
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) {
          out.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      out.push(line);
    }
    return out;
  };

  const text = (
    s: string,
    { size = 10.5, f = font, gap = 4, indent = 0, color = rgb(0.12, 0.12, 0.14) } = {},
  ) => {
    for (const line of wrap(s, f, size)) {
      ensure(size + gap);
      page.drawText(line, { x: left + indent, y, size, font: f, color });
      y -= size + gap;
    }
  };

  const heading = (s: string) => {
    y -= 8;
    ensure(16);
    page.drawText(s, { x: left, y, size: 12.5, font: bold });
    y -= 18;
  };

  const bullet = (s: string) => {
    ensure(15);
    page.drawText('•', { x: left, y, size: 10.5, font });
    const lines = wrap(s, font, 10.5);
    lines.forEach((line, i) => {
      if (i > 0) ensure(14.5);
      page.drawText(line, { x: left + 14, y, size: 10.5, font, color: rgb(0.12, 0.12, 0.14) });
      y -= 14.5;
    });
  };

  const spacer = (h = 8) => {
    y -= h;
  };

  // --- Title ---
  page.drawText('Vertrag zur strategischen', { x: left, y, size: 18, font: bold });
  y -= 22;
  page.drawText('Online-Marketing-Zusammenarbeit', { x: left, y, size: 18, font: bold });
  y -= 26;
  page.drawText('zwischen', { x: left, y, size: 11, font, color: rgb(0.4, 0.4, 0.45) });
  y -= 20;

  // --- Parties ---
  text(`Auftragnehmer – ${params.agency.name}`, { f: bold, size: 11, gap: 3 });
  for (const l of params.agency.addressLines) text(l, { size: 10, gap: 2 });
  if (params.agency.phone) text(`Telefon: ${params.agency.phone}`, { size: 10, gap: 2 });
  if (params.agency.email) text(`E-Mail: ${params.agency.email}`, { size: 10, gap: 2 });
  if (params.agency.vatId) text(`USt-IdNr.: ${params.agency.vatId}`, { size: 10, gap: 2 });
  text('nachfolgend Auftragnehmer', { size: 9.5, color: rgb(0.4, 0.4, 0.45), gap: 3 });
  spacer(6);
  text(`Auftraggeber – ${params.client.name}`, { f: bold, size: 11, gap: 3 });
  for (const l of params.client.addressLines) text(l, { size: 10, gap: 2 });
  text('nachfolgend Auftraggeber', { size: 9.5, color: rgb(0.4, 0.4, 0.45), gap: 3 });

  // --- §1 ---
  heading('§1 Gegenstand der Zusammenarbeit');
  text(
    'Der Auftragnehmer übernimmt für den Auftraggeber die strategische und operative Betreuung im Online-Marketing als externe Marketingabteilung.',
  );
  text(
    'Ziel der Zusammenarbeit ist der Aufbau, Betrieb und die kontinuierliche Weiterentwicklung eines digitalen Systems zur planbaren Gewinnung und Vorqualifizierung von Kundenanfragen im definierten Zielgebiet.',
  );
  text('Hierbei entwickelt und betreibt der Auftragnehmer ein mehrstufiges Marketing- und Beratungssystem, welches insbesondere folgende Bestandteile umfasst:');
  spacer(2);
  [
    'Konzeption, Aufbau und Optimierung von Website und Landingpages',
    'Entwicklung und Umsetzung eines digitalen Anfragesystems inkl. Vorqualifizierung und Terminbuchung',
    'Einrichtung, Betreuung und Optimierung von Werbekampagnen (u. a. Google Ads, Google Local Ads, Social Media Ads)',
    'Suchmaschinenoptimierung (SEO) sowie lokale Sichtbarkeitsoptimierung (GEO)',
    'Einrichtung und Betreuung von Tracking und Conversion-Messung',
    'Integration digitaler Assistenzsysteme zur Vorqualifizierung von Anfragen',
    'Strategische Weiterentwicklung der Positionierung und Außenkommunikation',
    'Laufende Analyse, Optimierung und Weiterentwicklung sämtlicher Marketingmaßnahmen',
  ].forEach(bullet);
  spacer(2);
  text('Die Zusammenarbeit erfolgt auf Grundlage eines Marketingplans, der die strategische Entwicklung in aufeinander aufbauenden Phasen beschreibt. Der Marketingplan ist Bestandteil der Zusammenarbeit, stellt jedoch keinen abschließenden Leistungskatalog dar. Maßnahmen, Prioritäten und Umsetzungsreihenfolge werden fortlaufend angepasst.');

  // --- §2 Laufzeit ---
  heading('§2 Laufzeit');
  text(`Gewähltes Paket: ${params.planLabel}.`);
  text(`Die Zusammenarbeit beginnt am ${ddmmyyyy(params.startDate)}.`);
  text('Der Vertrag läuft auf unbestimmte Zeit. Er kann von beiden Seiten mit einer Frist von 4 Wochen zum Monatsende schriftlich gekündigt werden. Die strategische Ausrichtung der Zusammenarbeit ist langfristig angelegt.');

  // --- §3 Vergütung ---
  heading('§3 Vergütung');
  text('Die Vergütung beträgt:');
  text(`${params.monthlyNet} zzgl. gesetzlicher Mehrwertsteuer.`, { f: bold, size: 11 });
  text(`Die Abrechnung erfolgt ${params.billingInterval} im Voraus.`);
  text('Das Budget für Werbeanzeigen wird vom Auftraggeber separat getragen und ist nicht Bestandteil der Vergütung.');

  // --- §4 ---
  heading('§4 Mitwirkungspflichten des Auftraggebers');
  text('Der Auftraggeber stellt alle notwendigen Informationen, Inhalte und Zugänge rechtzeitig zur Verfügung. Hierzu zählen insbesondere:');
  spacer(2);
  [
    'Zugänge zu Website, Hosting und relevanten Plattformen',
    'Zugriff auf Werbekonten, Tracking-Systeme und Unternehmensprofile',
    'Bildmaterial, Logos sowie Referenzprojekte',
    'Zeitnahe Freigaben von Texten, Designs und Kampagnen',
  ].forEach(bullet);
  spacer(2);
  text('Freigaben erfolgen in der Regel innerhalb von 3 Werktagen. Verzögerungen durch ausbleibende Mitwirkung führen zu einer entsprechenden Verschiebung von Maßnahmen und Ergebnissen.');

  // --- §5 ---
  heading('§5 Leistungsumfang und Haftung');
  text('Der Auftragnehmer schuldet die fachgerechte Umsetzung der vereinbarten Marketingmaßnahmen sowie die strategische Betreuung der Online-Marketing-Aktivitäten. Ein bestimmter wirtschaftlicher Erfolg, insbesondere konkrete Umsatz- oder Auftragszahlen, wird nicht geschuldet. Die Haftung des Auftragnehmers ist auf Vorsatz und grobe Fahrlässigkeit beschränkt.');

  // --- §6 ---
  heading('§6 Erwartungsrahmen der Zusammenarbeit');
  text('Der Auftragnehmer schuldet die fachgerechte Umsetzung sowie die kontinuierliche Optimierung des beschriebenen Systems. Ein konkreter wirtschaftlicher Erfolg wird nicht geschuldet.');

  // --- §7 ---
  heading('§7 Nutzungsrechte und Systeme');
  text('Alle im Rahmen der Zusammenarbeit erstellten Marketingstrukturen, Inhalte, Werbekonten, Tracking-Setups, Landingpages und sonstigen Systeme werden für den Auftraggeber aufgebaut und nach vollständiger Zahlung in dessen Besitz überführt. Nicht umfasst sind interne Strategien, Vorgehensweisen, Methodiken, Prozesse sowie Know-how des Auftragnehmers.');

  // --- §8 ---
  heading('§8 Vertraulichkeit');
  text('Beide Parteien verpflichten sich, sämtliche im Rahmen der Zusammenarbeit bekannt gewordenen geschäftlichen Informationen vertraulich zu behandeln.');

  // --- §9 ---
  heading('§9 Schlussbestimmungen');
  text('Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des Auftragnehmers.');

  // --- Signature area ---
  spacer(20);
  ensure(70);
  text(`${params.city || 'Ort'}, den ${ddmmyyyy(new Date().toISOString().slice(0, 10))}`, { size: 10 });
  spacer(26);
  ensure(40);
  const colW = (maxW - 30) / 2;
  page.drawLine({ start: { x: left, y }, end: { x: left + colW, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  page.drawLine({ start: { x: left + colW + 30, y }, end: { x: left + maxW, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 12;
  page.drawText('Auftraggeber', { x: left, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
  page.drawText('Auftragnehmer', { x: left + colW + 30, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) });

  return doc.save();
}

/**
 * Rendert den Dienstleistungsvertrag aus denselben ContractData wie die
 * Abrechnungs-/Lead-Ansicht (buildContractFromClient): Vertragspartner,
 * itemisierte Modul-Positionen inkl. Gutschein-Rabatt, der editierbare
 * Konditionstext und Unterschriftsfelder. So ist das signierte Onboarding-PDF
 * inhaltlich identisch mit dem, was in der Abrechnung angezeigt wird.
 */
// CP1252-Sonderzeichen, die die Standard-Schrift (WinAnsi) darstellen kann.
const WINANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const CHAR_REPLACEMENTS: Record<number, string> = {
  0x2192: '->', 0x2190: '<-', 0x21d2: '=>', 0x2713: '-', 0x2714: '-',
  0x2717: 'x', 0x2718: 'x', 0x2265: '>=', 0x2264: '<=', 0x00d7: 'x',
  0x2011: '-', 0x2012: '-', 0x2015: '-', 0x00a0: ' ', 0x0009: ' ',
};

/**
 * Macht Text für die Standard-Schrift (WinAnsi/CP1252) sicher: nicht
 * darstellbare Zeichen (Pfeile, Häkchen, Emoji …) würden sonst in pdf-lib eine
 * Exception werfen und die Vertragserzeugung abbrechen. Bekannte Zeichen werden
 * ersetzt, unbekannte entfernt.
 */
function winAnsiSafe(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0xff) || WINANSI_HIGH.has(c)) {
      out += ch;
    } else if (CHAR_REPLACEMENTS[c] !== undefined) {
      out += CHAR_REPLACEMENTS[c];
    } // sonst: entfernen (Emoji, exotische Symbole)
  }
  return out;
}

export async function renderOfferContractPdf(data: ContractData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const left = 50;
  const right = 50;
  const maxW = PAGE_W - left - right;
  const bottom = 55;
  const ink = rgb(0.12, 0.12, 0.14);
  const gray = rgb(0.45, 0.45, 0.5);
  const rule = rgb(0.82, 0.82, 0.85);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 50;

  const ensure = (need: number) => {
    if (y - need < bottom) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 50;
    }
  };
  const wrap = (raw0: string, f: PDFFont, size: number, width = maxW): string[] => {
    const t = winAnsiSafe(raw0);
    const out: string[] = [];
    for (const raw of t.split('\n')) {
      const words = raw.split(/\s+/);
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > width && line) {
          out.push(line);
          line = w;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const hr = (yy: number, color = rule, thickness = 0.5) =>
    page.drawLine({ start: { x: left, y: yy }, end: { x: left + maxW, y: yy }, thickness, color });
  const drawRight = (s: string, yy: number, size: number, f: PDFFont, color = ink) => {
    const safe = winAnsiSafe(s);
    const w = f.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: PAGE_W - right - w, y: yy, size, font: f, color });
  };
  // Flowing text (advances shared y). Used after the two-column header.
  const text = (
    s: string,
    { size = 9.5, f = font, gap = 3, color = ink, indent = 0 } = {},
  ) => {
    for (const line of wrap(s, f, size, maxW - indent)) {
      ensure(size + gap);
      page.drawText(line, { x: left + indent, y, size, font: f, color });
      y -= size + gap;
    }
  };
  const sectionLabel = (s: string) => {
    y -= 10;
    ensure(14);
    page.drawText(winAnsiSafe(s.toUpperCase()), { x: left, y, size: 8, font: bold, color: gray });
    y -= 13;
  };
  type Item = {
    text: string;
    size?: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
    gap?: number;
  };
  // Draws a stack at a fixed column, returns the y it ended at (does not touch shared y).
  const drawStack = (x: number, width: number, items: Item[], startY: number): number => {
    let yy = startY;
    for (const it of items) {
      const size = it.size ?? 9.5;
      const f = it.font ?? font;
      const gap = it.gap ?? 2;
      for (const ln of wrap(it.text, f, size, width)) {
        page.drawText(ln, { x, y: yy, size, font: f, color: it.color ?? ink });
        yy -= size + gap;
      }
    }
    return yy;
  };

  // ---------- Kopf ----------
  const topY = y;
  let leftY = topY;
  if (data.logoDark) {
    try {
      const png = await doc.embedPng(decodePngDataUrl(data.logoDark));
      const h = 26;
      const w = (png.width / png.height) * h;
      page.drawImage(png, { x: left, y: leftY - h, width: w, height: h });
      leftY -= h + 8;
    } catch {
      // Logo optional.
    }
  }
  page.drawText('Dienstleistungsvertrag', { x: left, y: leftY - 16, size: 19, font: bold });
  leftY -= 16 + 12;
  page.drawText(
    winAnsiSafe(`Datum: ${data.date}${data.reference ? ` · ${data.reference}` : ''}`),
    { x: left, y: leftY, size: 8.5, font, color: gray },
  );
  leftY -= 8.5;

  // Absenderblock oben rechts (rechtsbündig).
  let rightY = topY - 2;
  const rlines: Item[] = [
    { text: data.provider.name, font: bold, size: 9.5 },
    ...data.provider.addressLines.map((l) => ({ text: l, size: 8.5, color: gray })),
    ...(data.provider.email ? [{ text: data.provider.email, size: 8.5, color: gray }] : []),
    ...(data.provider.phone ? [{ text: data.provider.phone, size: 8.5, color: gray }] : []),
  ];
  for (const it of rlines) {
    const size = it.size ?? 8.5;
    drawRight(it.text, rightY, size, it.font ?? font, it.color ?? ink);
    rightY -= size + 2;
  }

  y = Math.min(leftY, rightY) - 12;
  hr(y);
  y -= 16;

  // ---------- Vertragspartner (zwei Spalten) ----------
  const colGap = 24;
  const colW = (maxW - colGap) / 2;
  const colLX = left;
  const colRX = left + colW + colGap;
  const startY = y;

  const providerItems: Item[] = [
    { text: 'Auftragnehmer', font: bold, size: 8, color: gray, gap: 4 },
    { text: data.provider.name, font: bold, size: 10 },
    ...data.provider.addressLines.map((l) => ({ text: l, size: 9.5 })),
    ...(data.provider.vatId
      ? [{ text: `USt-IdNr.: ${data.provider.vatId}`, size: 9.5 }]
      : data.provider.taxNumber
        ? [{ text: `Steuernr.: ${data.provider.taxNumber}`, size: 9.5 }]
        : []),
  ];
  const customerItems: Item[] = [
    { text: 'Auftraggeber', font: bold, size: 8, color: gray, gap: 4 },
    { text: data.customer.name, font: bold, size: 10 },
    ...(data.customer.contactName ? [{ text: `z. Hd. ${data.customer.contactName}`, size: 9.5 }] : []),
    ...(data.customer.addressLines.length > 0
      ? data.customer.addressLines.map((l) => ({ text: l, size: 9.5 }))
      : [{ text: 'Anschrift: ____________________________', size: 9.5, color: gray }]),
    ...(data.customer.vatId ? [{ text: `USt-IdNr.: ${data.customer.vatId}`, size: 9.5 }] : []),
    ...(data.customer.email ? [{ text: data.customer.email, size: 9.5 }] : []),
  ];
  const endL = drawStack(colLX, colW, providerItems, startY);
  const endR = drawStack(colRX, colW, customerItems, startY);
  y = Math.min(endL, endR) - 6;

  // ---------- Positionen ----------
  sectionLabel('Leistungen / Positionsübersicht');
  ensure(16);
  page.drawText('Leistung', { x: left, y, size: 8, font, color: gray });
  drawRight('monatlich (netto)', y, 8, font, gray);
  y -= 5;
  hr(y);
  y -= 13;

  if (data.lines.length === 0) {
    text('Keine Module ausgewählt.', { size: 9.5, color: gray });
  }
  for (const line of data.lines) {
    const detailLines = line.detail ? wrap(line.detail, font, 8.5, colW * 1.4) : [];
    ensure(14 + detailLines.length * 11 + 6);
    page.drawText(winAnsiSafe(line.label), { x: left, y, size: 10, font: bold });
    drawRight(formatEuroCents(line.monthlyCents), y, 10, font);
    y -= 13;
    for (const dl of detailLines) {
      page.drawText(dl, { x: left + 10, y, size: 8.5, font, color: gray });
      y -= 11;
    }
    y -= 5;
    hr(y + 2, rgb(0.9, 0.9, 0.92));
  }

  y -= 2;
  hr(y + 4, rule, 1);
  y -= 8;
  if (data.discountCents > 0) {
    ensure(14);
    page.drawText('Gutschein', { x: left, y, size: 9.5, font, color: gray });
    drawRight(`−${formatEuroCents(data.discountCents)}`, y, 9.5, font, gray);
    y -= 14;
  }
  ensure(18);
  page.drawText('Monatlich netto', { x: left, y, size: 11, font: bold });
  drawRight(formatEuroCents(data.monthlyNetCents), y, 11, bold);
  y -= 17;

  const vatNote = data.smallBusiness
    ? 'Kleinunternehmer gemäß § 19 UStG – es wird keine Umsatzsteuer ausgewiesen.'
    : `Alle Beträge netto zzgl. gesetzlicher Umsatzsteuer (${data.taxRatePct} %).`;
  text(vatNote, { size: 8.5, color: gray, gap: 2 });
  if (data.budgetCents > 0) {
    text(
      `Zzgl. Werbebudget ${formatEuroCents(data.budgetCents)}/Monat – wird separat abgerechnet und ist nicht Teil der Agenturvergütung.`,
      { size: 8.5, color: gray, gap: 2 },
    );
  }

  // ---------- Vertragsbedingungen ----------
  sectionLabel('Vertragsbedingungen');
  text(data.terms, { size: 8.5, gap: 2.5 });

  // ---------- Unterschriften ----------
  y -= 24;
  ensure(64);
  const sigLine = (yy: number) => {
    page.drawLine({ start: { x: colLX, y: yy }, end: { x: colLX + colW, y: yy }, thickness: 0.6, color: rgb(0.25, 0.25, 0.28) });
    page.drawLine({ start: { x: colRX, y: yy }, end: { x: colRX + colW, y: yy }, thickness: 0.6, color: rgb(0.25, 0.25, 0.28) });
  };
  sigLine(y);
  y -= 11;
  page.drawText('Ort, Datum – Auftraggeber', { x: colLX, y, size: 8.5, font, color: gray });
  page.drawText('Ort, Datum – Auftragnehmer', { x: colRX, y, size: 8.5, font, color: gray });
  y -= 34;
  ensure(20);
  sigLine(y);
  y -= 11;
  page.drawText('Unterschrift Auftraggeber', { x: colLX, y, size: 8.5, font, color: gray });
  page.drawText('Unterschrift Auftragnehmer', { x: colRX, y, size: 8.5, font, color: gray });

  if (data.provider.iban) {
    y -= 22;
    ensure(16);
    hr(y + 8, rule);
    text(
      `Bankverbindung: ${data.provider.bankName ? `${data.provider.bankName}, ` : ''}IBAN ${data.provider.iban}${data.provider.bic ? ` · BIC ${data.provider.bic}` : ''}`,
      { size: 8, color: gray },
    );
  }

  return doc.save();
}

/**
 * Signs an agency-provided contract PDF: keeps the original pages the client
 * read and appends a signature page (signature image, name, timestamp, IP).
 * The result is the legally meaningful signed document.
 */
export async function renderSignedContractFromTemplate(params: {
  templateBytes: Uint8Array;
  agencyName: string;
  clientName: string;
  signer: string;
  signedAt: string;
  ip: string;
  signaturePng: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(params.templateBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const left = 50;
  const maxW = 495;
  let y = 780;

  page.drawText('Unterschrift – Auftragsbestätigung', { x: left, y, size: 18, font: bold });
  y -= 30;
  page.drawText(`${params.agencyName}  ·  ${params.clientName}`, {
    x: left, y, size: 11, font, color: rgb(0.35, 0.35, 0.4),
  });
  y -= 28;
  y = paragraph(page, font,
    `${params.clientName} bestätigt mit der digitalen Unterschrift den vorstehenden Dienstleistungsvertrag mit ${params.agencyName}. Der vollständige Vertragstext ist Bestandteil dieses Dokuments (vorstehende Seiten).`,
    left, y, maxW);

  await signatureBlock(doc, page, font, bold, params, left, y - 30);
  return doc.save();
}

/**
 * SEPA mandate PREVIEW (blank): the form with the agency's creditor data and a
 * mandate reference, but the debtor fields (account holder, IBAN) and signature
 * left open. The agency reviews/approves this before it is released to the
 * client, who then fills in IBAN + signature.
 */
export async function renderSepaPreviewPdf(params: {
  creditorName: string;
  creditorId: string;
  clientName: string;
  mandateRef: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 50;
  const maxW = 495;
  let y = 780;

  page.drawText('SEPA-Lastschriftmandat', { x: left, y, size: 18, font: bold });
  y -= 20;
  page.drawText('Vorschau – wird vom Kunden mit IBAN und Unterschrift vervollständigt', {
    x: left, y, size: 9, font, color: rgb(0.5, 0.5, 0.55),
  });
  y -= 26;

  const rows: [string, string][] = [
    ['Gläubiger', params.creditorName],
    ['Gläubiger-Identifikationsnr.', params.creditorId || '—'],
    ['Mandatsreferenz', params.mandateRef],
    ['Zahlungspflichtiger', params.clientName],
    ['Kontoinhaber', '_______________________________'],
    ['IBAN', '_______________________________'],
  ];
  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: left, y, size: 10, font: bold });
    page.drawText(v, { x: left + 180, y, size: 10, font });
    y -= 18;
  }
  y -= 10;

  y = paragraph(page, font,
    `Ich ermächtige ${params.creditorName}, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die von ${params.creditorName} auf mein Konto gezogenen Lastschriften einzulösen.`,
    left, y, maxW);
  y -= 6;
  y = paragraph(page, font,
    'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.',
    left, y, maxW, 9);
  y -= 24;

  page.drawLine({
    start: { x: left, y }, end: { x: left + 240, y },
    thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText('Ort, Datum, Unterschrift Kontoinhaber', {
    x: left, y: y - 12, size: 8, font, color: rgb(0.4, 0.4, 0.45),
  });

  return doc.save();
}

/** SEPA direct-debit mandate PDF. */
export async function renderSepaPdf(params: {
  creditorName: string;
  creditorId: string;
  clientName: string;
  accountHolder: string;
  ibanMasked: string;
  mandateRef: string;
  signer: string;
  signedAt: string;
  ip: string;
  signaturePng: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 50;
  const maxW = 495;
  let y = 780;

  page.drawText('SEPA-Lastschriftmandat', { x: left, y, size: 18, font: bold });
  y -= 34;

  const rows: [string, string][] = [
    ['Gläubiger', params.creditorName],
    ['Gläubiger-Identifikationsnr.', params.creditorId || '—'],
    ['Mandatsreferenz', params.mandateRef],
    ['Zahlungspflichtiger', params.clientName],
    ['Kontoinhaber', params.accountHolder],
    ['IBAN', params.ibanMasked],
  ];
  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: left, y, size: 10, font: bold });
    page.drawText(v, { x: left + 180, y, size: 10, font });
    y -= 18;
  }
  y -= 10;

  y = paragraph(page, font,
    `Ich ermächtige ${params.creditorName}, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die von ${params.creditorName} auf mein Konto gezogenen Lastschriften einzulösen.`,
    left, y, maxW);
  y -= 6;
  y = paragraph(page, font,
    'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.',
    left, y, maxW, 9);

  await signatureBlock(doc, page, font, bold, params, left, y - 24);
  return doc.save();
}

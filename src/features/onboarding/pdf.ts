import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

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

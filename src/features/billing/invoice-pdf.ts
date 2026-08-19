import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatEuroCents } from '@/lib/money';
import type { Database } from '@/lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];
type InvoiceItem = Database['public']['Tables']['invoice_items']['Row'];
type Settings = Database['public']['Tables']['billing_settings']['Row'];
type Membership = Database['public']['Tables']['client_memberships']['Row'];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Formats money for the PDF. Intl inserts a narrow no-break space (U+202F)
 * before the € sign, which the standard (WinAnsi) font cannot encode — replace
 * any no-break spaces with a normal space to avoid a render error.
 */
function money(cents: number): string {
  return formatEuroCents(cents).replace(/[\u202F\u00A0]/g, ' ');
}

/** Renders a German-format invoice PDF and returns the raw bytes. */
export async function renderInvoicePdf(params: {
  invoice: Invoice;
  items: InvoiceItem[];
  settings: Settings;
  membership: Membership | null;
  /** Dunkles Org-Logo als PNG/JPG-data-URI (SVG kann pdf-lib nicht einbetten). */
  logoDark?: string | null;
}): Promise<Uint8Array> {
  const { invoice, items, settings, membership } = params;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Logo oben rechts (nur PNG/JPG). Fehler beim Einbetten ignorieren.
  if (params.logoDark) {
    try {
      const m = params.logoDark.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
      if (m && m[2]) {
        const bytes = Buffer.from(m[2], 'base64');
        const img =
          m[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const scale = Math.min(150 / img.width, 45 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: 595.28 - 50 - w, y: 841.89 - 40 - h, width: w, height: h });
      }
    } catch {
      /* Logo optional */
    }
  }
  const left = 50;
  const right = width - 50;
  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0.1, 0.1, 0.1);

  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    size = 10,
    f: PDFFont = font,
    color = black,
  ) => p.drawText(s ?? '', { x, y, size, font: f, color });

  const textRight = (
    s: string,
    xRight: number,
    y: number,
    size = 10,
    f: PDFFont = font,
    color = black,
  ) => {
    const w = f.widthOfTextAtSize(s, size);
    p_drawText(page, s, xRight - w, y, size, f, color);
  };
  const p_drawText = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    size: number,
    f: PDFFont,
    color: ReturnType<typeof rgb>,
  ) => p.drawText(s, { x, y, size, font: f, color });

  // --- Sender line (above the address window) ---
  const senderParts = [
    settings.company_name,
    settings.address_line1,
    [settings.postal_code, settings.city].filter(Boolean).join(' '),
  ].filter(Boolean);
  text(page, senderParts.join(' · '), left, height - 60, 8, font, gray);

  // --- Buyer address block ---
  let y = height - 110;
  const buyerName = membership?.billing_name || '';
  const buyerLines = [
    buyerName,
    membership?.billing_address_line1,
    membership?.billing_address_line2,
    [membership?.billing_postal_code, membership?.billing_city]
      .filter(Boolean)
      .join(' '),
    membership?.billing_country && membership.billing_country !== 'Deutschland'
      ? membership.billing_country
      : null,
  ].filter(Boolean) as string[];
  for (const line of buyerLines) {
    text(page, line, left, y, 11);
    y -= 15;
  }

  // --- Meta block (right) ---
  let my = height - 110;
  const meta: Array<[string, string]> = [
    ['Rechnungsnummer', invoice.invoice_number ?? '(Entwurf)'],
    ['Rechnungsdatum', fmtDate(invoice.issue_date) || fmtDate(new Date().toISOString().slice(0, 10))],
    [
      'Leistungszeitraum',
      `${fmtDate(invoice.service_period_start)} – ${fmtDate(invoice.service_period_end)}`,
    ],
  ];
  if (membership?.billing_vat_id) meta.push(['USt-IdNr. Kunde', membership.billing_vat_id]);
  for (const [k, v] of meta) {
    text(page, k, right - 200, my, 9, font, gray);
    textRight(v, right, my, 9, bold);
    my -= 14;
  }

  // --- Title ---
  y = Math.min(y, my) - 24;
  text(page, `Rechnung ${invoice.invoice_number ?? ''}`.trim(), left, y, 16, bold);
  y -= 30;

  // --- Items table ---
  const colPos = left;
  const colDesc = left + 30;
  const colQty = 330;
  const colUnit = 430;
  const colSum = right;
  text(page, 'Pos', colPos, y, 9, bold, gray);
  text(page, 'Beschreibung', colDesc, y, 9, bold, gray);
  textRight('Menge', colQty, y, 9, bold, gray);
  textRight('Einzel (netto)', colUnit, y, 9, bold, gray);
  textRight('Betrag (netto)', colSum, y, 9, bold, gray);
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: gray });
  y -= 16;

  for (const it of items) {
    text(page, String(it.position), colPos, y, 10);
    // Wrap description if long.
    const maxWidth = colQty - colDesc - 60;
    const words = it.description.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, 10) > maxWidth) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (let i = 0; i < lines.length; i++) text(page, lines[i]!, colDesc, y - i * 12, 10);

    textRight(String(it.quantity), colQty, y, 10);
    textRight(money(it.unit_net_cents), colUnit, y, 10);
    textRight(money(it.net_cents), colSum, y, 10);
    y -= Math.max(18, lines.length * 12 + 6);
  }

  page.drawLine({ start: { x: left, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: gray });
  y -= 8;

  // --- Totals ---
  const totalsLabelX = right - 200;
  const totalRow = (label: string, value: string, boldRow = false) => {
    text(page, label, totalsLabelX, y, 10, boldRow ? bold : font);
    textRight(value, right, y, 10, boldRow ? bold : font);
    y -= 16;
  };
  totalRow('Nettobetrag', money(invoice.net_cents));
  if (!settings.small_business) {
    totalRow(`zzgl. ${invoice.tax_rate}% USt`, money(invoice.tax_cents));
  }
  y -= 2;
  page.drawLine({ start: { x: totalsLabelX, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.5, color: gray });
  totalRow('Gesamtbetrag', money(invoice.gross_cents), true);
  y -= 12;

  // --- Notes ---
  if (settings.small_business) {
    text(page, 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet.', left, y, 9, font, gray);
    y -= 16;
  }
  text(page, settings.payment_terms_text || 'Zahlbar sofort ohne Abzug.', left, y, 10);
  y -= 16;

  if (invoice.payment_method === 'sepa' && membership?.debtor_iban) {
    const mand = membership.mandate_reference ? `, Mandat ${membership.mandate_reference}` : '';
    text(
      page,
      `Der Betrag wird per SEPA-Lastschrift von IBAN ${membership.debtor_iban} eingezogen${mand}.`,
      left,
      y,
      9,
      font,
      gray,
    );
    y -= 14;
  } else if (settings.iban) {
    text(
      page,
      `Bitte überweisen Sie auf: ${settings.bank_name ?? ''} · IBAN ${settings.iban} · BIC ${settings.bic ?? ''}`,
      left,
      y,
      9,
      font,
      gray,
    );
    y -= 14;
  }

  // --- Footer (fixed at bottom) ---
  const footerY = 60;
  page.drawLine({ start: { x: left, y: footerY + 26 }, end: { x: right, y: footerY + 26 }, thickness: 0.5, color: gray });
  const footerCols = [
    [settings.company_name, settings.address_line1, `${settings.postal_code ?? ''} ${settings.city ?? ''}`],
    [
      settings.vat_id ? `USt-IdNr.: ${settings.vat_id}` : '',
      settings.tax_number ? `Steuernr.: ${settings.tax_number}` : '',
      settings.creditor_id ? `Gläubiger-ID: ${settings.creditor_id}` : '',
    ],
    [
      settings.bank_name ?? '',
      settings.iban ? `IBAN ${settings.iban}` : '',
      settings.bic ? `BIC ${settings.bic}` : '',
    ],
  ];
  const colW = (right - left) / 3;
  footerCols.forEach((lines, i) => {
    const x = left + i * colW;
    lines.filter(Boolean).forEach((l, j) => text(page, l as string, x, footerY + 12 - j * 10, 7, font, gray));
  });
  if (settings.invoice_footer) {
    text(page, settings.invoice_footer, left, footerY - 22, 7, font, gray);
  }

  return doc.save();
}

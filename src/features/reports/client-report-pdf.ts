import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ClientMonthReport } from './report-data';

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Renders a German monthly client report PDF and returns the raw bytes. */
export async function renderClientReportPdf(
  report: ClientMonthReport,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  let page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;
  let y = height - 60;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < 60) {
      page = doc.addPage([595.28, 841.89]);
      y = height - 60;
    }
  };
  const text = (
    s: string,
    x: number,
    yy: number,
    size = 10,
    f: PDFFont = font,
    color = black,
    p: PDFPage = page,
  ) => p.drawText(s ?? '', { x, y: yy, size, font: f, color });

  // Header
  text('Monatsreport', left, y, 20, bold);
  y -= 24;
  text(report.companyName || '—', left, y, 13, bold);
  text(report.monthLabel, right - bold.widthOfTextAtSize(report.monthLabel, 12), y, 12, bold, gray);
  y -= 30;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 26;

  // Completed tasks
  text('Erledigte Aufgaben', left, y, 13, bold);
  text(String(report.completed.length), right - 20, y, 13, bold, gray);
  y -= 20;
  if (report.completed.length === 0) {
    text('Keine abgeschlossenen Aufgaben in diesem Zeitraum.', left, y, 10, font, gray);
    y -= 18;
  } else {
    for (const t of report.completed) {
      newPageIfNeeded(16);
      const line = `• ${t.title}`;
      text(line.slice(0, 90), left, y, 10);
      const meta = `${t.projectName} · ${t.date.split('-').reverse().join('.')}`;
      text(meta, right - font.widthOfTextAtSize(meta, 8), y, 8, font, gray);
      y -= 15;
    }
  }
  y -= 16;

  // Time summary
  newPageIfNeeded(60);
  text('Geleistete Zeit', left, y, 13, bold);
  text(hoursLabel(report.totalMinutes), right - font.widthOfTextAtSize(hoursLabel(report.totalMinutes), 13), y, 13, bold, gray);
  y -= 20;
  if (report.timeByProject.length === 0) {
    text('Keine erfasste Zeit in diesem Zeitraum.', left, y, 10, font, gray);
    y -= 18;
  } else {
    for (const p of report.timeByProject) {
      newPageIfNeeded(16);
      text(`• ${p.projectName}`.slice(0, 70), left, y, 10);
      const h = hoursLabel(p.minutes);
      text(h, right - font.widthOfTextAtSize(h, 10), y, 10, font, gray);
      y -= 15;
    }
  }

  // Footer
  text(
    `Erstellt am ${new Date().toLocaleDateString('de-DE')} · Supevo`,
    left,
    40,
    8,
    font,
    gray,
  );

  return doc.save();
}

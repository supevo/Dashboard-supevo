import { NextResponse } from 'next/server';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listPrintExpenses } from '@/features/print-billing/queries';

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV export of print expenses for the accountant. Super-admin only. */
export async function GET() {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) return new NextResponse(null, { status: 403 });

  const expenses = await listPrintExpenses(orgId);
  const header = [
    'Datum',
    'Kunde',
    'Aufgabe',
    'Dienstleister',
    'Betrag (EUR)',
    'Hochgeladen von',
    'Datei',
  ];
  const rows = expenses.map((e) =>
    [
      new Date(e.createdAt).toLocaleDateString('de-DE'),
      e.clientName ?? '',
      e.taskTitle ?? '',
      e.supplier ?? '',
      e.amountCents != null ? (e.amountCents / 100).toFixed(2).replace('.', ',') : '',
      e.uploadedByName ?? '',
      e.fileName,
    ]
      .map(csvCell)
      .join(';'),
  );
  // BOM so Excel reads UTF-8 umlauts correctly.
  const csv = '﻿' + [header.map(csvCell).join(';'), ...rows].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ausgaben-drucksachen.csv"`,
    },
  });
}

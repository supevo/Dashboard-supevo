'use client';

import { useMemo, useState } from 'react';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** Client-side month picker that links to the report PDF route for download. */
export function MonthlyReport({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const now = new Date();
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let i = 0; i < 12; i++) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      out.push({
        value: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} ${y}`,
      });
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return out;
  }, [now]);

  const [month, setMonth] = useState(options[0]?.value ?? '');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{de.report.hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-auto"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <a
          href={`/api/reports/client/${clientCompanyId}?month=${month}`}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {de.report.download}
        </a>
      </div>
    </div>
  );
}

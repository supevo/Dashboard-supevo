'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Year + month picker for the Umsätze/Belege lists. month 0 = "Alle" (whole
 * year). basePath already carries the tab + firma; we append jahr & monat.
 */
export function MonthSwitcher({
  year,
  month,
  years,
  basePath,
}: {
  year: number;
  month: number;
  years: number[];
  basePath: string;
}) {
  const router = useRouter();
  const go = (y: number, m: number) =>
    router.push(`${basePath}&jahr=${y}&monat=${m}`);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(year)}
        onChange={(e) => go(Number(e.target.value), month)}
        className="h-9 w-auto"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <Select
        value={String(month)}
        onChange={(e) => go(year, Number(e.target.value))}
        className="h-9 w-auto"
      >
        <option value="0">Alle Monate</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </Select>
    </div>
  );
}

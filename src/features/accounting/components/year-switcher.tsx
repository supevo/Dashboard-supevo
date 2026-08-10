'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

/** Year picker that keeps the current company (basePath already carries firma). */
export function YearSwitcher({
  year,
  years,
  basePath,
}: {
  year: number;
  years: number[];
  basePath: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Jahr:</span>
      <Select
        value={String(year)}
        onChange={(e) => {
          router.push(`${basePath}&jahr=${e.target.value}`);
          router.refresh();
        }}
        className="h-9 w-auto"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}

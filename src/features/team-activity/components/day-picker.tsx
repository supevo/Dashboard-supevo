'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

/**
 * Date input that reloads the team-activity timeline for the chosen day.
 * `hrefPrefix` is the URL up to (and including) the `day=` param so the picker
 * can live under different routes (e.g. Team-Radar) and preserve the active tab.
 */
export function DayPicker({
  day,
  max,
  hrefPrefix = '/app/workload?day=',
}: {
  day: string;
  max: string;
  hrefPrefix?: string;
}) {
  const router = useRouter();
  return (
    <Input
      type="date"
      value={day}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        if (v) router.push(`${hrefPrefix}${v}`);
      }}
      className="h-9 w-auto"
      aria-label="Tag auswählen"
    />
  );
}

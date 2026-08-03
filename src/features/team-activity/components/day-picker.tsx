'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

/** Date input that reloads the team-activity timeline for the chosen day. */
export function DayPicker({ day, max }: { day: string; max: string }) {
  const router = useRouter();
  return (
    <Input
      type="date"
      value={day}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        if (v) router.push(`/app/workload?day=${v}`);
      }}
      className="h-9 w-auto"
      aria-label="Tag auswählen"
    />
  );
}

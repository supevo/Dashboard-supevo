'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

export type ArtFilter = 'alle' | 'einnahmen' | 'ausgaben';

export function parseArt(v: string | undefined): ArtFilter {
  return v === 'einnahmen' || v === 'ausgaben' ? v : 'alle';
}

/** Einnahmen/Ausgaben filter. basePath already carries tab (+ firma etc.). */
export function KindFilter({
  value,
  basePath,
}: {
  value: ArtFilter;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <Select
      value={value}
      onChange={(e) => router.push(`${basePath}&art=${e.target.value}`)}
      className="h-9 w-auto"
      aria-label="Einnahmen / Ausgaben"
    >
      <option value="alle">Alle</option>
      <option value="einnahmen">⬆️ Nur Einnahmen</option>
      <option value="ausgaben">⬇️ Nur Ausgaben</option>
    </Select>
  );
}

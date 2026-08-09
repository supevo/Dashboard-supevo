'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

export interface CompanyOption {
  id: string;
  label: string;
  isDefault: boolean;
}

/**
 * Firma-Umschalter: switches the active accounting company. Both companies
 * (e.g. supevo GmbH / ONE STEP) live in one system; the switcher scopes every
 * view below to one strictly separated set of books.
 */
export function CompanySwitcher({
  companies,
  activeId,
  basePath,
}: {
  companies: CompanyOption[];
  activeId: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Firma:</span>
      <Select
        value={activeId}
        onChange={(e) =>
          router.push(
            `${basePath}&firma=${encodeURIComponent(e.target.value)}`,
          )
        }
        className="h-9 w-auto min-w-[12rem]"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
            {c.isDefault ? ' · Standard' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

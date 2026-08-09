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
/** Special company id for the consolidated ("all companies") view. */
export const ALL_COMPANIES = '__all__';

export function CompanySwitcher({
  companies,
  activeId,
  basePath,
  allLabel,
}: {
  companies: CompanyOption[];
  activeId: string;
  basePath: string;
  /** When set, adds an "all companies" option (consolidated view). */
  allLabel?: string;
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
        {allLabel && companies.length > 1 && (
          <option value={ALL_COMPANIES}>{allLabel}</option>
        )}
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

import type { HrProfile } from '@/features/hr-profile/queries';

/** Payroll essentials the tax advisor needs; drives the completeness badge. */
const REQUIRED: { key: keyof HrProfile; label: string }[] = [
  { key: 'date_of_birth', label: 'Geburtsdatum' },
  { key: 'address_street', label: 'Straße' },
  { key: 'address_zip', label: 'PLZ' },
  { key: 'address_city', label: 'Ort' },
  { key: 'tax_id', label: 'Steuer-ID' },
  { key: 'social_security_number', label: 'Sozialversicherungsnummer' },
  { key: 'health_insurance', label: 'Krankenkasse' },
  { key: 'iban', label: 'IBAN' },
];

export interface HrCompleteness {
  complete: boolean;
  missing: string[]; // labels of empty required fields
  filled: number;
  total: number;
}

/** Which payroll essentials are still missing on an HR profile (null = none yet). */
export function hrCompleteness(profile: HrProfile | null): HrCompleteness {
  const missing = REQUIRED.filter((f) => {
    const v = profile ? profile[f.key] : null;
    return v === null || v === undefined || v === '';
  }).map((f) => f.label);
  return {
    complete: missing.length === 0,
    missing,
    filled: REQUIRED.length - missing.length,
    total: REQUIRED.length,
  };
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const TAX_CLASSES = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

/** Trimmed string, empty → undefined (so `.optional()` treats it as absent). */
const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const hrSchema = z.object({
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  place_of_birth: optText(120),
  nationality: optText(80),
  marital_status: optText(40),
  private_phone: optText(40),
  address_street: optText(120),
  address_house_no: optText(20),
  address_zip: optText(10),
  address_city: optText(80),
  address_country: optText(80),
  tax_id: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => v === '' || /^\d{11}$/.test(v), 'Steuer-ID muss 11 Ziffern haben.')
    .transform((v) => (v ? v : undefined))
    .optional(),
  tax_class: z
    .enum(TAX_CLASSES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  child_allowances: z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.'))
    .refine((v) => v === '' || !Number.isNaN(Number(v)), 'Ungültige Zahl.')
    .transform((v) => (v ? Number(v) : undefined))
    .optional(),
  religious_affiliation: optText(60),
  social_security_number: optText(40),
  health_insurance: optText(120),
  severely_disabled: z
    .union([z.literal('on'), z.literal('')])
    .optional()
    .transform((v) => v === 'on'),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine(
      (v) => v === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v),
      'Ungültige IBAN.',
    )
    .transform((v) => (v ? v : undefined))
    .optional(),
  bic: optText(20),
  account_holder: optText(120),
  notes: optText(1000),
});

/**
 * Upserts the current user's own HR/payroll profile. Employees maintain this
 * themselves; RLS guarantees they can only touch their own row.
 */
export async function updateHrProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);

  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const parsed = hrSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return errorResult(first ?? de.errors.VALIDATION);
  }
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('employee_hr_profiles').upsert(
    {
      user_id: user.id,
      organization_id: orgId,
      date_of_birth: v.date_of_birth ?? null,
      place_of_birth: v.place_of_birth ?? null,
      nationality: v.nationality ?? null,
      marital_status: v.marital_status ?? null,
      private_phone: v.private_phone ?? null,
      address_street: v.address_street ?? null,
      address_house_no: v.address_house_no ?? null,
      address_zip: v.address_zip ?? null,
      address_city: v.address_city ?? null,
      address_country: v.address_country ?? null,
      tax_id: v.tax_id ?? null,
      tax_class: v.tax_class ?? null,
      child_allowances: v.child_allowances ?? null,
      religious_affiliation: v.religious_affiliation ?? null,
      social_security_number: v.social_security_number ?? null,
      health_insurance: v.health_insurance ?? null,
      severely_disabled: v.severely_disabled,
      iban: v.iban ?? null,
      bic: v.bic ?? null,
      account_holder: v.account_holder ?? null,
      notes: v.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/profile');
  return successResult('Personaldaten gespeichert.');
}

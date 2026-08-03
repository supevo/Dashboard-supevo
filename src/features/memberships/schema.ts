import { z } from 'zod';
import { APP_ROLES } from '@/lib/authz/roles';

export const changeRoleSchema = z.object({
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  nextRole: z.enum(APP_ROLES).refine((r) => r !== 'super_admin', {
    message: 'Diese Rolle kann nicht über die Oberfläche vergeben werden.',
  }),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const memberTargetSchema = z.object({
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});

export const weeklyTargetSchema = z.object({
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  // Empty string clears (falls back to the default); otherwise 0–80 hours.
  weeklyHours: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{1,3}([.,]\d{1,2})?$/.test(v) && Number(v.replace(',', '.')) <= 80),
      'Bitte 0–80 Stunden angeben.',
    ),
});

export const joinDateSchema = z.object({
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  // Empty string clears the date; otherwise expect an ISO date (YYYY-MM-DD).
  joinedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.')
    .or(z.literal('')),
});

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

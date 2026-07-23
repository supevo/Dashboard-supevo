import { z } from 'zod';
import { APP_ROLES } from '@/lib/authz/roles';

/** Roles that may be invited through the UI (super_admin is never allowed). */
export const INVITABLE_ROLES = APP_ROLES.filter(
  (r) => r !== 'super_admin',
) as Exclude<(typeof APP_ROLES)[number], 'super_admin'>[];

export const createInvitationSchema = z
  .object({
    orgId: z.string().uuid(),
    email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein.'),
    role: z.enum(APP_ROLES).refine((r) => r !== 'super_admin', {
      message: 'Diese Rolle kann nicht per Einladung vergeben werden.',
    }),
    clientCompanyId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      // Client/guest invitations must target a client company.
      (data.role !== 'client' && data.role !== 'guest') ||
      (data.clientCompanyId && data.clientCompanyId.length > 0),
    {
      message: 'Für Kundenrollen muss ein Kundenunternehmen gewählt werden.',
      path: ['clientCompanyId'],
    },
  );
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationIdSchema = z.object({
  invitationId: z.string().uuid(),
  orgId: z.string().uuid(),
});

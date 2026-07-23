import { z } from 'zod';

export const updateOrganizationSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(2, 'Bitte gib einen Namen ein.').max(160),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

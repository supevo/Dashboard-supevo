import { z } from 'zod';

export const createClientCompanySchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(2, 'Bitte gib einen Namen ein.').max(160),
  contactEmail: z
    .string()
    .email('Ungültige E-Mail-Adresse.')
    .optional()
    .or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
export type CreateClientCompanyInput = z.infer<
  typeof createClientCompanySchema
>;

export const updateClientCompanySchema = createClientCompanySchema.extend({
  clientCompanyId: z.string().uuid(),
  isActive: z.enum(['true', 'false']).optional(),
});

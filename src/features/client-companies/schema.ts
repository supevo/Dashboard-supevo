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
  // supevo (Stage 1/2) oder legacy (Modul-Baukasten). Steuert is_legacy und die
  // Mitgliedschafts-Ansicht im Wizard/Portal.
  customerType: z.enum(['supevo', 'legacy']).optional(),
  // Rechnungssteller (hinterlegte Firma, z. B. supevo oder ONE STEP), unter dem
  // der Kunde abgerechnet wird. Leer = Standard-Rechnungssteller der Org.
  billingEntityId: z.string().uuid().optional().or(z.literal('')),
});
export type CreateClientCompanyInput = z.infer<
  typeof createClientCompanySchema
>;

export const updateClientCompanySchema = createClientCompanySchema.extend({
  clientCompanyId: z.string().uuid(),
  isActive: z.enum(['true', 'false']).optional(),
});

import { z } from 'zod';

export const createProjectSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid('Bitte wähle ein Kundenunternehmen.'),
  name: z.string().min(2, 'Bitte gib einen Projektnamen ein.').max(160),
  description: z.string().max(4000).optional().or(z.literal('')),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2).max(160),
  description: z.string().max(4000).optional().or(z.literal('')),
  status: z.enum(['planned', 'active', 'on_hold', 'completed', 'archived']),
  isClientVisible: z.enum(['true', 'false']),
});

export const archiveProjectSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
});

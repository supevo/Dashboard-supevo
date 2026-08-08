import { z } from 'zod';

export const PAGE_STATUSES = ['draft', 'ready', 'used', 'archived'] as const;
export type ClientPageStatus = (typeof PAGE_STATUSES)[number];

export const createClientPageSchema = z.object({
  clientCompanyId: z.string().uuid(),
  title: z.string().trim().min(1, 'Bitte gib einen Titel ein.').max(200),
  isFolder: z.enum(['true', 'false']).default('false'),
  parentId: z.string().uuid().optional().or(z.literal('')),
});

export const updateClientPageSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Bitte gib einen Titel ein.').max(200),
  content: z.string().max(200000).optional().or(z.literal('')),
  status: z.enum(PAGE_STATUSES),
});

export const deleteClientPageSchema = z.object({
  id: z.string().uuid(),
});

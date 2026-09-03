import { z } from 'zod';

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1, 'Bitte gib einen Titel ein.').max(200),
  description: z.string().max(20000).optional().or(z.literal('')),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  // Standard: neue Board-Aufgaben sind kundensichtbar.
  isInternal: z.enum(['true', 'false']).default('false'),
  // „Idee": unverbindliche Notiz, zählt nicht als Arbeit und ist nie
  // kundensichtbar (intern gespeichert wie archiviert, bis übernommen).
  isIdea: z.enum(['true', 'false']).default('false'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const moveTaskSchema = z.object({
  taskId: z.string().uuid(),
  targetColumnId: z.string().uuid(),
  newPosition: z.coerce.number(),
  expectedLockVersion: z.coerce.number().int().min(0),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const archiveTaskSchema = z.object({
  taskId: z.string().uuid(),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
});

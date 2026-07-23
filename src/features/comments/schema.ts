import { z } from 'zod';

export const addCommentSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  body: z.string().min(1, 'Kommentar darf nicht leer sein.').max(10000),
  isInternal: z.enum(['true', 'false']).default('true'),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const editCommentSchema = z.object({
  commentId: z.string().uuid(),
  body: z.string().min(1).max(10000),
});

export const commentIdSchema = z.object({
  commentId: z.string().uuid(),
});

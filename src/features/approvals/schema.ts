import { z } from 'zod';

export const requestApprovalSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export const decideApprovalSchema = z
  .object({
    approvalId: z.string().uuid(),
    decision: z.enum(['approved', 'changes_requested', 'rejected']),
    comment: z.string().max(2000).optional().or(z.literal('')),
  })
  .refine(
    (d) =>
      d.decision === 'approved' || (d.comment && d.comment.trim().length > 0),
    {
      message: 'Bei Ablehnung oder Änderungswunsch ist ein Kommentar Pflicht.',
      path: ['comment'],
    },
  );

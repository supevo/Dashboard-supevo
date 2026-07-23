import { describe, it, expect } from 'vitest';
import { decideApprovalSchema } from '@/features/approvals/schema';

const id = '11111111-2222-3333-4444-555555555555';

describe('decideApprovalSchema', () => {
  it('allows approval without a comment', () => {
    const r = decideApprovalSchema.safeParse({
      approvalId: id,
      decision: 'approved',
      comment: '',
    });
    expect(r.success).toBe(true);
  });

  it('requires a comment when requesting changes', () => {
    const r = decideApprovalSchema.safeParse({
      approvalId: id,
      decision: 'changes_requested',
      comment: '',
    });
    expect(r.success).toBe(false);
  });

  it('requires a comment when rejecting', () => {
    const r = decideApprovalSchema.safeParse({
      approvalId: id,
      decision: 'rejected',
      comment: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a rejection with a comment', () => {
    const r = decideApprovalSchema.safeParse({
      approvalId: id,
      decision: 'rejected',
      comment: 'Bitte Farben anpassen.',
    });
    expect(r.success).toBe(true);
  });
});

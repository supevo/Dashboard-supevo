import { describe, it, expect } from 'vitest';
import { isInvitationUsable } from '@/features/invitations/validity';

const NOW = new Date('2026-07-23T12:00:00Z').getTime();
const future = new Date('2026-07-30T12:00:00Z').toISOString();
const past = new Date('2026-07-20T12:00:00Z').toISOString();

describe('isInvitationUsable', () => {
  it('accepts a fresh, unexpired invitation', () => {
    expect(
      isInvitationUsable(
        { accepted_at: null, revoked_at: null, expires_at: future },
        NOW,
      ),
    ).toBe(true);
  });

  it('rejects an expired invitation', () => {
    expect(
      isInvitationUsable(
        { accepted_at: null, revoked_at: null, expires_at: past },
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects an already accepted invitation', () => {
    expect(
      isInvitationUsable(
        { accepted_at: past, revoked_at: null, expires_at: future },
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a revoked invitation', () => {
    expect(
      isInvitationUsable(
        { accepted_at: null, revoked_at: past, expires_at: future },
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a missing invitation', () => {
    expect(isInvitationUsable(null, NOW)).toBe(false);
  });
});

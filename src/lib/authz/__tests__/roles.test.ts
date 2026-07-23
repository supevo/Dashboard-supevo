import { describe, it, expect } from 'vitest';
import {
  canAssignRole,
  canSeeInternal,
  isAgencyRole,
  isExternalRole,
  assignableRoles,
} from '@/lib/authz/roles';

describe('roles – classification', () => {
  it('marks agency roles correctly', () => {
    expect(isAgencyRole('agency_admin')).toBe(true);
    expect(isAgencyRole('employee')).toBe(true);
    expect(isAgencyRole('client')).toBe(false);
  });

  it('marks external roles correctly', () => {
    expect(isExternalRole('client')).toBe(true);
    expect(isExternalRole('guest')).toBe(true);
    expect(isExternalRole('employee')).toBe(false);
  });

  it('allows only agency/super to see internal data', () => {
    expect(canSeeInternal('super_admin')).toBe(true);
    expect(canSeeInternal('project_manager')).toBe(true);
    expect(canSeeInternal('freelancer')).toBe(true);
    expect(canSeeInternal('client')).toBe(false);
    expect(canSeeInternal('guest')).toBe(false);
  });
});

describe('roles – assignment rules', () => {
  const granter = 'granter-id';
  const target = 'target-id';

  it('never allows assigning super_admin via the app', () => {
    expect(
      canAssignRole({
        granterRole: 'super_admin',
        granterUserId: granter,
        targetUserId: target,
        nextRole: 'super_admin',
      }),
    ).toBe(false);
    expect(assignableRoles('super_admin')).not.toContain('super_admin');
  });

  it('prevents self role changes (no self-escalation)', () => {
    expect(
      canAssignRole({
        granterRole: 'agency_admin',
        granterUserId: granter,
        targetUserId: granter,
        nextRole: 'agency_admin',
      }),
    ).toBe(false);
  });

  it('lets an agency admin assign up to agency_admin', () => {
    expect(
      canAssignRole({
        granterRole: 'agency_admin',
        granterUserId: granter,
        targetUserId: target,
        nextRole: 'project_manager',
      }),
    ).toBe(true);
    expect(
      canAssignRole({
        granterRole: 'agency_admin',
        granterUserId: granter,
        targetUserId: target,
        nextRole: 'agency_admin',
      }),
    ).toBe(true);
  });

  it('does not let non-admins assign any role', () => {
    for (const role of ['project_manager', 'employee', 'freelancer', 'client'] as const) {
      expect(
        canAssignRole({
          granterRole: role,
          granterUserId: granter,
          targetUserId: target,
          nextRole: 'employee',
        }),
      ).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { can, isOrgAdmin, roleInOrg } from '@/lib/authz/policies';
import type { CurrentUser } from '@/features/auth/access';
import type { AppRole } from '@/lib/authz/roles';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

function user(
  id: string,
  memberships: { org: string; role: AppRole }[],
): CurrentUser {
  return {
    id,
    email: `${id}@example.com`,
    fullName: null,
    memberships: memberships.map((m) => ({
      organizationId: m.org,
      role: m.role,
      status: 'active',
    })),
  };
}

describe('can – foreign organization access', () => {
  it('denies actions in an organization the user is not a member of', () => {
    const admin = user('u1', [{ org: ORG_A, role: 'agency_admin' }]);
    expect(can(admin, { type: 'member.invite', orgId: ORG_B })).toBe(false);
    expect(can(admin, { type: 'clientCompany.manage', orgId: ORG_B })).toBe(
      false,
    );
    expect(roleInOrg(admin, ORG_B)).toBeNull();
  });
});

describe('can – illegal role changes', () => {
  const admin = user('admin', [{ org: ORG_A, role: 'agency_admin' }]);

  it('never allows granting super_admin', () => {
    expect(
      can(admin, {
        type: 'member.changeRole',
        orgId: ORG_A,
        targetUserId: 'target',
        nextRole: 'super_admin',
      }),
    ).toBe(false);
  });

  it('forbids raising your own rights (self change)', () => {
    expect(
      can(admin, {
        type: 'member.changeRole',
        orgId: ORG_A,
        targetUserId: 'admin',
        nextRole: 'agency_admin',
      }),
    ).toBe(false);
  });

  it('forbids non-admins from changing roles', () => {
    const employee = user('e', [{ org: ORG_A, role: 'employee' }]);
    expect(
      can(employee, {
        type: 'member.changeRole',
        orgId: ORG_A,
        targetUserId: 'target',
        nextRole: 'project_manager',
      }),
    ).toBe(false);
  });

  it('allows an admin to change another member to a normal role', () => {
    expect(
      can(admin, {
        type: 'member.changeRole',
        orgId: ORG_A,
        targetUserId: 'target',
        nextRole: 'project_manager',
      }),
    ).toBe(true);
  });
});

describe('can – client isolation', () => {
  it('does not let a client manage companies or members', () => {
    const client = user('c', [{ org: ORG_A, role: 'client' }]);
    expect(can(client, { type: 'clientCompany.manage', orgId: ORG_A })).toBe(
      false,
    );
    expect(can(client, { type: 'member.invite', orgId: ORG_A })).toBe(false);
    expect(can(client, { type: 'member.list', orgId: ORG_A })).toBe(false);
  });
});

describe('can – deactivation', () => {
  const admin = user('admin', [{ org: ORG_A, role: 'agency_admin' }]);

  it('lets an admin deactivate others but not themselves', () => {
    expect(
      can(admin, {
        type: 'member.deactivate',
        orgId: ORG_A,
        targetUserId: 'other',
      }),
    ).toBe(true);
    expect(
      can(admin, {
        type: 'member.deactivate',
        orgId: ORG_A,
        targetUserId: 'admin',
      }),
    ).toBe(false);
  });
});

describe('can – multi-organization membership', () => {
  it('applies the role of the specific organization', () => {
    const multi = user('m', [
      { org: ORG_A, role: 'agency_admin' },
      { org: ORG_B, role: 'employee' },
    ]);
    expect(isOrgAdmin(multi, ORG_A)).toBe(true);
    expect(isOrgAdmin(multi, ORG_B)).toBe(false);
    expect(can(multi, { type: 'organization.update', orgId: ORG_A })).toBe(true);
    expect(can(multi, { type: 'organization.update', orgId: ORG_B })).toBe(
      false,
    );
  });
});

describe('can – super admin', () => {
  it('is treated as admin across organizations', () => {
    const su = user('s', [{ org: ORG_A, role: 'super_admin' }]);
    expect(can(su, { type: 'organization.update', orgId: ORG_B })).toBe(true);
    // ...but still cannot grant super_admin through the UI.
    expect(
      can(su, {
        type: 'member.changeRole',
        orgId: ORG_A,
        targetUserId: 't',
        nextRole: 'super_admin',
      }),
    ).toBe(false);
  });
});

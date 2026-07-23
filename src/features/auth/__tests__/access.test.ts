import { describe, it, expect } from 'vitest';
import {
  hasAgencyAccess,
  hasClientAccess,
  landingPathFor,
  type CurrentUser,
} from '@/features/auth/access';

function userWith(roles: CurrentUser['memberships'][number]['role'][]): CurrentUser {
  return {
    id: 'u1',
    email: 'u1@example.com',
    fullName: null,
    memberships: roles.map((role) => ({
      organizationId: 'org1',
      role,
      status: 'active',
    })),
  };
}

describe('access derivation', () => {
  it('routes agency staff to /app', () => {
    const user = userWith(['employee']);
    expect(hasAgencyAccess(user)).toBe(true);
    expect(landingPathFor(user)).toBe('/app');
  });

  it('routes clients to /portal', () => {
    const user = userWith(['client']);
    expect(hasClientAccess(user)).toBe(true);
    expect(landingPathFor(user)).toBe('/portal');
  });

  it('prefers the agency area when a user has both roles', () => {
    const user = userWith(['agency_admin', 'client']);
    expect(landingPathFor(user)).toBe('/app');
  });

  it('sends users without memberships to /no-access', () => {
    const user = userWith([]);
    expect(landingPathFor(user)).toBe('/no-access');
  });
});

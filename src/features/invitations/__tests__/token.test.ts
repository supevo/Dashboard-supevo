import { describe, it, expect } from 'vitest';
import {
  generateInviteToken,
  hashInviteToken,
  tokenHashesMatch,
} from '@/features/invitations/token';

describe('invitation tokens', () => {
  it('generates distinct URL-safe tokens', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });

  it('hashes deterministically and hides the raw token', () => {
    const raw = 'my-secret-token-value';
    const h1 = hashInviteToken(raw);
    const h2 = hashInviteToken(raw);
    expect(h1).toBe(h2);
    expect(h1).not.toContain(raw);
    expect(h1).toHaveLength(64); // sha256 hex
  });

  it('matches equal hashes and rejects different ones', () => {
    const h = hashInviteToken('token-a');
    expect(tokenHashesMatch(h, hashInviteToken('token-a'))).toBe(true);
    expect(tokenHashesMatch(h, hashInviteToken('token-b'))).toBe(false);
  });
});

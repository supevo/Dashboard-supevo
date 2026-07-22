import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '@/features/auth/schema';

describe('loginSchema', () => {
  it('accepts a valid credentials pair', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'secret',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'nope', password: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenoughpw',
      confirmPassword: 'different-pw',
    });
    expect(result.success).toBe(false);
  });

  it('rejects passwords that are too short', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid matching password', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'a-strong-password',
      confirmPassword: 'a-strong-password',
    });
    expect(result.success).toBe(true);
  });
});

describe('acceptInviteSchema', () => {
  it('requires a token, name and matching password', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'x'.repeat(24),
      fullName: 'Erika Muster',
      password: 'a-strong-password',
      confirmPassword: 'a-strong-password',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a short token', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'short',
      fullName: 'Erika Muster',
      password: 'a-strong-password',
      confirmPassword: 'a-strong-password',
    });
    expect(result.success).toBe(false);
  });
});

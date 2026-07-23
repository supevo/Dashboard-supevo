import { describe, it, expect } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  it('allows up to the limit then blocks within the window', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks separate keys independently', () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).allowed).toBe(true);
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    const key = `reset:${Math.random()}`;
    expect(rateLimit(key, 1, 1).allowed).toBe(true);
    // Window of 1ms has passed by the next tick.
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(rateLimit(key, 1, 1).allowed).toBe(true);
        resolve(undefined);
      }, 5);
    });
  });
});

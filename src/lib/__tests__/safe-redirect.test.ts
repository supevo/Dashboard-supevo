import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '@/lib/safe-redirect';

describe('safeRedirectPath', () => {
  it('accepts internal relative paths', () => {
    expect(safeRedirectPath('/app/projects')).toBe('/app/projects');
    expect(safeRedirectPath('/portal')).toBe('/portal');
  });

  it('rejects absolute URLs', () => {
    expect(safeRedirectPath('https://evil.com', '/app')).toBe('/app');
    expect(safeRedirectPath('http://evil.com')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.com', '/app')).toBe('/app');
  });

  it('rejects backslash and whitespace tricks', () => {
    expect(safeRedirectPath('/\\evil.com', '/app')).toBe('/app');
    expect(safeRedirectPath('/foo\tbar', '/app')).toBe('/app');
  });

  it('falls back on empty/nullish input', () => {
    expect(safeRedirectPath(null, '/app')).toBe('/app');
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath('')).toBe('/');
  });
});

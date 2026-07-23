import { describe, it, expect } from 'vitest';
import { sanitizeRichText, extractMentionUserIds } from '@/lib/sanitize';

describe('sanitizeRichText', () => {
  it('removes script tags and event handlers (XSS)', () => {
    const dirty = '<p>Hallo</p><script>alert(1)</script>';
    const clean = sanitizeRichText(dirty);
    expect(clean).toContain('<p>Hallo</p>');
    expect(clean).not.toContain('script');
  });

  it('strips javascript: URLs from links', () => {
    const clean = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toContain('javascript:');
  });

  it('keeps allowed formatting tags', () => {
    const clean = sanitizeRichText('<strong>bold</strong> <em>it</em>');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).toContain('<em>it</em>');
  });

  it('adds rel/target to links', () => {
    const clean = sanitizeRichText('<a href="https://example.com">x</a>');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('extractMentionUserIds', () => {
  it('extracts uuids from @[Name](uuid) mentions', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const ids = extractMentionUserIds(`Hallo @[Erika](${id}) bitte prüfen`);
    expect(ids).toEqual([id]);
  });

  it('deduplicates and ignores malformed mentions', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const ids = extractMentionUserIds(`@[A](${id}) @[B](${id}) @[C](nope)`);
    expect(ids).toEqual([id]);
  });
});

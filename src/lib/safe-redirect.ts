/**
 * Returns `target` only if it is a safe, app-internal relative path.
 * Guards against open-redirect attacks: absolute URLs, protocol-relative
 * URLs (`//evil.com`) and backslash tricks are rejected in favour of
 * `fallback`.
 */
export function safeRedirectPath(
  target: string | null | undefined,
  fallback = '/',
): string {
  if (!target) return fallback;
  // Must start with a single slash and not be protocol-relative.
  if (!target.startsWith('/')) return fallback;
  if (target.startsWith('//')) return fallback;
  // Reject whitespace/control characters and backslash tricks.
  if (/\s/.test(target)) return fallback;
  if (target.includes('\\')) return fallback;
  return target;
}

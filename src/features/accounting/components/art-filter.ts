/**
 * Server-safe helpers for the Einnahmen/Ausgaben filter. Kept OUT of the
 * 'use client' component file so Server Components (e.g. the Finanzen page) can
 * call `parseArt` during render – exports of a 'use client' module become client
 * references and cannot be invoked on the server.
 */

export type ArtFilter = 'alle' | 'einnahmen' | 'ausgaben';

export function parseArt(v: string | undefined): ArtFilter {
  return v === 'einnahmen' || v === 'ausgaben' ? v : 'alle';
}

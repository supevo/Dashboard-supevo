/**
 * Central design-brand switch.
 *
 * 'classic' → the original blue theme.
 * 'supevo'  → the warm Supevo look (Aurora-Verläufe, Greige-Grund, große Radien).
 *
 * Umschalten = NUR diese eine Zeile ändern. Die Marke wird als `data-brand` auf
 * <html> gesetzt; die konkreten Farben/Radien liegen als Token-Override in
 * globals.css (`[data-brand="supevo"]`). Nichts anderes muss angefasst werden –
 * jederzeit gefahrlos zurückschaltbar.
 */
export type Brand = 'classic' | 'supevo';

/** Default when no per-browser choice (cookie) is set. */
export const ACTIVE_BRAND: Brand = 'supevo';

/** Cookie that lets an admin switch the look live from the settings page. */
export const BRAND_COOKIE = 'supevo-brand';

export function isBrand(v: unknown): v is Brand {
  return v === 'classic' || v === 'supevo';
}

/** Resolves the effective brand from a (possibly missing) cookie value. */
export function resolveBrand(cookieValue: string | undefined | null): Brand {
  return isBrand(cookieValue) ? cookieValue : ACTIVE_BRAND;
}

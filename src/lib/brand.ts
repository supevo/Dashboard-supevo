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

export const ACTIVE_BRAND: Brand = 'supevo';

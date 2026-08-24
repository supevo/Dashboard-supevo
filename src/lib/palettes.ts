/**
 * Wählbare Farbpaletten für das Dashboard. Die eigentlichen Farben liegen als
 * Token-Overrides in globals.css (`:root[data-palette='…']`); hier stehen nur
 * die Metadaten für den Picker (Label, Beschreibung, Vorschau-Farben).
 *
 * Neue Palette hinzufügen = einen Eintrag hier ergänzen UND den passenden
 * `:root[data-palette='…']`-Block (hell + dunkel) in globals.css anlegen.
 */

export type PaletteId =
  | 'default'
  | 'midnight'
  | 'ember'
  | 'mono'
  | 'forest'
  | 'ocean'
  | 'slate'
  | 'cyberpunk';

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  description: string;
  /** Vorschau-Farben (Kartengrund, Text, Akzent) als CSS-Farbwerte. */
  swatch: { bg: string; fg: string; accent: string };
}

export const PALETTES: PaletteMeta[] = [
  {
    id: 'default',
    label: 'supevo',
    description: 'Der Hauszauber – warmes Greige mit Violett (Standard)',
    swatch: { bg: 'hsl(20 13% 91%)', fg: 'hsl(265 12% 9%)', accent: 'hsl(262 83% 58%)' },
  },
  {
    id: 'midnight',
    label: 'Arkanum',
    description: 'Tiefes Blau-Violett – arkane Energie',
    swatch: { bg: 'hsl(245 45% 8%)', fg: 'hsl(240 30% 92%)', accent: 'hsl(250 90% 76%)' },
  },
  {
    id: 'ember',
    label: 'Phönixfeuer',
    description: 'Warmes Crimson & Bronze – lodernd',
    swatch: { bg: 'hsl(12 40% 7%)', fg: 'hsl(25 30% 92%)', accent: 'hsl(8 80% 60%)' },
  },
  {
    id: 'mono',
    label: 'Nebelschleier',
    description: 'Graustufen wie ziehender Nebel – minimal & fokussiert',
    swatch: { bg: 'hsl(0 0% 7%)', fg: 'hsl(0 0% 92%)', accent: 'hsl(0 0% 88%)' },
  },
  {
    id: 'forest',
    label: 'Elfenwald',
    description: 'Tiefes Waldgrün – uralte Magie',
    swatch: { bg: 'hsl(150 30% 7%)', fg: 'hsl(120 20% 92%)', accent: 'hsl(142 65% 55%)' },
  },
  {
    id: 'ocean',
    label: 'Sirenenlied',
    description: 'Türkis & Cyan aus der Tiefe',
    swatch: { bg: 'hsl(200 45% 7%)', fg: 'hsl(195 30% 92%)', accent: 'hsl(187 85% 55%)' },
  },
  {
    id: 'slate',
    label: 'Frostrunen',
    description: 'Kühles Slate-Blau – klare Runen',
    swatch: { bg: 'hsl(217 33% 9%)', fg: 'hsl(215 25% 92%)', accent: 'hsl(213 70% 62%)' },
  },
  {
    id: 'cyberpunk',
    label: 'Koboldfeuer',
    description: 'Neongrün auf Schwarz – Hexenterminal',
    swatch: { bg: 'hsl(130 25% 5%)', fg: 'hsl(120 80% 78%)', accent: 'hsl(135 90% 50%)' },
  },
];

export const PALETTE_STORAGE_KEY = 'palette';

export function isPaletteId(v: unknown): v is PaletteId {
  return PALETTES.some((p) => p.id === v);
}

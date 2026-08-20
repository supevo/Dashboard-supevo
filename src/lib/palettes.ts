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
  | 'slate';

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
    description: 'Warmer Greige-Grund mit Violett-Akzent (Standard)',
    swatch: { bg: 'hsl(20 13% 91%)', fg: 'hsl(265 12% 9%)', accent: 'hsl(262 83% 58%)' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Tiefes Blau-Violett mit kühlen Akzenten',
    swatch: { bg: 'hsl(245 45% 8%)', fg: 'hsl(240 30% 92%)', accent: 'hsl(250 90% 76%)' },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warmes Crimson & Bronze',
    swatch: { bg: 'hsl(12 40% 7%)', fg: 'hsl(25 30% 92%)', accent: 'hsl(8 80% 60%)' },
  },
  {
    id: 'mono',
    label: 'Mono',
    description: 'Klares Graustufen-Design – minimal & fokussiert',
    swatch: { bg: 'hsl(0 0% 7%)', fg: 'hsl(0 0% 92%)', accent: 'hsl(0 0% 88%)' },
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Ruhiges Grün',
    swatch: { bg: 'hsl(150 30% 7%)', fg: 'hsl(120 20% 92%)', accent: 'hsl(142 65% 55%)' },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Frisches Türkis/Cyan',
    swatch: { bg: 'hsl(200 45% 7%)', fg: 'hsl(195 30% 92%)', accent: 'hsl(187 85% 55%)' },
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Kühles Slate-Blau – fokussiert',
    swatch: { bg: 'hsl(217 33% 9%)', fg: 'hsl(215 25% 92%)', accent: 'hsl(213 70% 62%)' },
  },
];

export const PALETTE_STORAGE_KEY = 'palette';

export function isPaletteId(v: unknown): v is PaletteId {
  return PALETTES.some((p) => p.id === v);
}

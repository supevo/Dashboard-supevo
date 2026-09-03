/**
 * Reine Typen & Beschriftungen des GF-Cockpits (Geschäftsführer-Board).
 *
 * Bewusst OHNE `server-only`, damit Client-Komponenten (Board) sie importieren
 * können. Enthält keinerlei I/O.
 */

export type CeoStatus = 'backlog' | 'today' | 'doing' | 'done';

/** Kanban-Spalten in Reihenfolge (Fluss von links nach rechts). */
export const CEO_COLUMNS: { key: CeoStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'today', label: 'Heute' },
  { key: 'doing', label: 'In Arbeit' },
  { key: 'done', label: 'Erledigt' },
];

export const CEO_STATUSES: CeoStatus[] = ['backlog', 'today', 'doing', 'done'];

/** Eisenhower-Quadranten: kurze, handlungsorientierte Beschriftungen. */
export const QUADRANTS: {
  value: 1 | 2 | 3 | 4;
  short: string;
  label: string;
  hint: string;
  /** Tailwind-Klassen für das Badge. */
  badge: string;
}[] = [
  {
    value: 1,
    short: 'Q1',
    label: 'Sofort erledigen',
    hint: 'Wichtig & dringend',
    badge: 'bg-red-500/10 text-red-600 border-red-500/30',
  },
  {
    value: 2,
    short: 'Q2',
    label: 'Fest einplanen',
    hint: 'Wichtig, nicht dringend – dein eigentlicher GF-Job',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  },
  {
    value: 3,
    short: 'Q3',
    label: 'Delegieren',
    hint: 'Dringend, aber nicht wichtig – ans Team abgeben',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
  {
    value: 4,
    short: 'Q4',
    label: 'Streichen',
    hint: 'Weder wichtig noch dringend',
    badge: 'bg-muted text-muted-foreground border-border',
  },
];

export function quadrantMeta(q: number | null | undefined) {
  return QUADRANTS.find((x) => x.value === q) ?? null;
}

export type CeoEnergy = 'deep' | 'shallow';

export const ENERGIES: { value: CeoEnergy; label: string; hint: string }[] = [
  { value: 'deep', label: 'Deep Work', hint: 'Konzentriert – am besten vormittags' },
  { value: 'shallow', label: 'Flach', hint: 'Kleinkram – gebündelt am Nachmittag' },
];

/** Vorschläge für den Bereich (frei überschreibbar). */
export const AREA_SUGGESTIONS = [
  'Vertrieb',
  'Strategie',
  'Finanzen',
  'Team',
  'Marketing',
  'Operativ',
  'Privat',
];

/**
 * Ziel-Fokuszeit pro Tag in Minuten. ~5 h fokussierte Arbeit, der Rest des
 * 8-h-Tages ist Puffer für Meetings, Rückfragen & Kontextwechsel. Der spätere
 * Coach plant gegen genau diesen Wert.
 */
export const FOCUS_TARGET_MIN = 300;

export interface CeoTask {
  id: string;
  title: string;
  notes: string | null;
  status: CeoStatus;
  quadrant: number | null;
  energy: CeoEnergy | null;
  area: string | null;
  estimateMin: number | null;
  dueDate: string | null;
  position: number;
  doneAt: string | null;
  createdAt: string;
}

/** Minuten als "3 h 20 m" / "45 m" formatieren. */
export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return '–';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} m`;
  if (h) return `${h} h`;
  return `${m} m`;
}

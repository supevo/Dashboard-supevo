/**
 * Level-Hub-Titelbilder ("Banner").
 *
 * Freischaltbare Hintergrund-Verläufe, die im Level Hub hinter dem XP-Kreis und
 * dem Profilbild liegen. Bewusst reine CSS-Verläufe (keine Bilddateien): das
 * hält es leicht, funktioniert in Light/Dark und braucht keinen Storage. Jedes
 * Banner wird durch ein Level freigeschaltet – wer das Level erreicht, kann es
 * im Hub auswählen.
 *
 * In der DB steht pro Profil nur der Schlüssel (`profiles.hub_banner`); der
 * konkrete Verlauf lebt hier im Code.
 */

export interface Banner {
  key: string;
  name: string;
  /** CSS-Wert für `background` (Verlauf). */
  gradient: string;
  /** Ab diesem Level auswählbar. */
  unlockLevel: number;
}

/** Standard-Banner – immer verfügbar (Level 0). */
export const DEFAULT_BANNER_KEY = 'aurora';

export const BANNERS: Banner[] = [
  {
    key: 'aurora',
    name: 'Aurora',
    gradient: 'linear-gradient(120deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
    unlockLevel: 0,
  },
  {
    key: 'sunrise',
    name: 'Morgenrot',
    gradient: 'linear-gradient(120deg, #f97316 0%, #f43f5e 55%, #a855f7 100%)',
    unlockLevel: 2,
  },
  {
    key: 'ocean',
    name: 'Tiefsee',
    gradient: 'linear-gradient(120deg, #0ea5e9 0%, #2563eb 55%, #4f46e5 100%)',
    unlockLevel: 4,
  },
  {
    key: 'forest',
    name: 'Waldlichtung',
    gradient: 'linear-gradient(120deg, #10b981 0%, #059669 50%, #0d9488 100%)',
    unlockLevel: 6,
  },
  {
    key: 'ember',
    name: 'Glut',
    gradient: 'linear-gradient(120deg, #f59e0b 0%, #ef4444 55%, #b91c1c 100%)',
    unlockLevel: 8,
  },
  {
    key: 'nebula',
    name: 'Nebel',
    gradient:
      'radial-gradient(circle at 20% 30%, #7c3aed 0%, transparent 45%), radial-gradient(circle at 80% 70%, #db2777 0%, transparent 45%), linear-gradient(120deg, #1e1b4b, #312e81)',
    unlockLevel: 10,
  },
  {
    key: 'gold',
    name: 'Goldrausch',
    gradient: 'linear-gradient(120deg, #fbbf24 0%, #d97706 50%, #92400e 100%)',
    unlockLevel: 15,
  },
  {
    key: 'midnight',
    name: 'Mitternacht',
    gradient:
      'linear-gradient(120deg, #0f172a 0%, #1e293b 45%, #334155 100%)',
    unlockLevel: 20,
  },
];

export const BANNER_BY_KEY = new Map(BANNERS.map((b) => [b.key, b] as const));

/** Verläuft-String für einen Schlüssel (Default, falls unbekannt/gesperrt). */
export function bannerGradient(key: string | null | undefined): string {
  const b = (key && BANNER_BY_KEY.get(key)) || BANNER_BY_KEY.get(DEFAULT_BANNER_KEY)!;
  return b.gradient;
}

/** Ist das (Verlaufs-)Banner beim gegebenen Level freigeschaltet? */
export function isBannerUnlocked(key: string, level: number): boolean {
  const b = BANNER_BY_KEY.get(key);
  return Boolean(b && level >= b.unlockLevel);
}

// --- Hochgeladene Bild-Titelbilder -----------------------------------------

const CUSTOM_PREFIX = 'img:';

/** Ein pro Organisation hochgeladenes Titelbild. */
export interface CustomBanner {
  id: string;
  name: string;
  unlockLevel: number;
}

/** Banner-Schlüssel für ein hochgeladenes Bild (z. B. "img:<uuid>"). */
export function customBannerKey(id: string): string {
  return `${CUSTOM_PREFIX}${id}`;
}

/** Bild-ID aus einem Banner-Schlüssel, oder null für Verlaufs-Banner. */
export function parseCustomBannerKey(key: string | null | undefined): string | null {
  return key && key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : null;
}

/** Serving-URL für ein hochgeladenes Titelbild. */
export function customBannerImageUrl(id: string): string {
  return `/api/hub-banners/${id}`;
}

function customBannerBackground(id: string): string {
  return `#1e1b4b url("${customBannerImageUrl(id)}") center / cover no-repeat`;
}

/** Ein anzeigbares Titelbild (Verlauf ODER Bild) inkl. CSS-Background. */
export interface ResolvedBanner {
  key: string;
  name: string;
  unlockLevel: number;
  background: string;
  isImage: boolean;
}

/** Verlaufs- + Bild-Titelbilder zu einer Liste zusammenführen. */
export function allBanners(customBanners: CustomBanner[]): ResolvedBanner[] {
  const grads: ResolvedBanner[] = BANNERS.map((b) => ({
    key: b.key,
    name: b.name,
    unlockLevel: b.unlockLevel,
    background: b.gradient,
    isImage: false,
  }));
  const imgs: ResolvedBanner[] = customBanners.map((c) => ({
    key: customBannerKey(c.id),
    name: c.name,
    unlockLevel: c.unlockLevel,
    background: customBannerBackground(c.id),
    isImage: true,
  }));
  return [...grads, ...imgs];
}

/**
 * Wählt das tatsächlich anzuzeigende Titelbild: die bewusste Wahl der Person,
 * falls freigeschaltet – sonst das höchste freigeschaltete Bild, damit sich
 * das Titelbild automatisch dem Level anpasst. Hochgeladene Bilder gewinnen
 * bei Gleichstand gegen Verläufe.
 */
export function resolveActiveBanner(
  selected: string | null | undefined,
  level: number,
  customBanners: CustomBanner[],
): ResolvedBanner {
  const all = allBanners(customBanners);
  const byKey = new Map(all.map((b) => [b.key, b] as const));
  const chosen = selected ? byKey.get(selected) : undefined;
  if (chosen && level >= chosen.unlockLevel) return chosen;

  const unlocked = all
    .filter((b) => level >= b.unlockLevel)
    .sort(
      (a, b) =>
        b.unlockLevel - a.unlockLevel || Number(b.isImage) - Number(a.isImage),
    );
  return unlocked[0] ?? byKey.get(DEFAULT_BANNER_KEY)!;
}

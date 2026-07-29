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

/**
 * Nur noch EIN neutrales Standard-Banner im Code (dezenter Verlauf). Die
 * bunten Deko-Verläufe wurden entfernt – Titelbilder kommen jetzt aus den
 * hochgeladenen Bildern. Das Standard-Banner dient nur als Fallback, wenn
 * (noch) kein Bild gewählt/hochgeladen ist.
 */
export const BANNERS: Banner[] = [
  {
    key: 'aurora',
    name: 'Standard',
    gradient: 'linear-gradient(120deg, #312e81 0%, #4f46e5 55%, #7c3aed 100%)',
    unlockLevel: 0,
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

import 'server-only';

/**
 * Erkennt anhand von Titel/Beschreibung, ob es in einer Aufgabe um bezahlte
 * Anzeigen (Meta/Google Ads) geht – und welche Plattform(en). Bewusst keyword-
 * basiert (deterministisch, kein KI-Call): die Begriffe sind eindeutig genug.
 */

const META_KEYWORDS = [
  'meta ads',
  'meta-ads',
  'facebook ads',
  'facebook-ads',
  'fb ads',
  'instagram ads',
  'insta ads',
  'meta werbeanzeige',
  'meta kampagne',
  'facebook werbung',
  'instagram werbung',
  'meta business',
];

const GOOGLE_KEYWORDS = [
  'google ads',
  'google-ads',
  'google adwords',
  'adwords',
  'sea kampagne',
  'google werbung',
  'performance max',
  'pmax',
  'youtube ads',
  'google shopping',
];

// Generische Ads-Begriffe (Plattform unklar) – lösen die Rückfrage aus.
const GENERIC_KEYWORDS = [
  'ads schalten',
  'anzeigen schalten',
  'werbeanzeigen',
  'ad spend',
  'adspend',
  'ppc',
  'paid ads',
  'paid social',
  'werbebudget',
];

export interface AdsDetection {
  isAds: boolean;
  meta: boolean;
  google: boolean;
}

export function detectAdsProduct(
  title: string,
  description: string | null,
): AdsDetection {
  const t = `${title}\n${description ?? ''}`.toLowerCase();
  const meta = META_KEYWORDS.some((k) => t.includes(k));
  const google = GOOGLE_KEYWORDS.some((k) => t.includes(k));
  const generic = GENERIC_KEYWORDS.some((k) => t.includes(k));
  return { isAds: meta || google || generic, meta, google };
}

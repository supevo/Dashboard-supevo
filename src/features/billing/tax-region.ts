/**
 * Steuerregion anhand des (frei eingegebenen) Kundenlandes erkennen.
 *
 * Für EU-Kunden außerhalb Deutschlands gilt bei B2B-Dienstleistungen das
 * Reverse-Charge-Verfahren: die Leistung ist in Deutschland nicht steuerbar,
 * der Leistungsempfänger schuldet die USt in seinem Land selbst. Auf der
 * Rechnung wird dann keine deutsche USt ausgewiesen (0 %, Netto = Brutto) und
 * der Pflichthinweis „Steuerschuldnerschaft des Leistungsempfängers" gedruckt.
 *
 * Das Feld billing_country ist Freitext (z. B. „Luxemburg", „Luxembourg", „LU").
 * Wir normalisieren es und gleichen es gegen Namen/ISO-Codes der EU-Länder ab.
 * Unbekannte oder deutsche Länder => normale deutsche Besteuerung (unverändert).
 * Drittländer (Nicht-EU) werden bewusst NICHT automatisch als Reverse-Charge
 * behandelt – dort gilt eine andere Regelung; das müsste separat abgebildet
 * werden.
 */

/** Normalisiert einen Ländereintrag: klein, ohne Diakritika/Sonderzeichen. */
function normalize(country: string): string {
  return country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Akzente entfernen (ü->u, é->e)
    .replace(/[^a-z]/g, ''); // nur Buchstaben behalten (z. B. "d e" -> "de")
}

/** Deutschland-Synonyme (keine Umsatzsteuer-Sonderbehandlung). */
const GERMANY = new Set(['deutschland', 'germany', 'de', 'deu', 'allemagne', 'brd']);

/**
 * Normalisierte Bezeichner der EU-Mitgliedstaaten OHNE Deutschland
 * (deutsche + englische Namen sowie ISO-2/3-Codes). Bewusst großzügig, damit
 * gängige Schreibweisen erkannt werden.
 */
const EU_WITHOUT_DE = new Set(
  [
    // Belgien
    'belgien', 'belgium', 'be', 'bel',
    // Bulgarien
    'bulgarien', 'bulgaria', 'bg', 'bgr',
    // Dänemark
    'danemark', 'denmark', 'dk', 'dnk',
    // Estland
    'estland', 'estonia', 'ee', 'est',
    // Finnland
    'finnland', 'finland', 'fi', 'fin',
    // Frankreich
    'frankreich', 'france', 'fr', 'fra',
    // Griechenland
    'griechenland', 'greece', 'gr', 'grc', 'ell',
    // Irland
    'irland', 'ireland', 'ie', 'irl',
    // Italien
    'italien', 'italy', 'it', 'ita', 'italia',
    // Kroatien
    'kroatien', 'croatia', 'hr', 'hrv',
    // Lettland
    'lettland', 'latvia', 'lv', 'lva',
    // Litauen
    'litauen', 'lithuania', 'lt', 'ltu',
    // Luxemburg
    'luxemburg', 'luxembourg', 'lu', 'lux',
    // Malta
    'malta', 'mt', 'mlt',
    // Niederlande
    'niederlande', 'netherlands', 'nl', 'nld', 'holland',
    // Österreich
    'osterreich', 'austria', 'at', 'aut',
    // Polen
    'polen', 'poland', 'pl', 'pol', 'polska',
    // Portugal
    'portugal', 'pt', 'prt',
    // Rumänien
    'rumanien', 'romania', 'ro', 'rou',
    // Schweden
    'schweden', 'sweden', 'se', 'swe',
    // Slowakei
    'slowakei', 'slovakia', 'sk', 'svk',
    // Slowenien
    'slowenien', 'slovenia', 'si', 'svn',
    // Spanien
    'spanien', 'spain', 'es', 'esp', 'espana',
    // Tschechien
    'tschechien', 'czechia', 'czechrepublic', 'cz', 'cze',
    // Ungarn
    'ungarn', 'hungary', 'hu', 'hun',
    // Zypern
    'zypern', 'cyprus', 'cy', 'cyp',
  ],
);

/** true, wenn das Land ein EU-Land außerhalb Deutschlands ist (Reverse-Charge). */
export function isEuReverseChargeCountry(
  country: string | null | undefined,
): boolean {
  if (!country) return false;
  const n = normalize(country);
  if (!n || GERMANY.has(n)) return false;
  return EU_WITHOUT_DE.has(n);
}

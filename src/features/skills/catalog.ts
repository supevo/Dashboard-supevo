/**
 * Predefined skill catalog for a marketing agency (media designers & online
 * marketers). Kept deliberately compact — broad areas, not micro-skills.
 * Skills are stored by name, so these strings are the canonical keys.
 */
export interface SkillGroup {
  title: string;
  skills: string[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    title: 'Mediengestaltung',
    skills: [
      'Grafikdesign',
      'Layout & Satz',
      'Bildbearbeitung',
      'Webdesign (UI/UX)',
      'Video & Motion',
      'Fotografie',
      'Illustration',
    ],
  },
  {
    title: 'Online-Marketing',
    skills: [
      'SEO',
      'Google Ads (SEA)',
      'Social Media',
      'Content & Copywriting',
      'E-Mail-Marketing',
      'Web-Analytics',
    ],
  },
  {
    title: 'Persönliche Kompetenzen',
    skills: [
      'Teamfähigkeit',
      'Konfliktfähigkeit',
      'Kommunikationsstärke',
      'Kreativität',
      'Eigenverantwortung',
      'Zuverlässigkeit & Termintreue',
      'Kundenorientierung',
      'Lernbereitschaft',
      'Sorgfalt & Detailgenauigkeit',
    ],
  },
];

/** Flat list of all catalog skill names. */
export const SKILL_CATALOG: string[] = SKILL_GROUPS.flatMap((g) => g.skills);

/**
 * Verankerungs-Beispiele je Fähigkeit: was bedeutet 1, was bedeutet 10? Werden
 * bei der Selbsteinschätzung neben der Fähigkeit angezeigt, damit die Skala
 * einheitlich verstanden wird. Frei anpassbar – nur der Text ändert sich, die
 * Skala bleibt 0–10. (Teamfähigkeit/Konfliktfähigkeit wörtlich nach Vorgabe.)
 */
export interface SkillExample {
  low: string; // Bedeutung von 1
  high: string; // Bedeutung von 10
}

export const SKILL_EXAMPLES: Record<string, SkillExample> = {
  Grafikdesign: {
    low: 'Ich setze klare Vorgaben und Vorlagen sauber um.',
    high: 'Ich entwickle eigenständig Designkonzepte und Corporate Designs von Grund auf.',
  },
  'Layout & Satz': {
    low: 'Ich befülle bestehende Layouts sauber mit Text und Bild.',
    high: 'Ich gestalte komplexe, mehrseitige Layouts und typografische Systeme selbstständig.',
  },
  Bildbearbeitung: {
    low: 'Ich führe einfache Anpassungen wie Zuschnitt und Farbkorrektur durch.',
    high: 'Ich retuschiere und komponiere anspruchsvolle Bildmontagen auf professionellem Niveau.',
  },
  'Webdesign (UI/UX)': {
    low: 'Ich setze vorgegebene Designs im Web um.',
    high: 'Ich entwerfe durchdachte, nutzerzentrierte Interfaces inklusive Usability-Konzept.',
  },
  'Video & Motion': {
    low: 'Ich schneide einfache Videos nach Vorgabe.',
    high: 'Ich produziere aufwendige Motion-Designs und Animationen eigenständig.',
  },
  Fotografie: {
    low: 'Ich mache brauchbare Aufnahmen in einfachen Situationen.',
    high: 'Ich inszeniere und beleuchte professionelle Shootings eigenständig.',
  },
  Illustration: {
    low: 'Ich erstelle einfache Grafiken nach Vorlage.',
    high: 'Ich entwickle eigenständige Illustrationsstile und komplexe Bildwelten.',
  },
  SEO: {
    low: 'Ich kenne die Grundlagen und pflege einfache Optimierungen ein.',
    high: 'Ich entwickle und steuere ganzheitliche SEO-Strategien inklusive technischem SEO.',
  },
  'Google Ads (SEA)': {
    low: 'Ich pflege bestehende Kampagnen und Anzeigen.',
    high: 'Ich plane, steuere und optimiere komplexe Kampagnenstrukturen eigenständig.',
  },
  'Social Media': {
    low: 'Ich erstelle und plane einfache Beiträge.',
    high: 'Ich entwickle Social-Media-Strategien und steuere Kanäle datenbasiert.',
  },
  'Content & Copywriting': {
    low: 'Ich schreibe einfache Texte nach Vorgabe.',
    high: 'Ich entwickle Tonalität, Konzepte und überzeugende Texte für alle Kanäle.',
  },
  'E-Mail-Marketing': {
    low: 'Ich versende einfache Newsletter nach Vorlage.',
    high: 'Ich baue automatisierte Kampagnenstrecken und optimiere sie datenbasiert.',
  },
  'Web-Analytics': {
    low: 'Ich lese einfache Kennzahlen aus Standardberichten ab.',
    high: 'Ich richte Tracking ein und leite fundierte Handlungsempfehlungen aus Daten ab.',
  },
  Teamfähigkeit: {
    low: 'Ich arbeite gerne mit anderen zusammen und unterstütze meine Kollegen aktiv im Arbeitsalltag und ggf. darüber hinaus.',
    high: 'Ich übernehme regelmäßig eine führende Rolle im Team und koordiniere teamübergreifende Zusammenarbeit.',
  },
  Konfliktfähigkeit: {
    low: 'Ich bleibe in schwierigen Situationen ruhig und gehe auf andere zu, um Lösungen zu finden.',
    high: 'Ich übernehme aktiv Verantwortung in Konfliktsituationen, moderiere Gespräche und versuche zu nachhaltigen Lösungen zu kommen.',
  },
  Kommunikationsstärke: {
    low: 'Ich stimme mich verständlich mit Team und Kunden ab, wenn es die Situation erfordert.',
    high: 'Ich kommuniziere sicher und überzeugend – auch in Präsentationen und schwierigen Kundengesprächen.',
  },
  Kreativität: {
    low: 'Ich entwickle Ideen, wenn mir eine grobe Richtung vorgegeben wird.',
    high: 'Ich entwickle eigenständig originelle Konzepte und neue kreative Ansätze für Kunden.',
  },
  Eigenverantwortung: {
    low: 'Ich erledige zugewiesene Aufgaben zuverlässig nach Absprache.',
    high: 'Ich treibe meine Themen eigenständig voran, priorisiere selbst und übernehme Verantwortung für Ergebnisse.',
  },
  'Zuverlässigkeit & Termintreue': {
    low: 'Ich halte Absprachen ein und melde mich, wenn etwas nicht klappt.',
    high: 'Ich liefere konstant termingerecht und plane Puffer für Unvorhergesehenes von selbst ein.',
  },
  Kundenorientierung: {
    low: 'Ich beantworte Kundenanliegen freundlich und korrekt.',
    high: 'Ich denke mich in Kundenziele hinein und schlage proaktiv passende Lösungen vor.',
  },
  Lernbereitschaft: {
    low: 'Ich arbeite mich in neue Themen ein, wenn es nötig ist.',
    high: 'Ich eigne mir neue Tools und Trends aktiv und schnell an und gebe Wissen im Team weiter.',
  },
  'Sorgfalt & Detailgenauigkeit': {
    low: 'Ich arbeite ordentlich und prüfe meine Ergebnisse grob.',
    high: 'Ich liefere durchgängig fehlerfreie, konsistente Arbeit und achte auch auf feine Details.',
  },
};

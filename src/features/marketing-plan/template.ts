/**
 * Standard 5-phase marketing-plan skeleton in the agency's style. Serves as a
 * one-click starting point that is then tailored per client. Timeframes are
 * deliberately vague (no dates) – the plan is not bound to a fixed period.
 */

export interface TemplatePhase {
  title: string;
  timeframeHint: string;
  outcome: string;
  measures: string[];
}

export interface PlanTemplate {
  closingNote: string;
  phases: TemplatePhase[];
}

export const DEFAULT_PLAN_TEMPLATE: PlanTemplate = {
  closingNote:
    'Diese Schritte bauen logisch aufeinander auf und entwickeln sich im ' +
    'Laufe der Zusammenarbeit kontinuierlich weiter.',
  phases: [
    {
      title: 'Phase 1 – Fundament und Strategie',
      timeframeHint: 'zu Beginn der Zusammenarbeit',
      outcome:
        'In dieser Phase wird die Grundlage für die Kundenansprache geschaffen.',
      measures: [
        'Zieldefinition der Leistungen',
        'Struktur der Landingpages',
        'Planung Fotos & Videos, Inhalte',
        'Konzept für die digitale Beratung und Anfragesystem (Funnel mit Vorqualifizierung)',
        'Zielgruppe und Zielgebiet definieren',
        'Definition der Fokusleistungen',
      ],
    },
    {
      title: 'Phase 2 – Aufbau des Anfragesystems',
      timeframeHint: 'im weiteren Verlauf der ersten Monate',
      outcome: 'Erste gezielte Anfragen entstehen.',
      measures: [
        'Landingpages für die Google Ads und Social Media Ads',
        'Klare Angebotsstruktur',
        'Integration der digitalen Beratung (Funnel mit Vorqualifizierung)',
        'Google Ads Kampagnen auf die Landingpages',
        'Google Maps und Local Ads',
        'Social Media Ads Kampagnen mit grafischer und textlicher Gestaltung der Creatives',
        'Einrichtung Tracking und Conversion Messung',
        'KI Assistent zur Vorqualifizierung',
        'Weiterleitung vorqualifizierter Anfragen zur Terminbuchung',
      ],
    },
    {
      title: 'Phase 3 – Wahrnehmung am Markt gezielt verändern',
      timeframeHint: '',
      outcome: 'Der Betrieb wird am Markt wie gewünscht wahrgenommen.',
      measures: [
        'Kommunikation auf der Website optimieren',
        'Implementierung der digitalen Beratung auf der Website',
        'Optimale Kommunikation auf Landingpages für Google Ads und Social Media Ads',
        'Unterstützung bei der Gestaltung vor Ort (Gebäude, Fassade und Umgebung)',
      ],
    },
    {
      title: 'Phase 4 – Marktposition aufbauen und festigen',
      timeframeHint: '',
      outcome:
        'Dauerhafte Sichtbarkeit und Aufbau planbarer Kundenanfragen.',
      measures: [
        'SEO und GEO Optimierung für das Zielgebiet',
        'Optimierung der Google Ads und Social Media Ads Kampagnen',
        'Erweiterung der Inhalte',
        'Laufende Anpassungen an Saison, Nachfrage und Trends',
      ],
    },
    {
      title: 'Phase 5 – Kontinuierliche Marktführung und Weiterentwicklung',
      timeframeHint: 'im weiteren Verlauf der Zusammenarbeit',
      outcome:
        'In dieser Phase geht es nicht mehr um den Aufbau der Basis, sondern ' +
        'darum, die Marktposition dauerhaft zu halten und weiter auszubauen.',
      measures: [
        'Erweiterung und Anpassung der Landingpages',
        'Laufende Optimierung der Kampagnen',
        'Ausbau der Sichtbarkeit für neue Zielgruppen',
        'Kontinuierliche SEO und GEO Weiterentwicklung',
        'Anpassung an Markt, Nachfrage und Saison',
        'Trendanalysen',
        'Unterstützung bei neuen Ideen, Werbemitteln oder weiteren Angeboten',
      ],
    },
  ],
};

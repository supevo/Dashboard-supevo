/**
 * Buchhaltung – feste Stammdaten (kein DB-Inhalt). Rechtsform steuert
 * Gewinnermittlung (EÜR vs. Bilanz), Steuerart und Gewerbesteuer-Behandlung.
 * Wird in Phase 6 (Steuer-Engine) ausgewertet; hier zentral definiert, damit
 * Formular und Logik denselben Katalog nutzen.
 */

export type Rechtsform =
  | 'einzelunternehmen'
  | 'freiberufler'
  | 'gbr'
  | 'ug'
  | 'gmbh'
  | 'gmbh_co_kg'
  | 'ohg'
  | 'kg';

export type Gewinnermittlung = 'euer' | 'bilanz';
export type Steuerart = 'einkommensteuer' | 'koerperschaftsteuer';

export interface RechtsformInfo {
  value: Rechtsform;
  label: string;
  gewinnermittlung: Gewinnermittlung;
  steuerart: Steuerart;
  /** Gewerbesteuerpflicht (Freiberufler sind befreit). */
  gewerbesteuer: boolean;
  /** Gewerbesteuer-Freibetrag 24.500 € (nur Einzel-/Personengesellschaften). */
  gewerbesteuerFreibetrag: boolean;
}

export const RECHTSFORMEN: RechtsformInfo[] = [
  {
    value: 'einzelunternehmen',
    label: 'Einzelunternehmen',
    gewinnermittlung: 'euer',
    steuerart: 'einkommensteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: true,
  },
  {
    value: 'freiberufler',
    label: 'Freiberufler',
    gewinnermittlung: 'euer',
    steuerart: 'einkommensteuer',
    gewerbesteuer: false,
    gewerbesteuerFreibetrag: false,
  },
  {
    value: 'gbr',
    label: 'GbR',
    gewinnermittlung: 'euer',
    steuerart: 'einkommensteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: true,
  },
  {
    value: 'ug',
    label: 'UG (haftungsbeschränkt)',
    gewinnermittlung: 'bilanz',
    steuerart: 'koerperschaftsteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: false,
  },
  {
    value: 'gmbh',
    label: 'GmbH',
    gewinnermittlung: 'bilanz',
    steuerart: 'koerperschaftsteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: false,
  },
  {
    value: 'gmbh_co_kg',
    label: 'GmbH & Co. KG',
    gewinnermittlung: 'bilanz',
    steuerart: 'einkommensteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: true,
  },
  {
    value: 'ohg',
    label: 'OHG',
    gewinnermittlung: 'bilanz',
    steuerart: 'einkommensteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: true,
  },
  {
    value: 'kg',
    label: 'KG',
    gewinnermittlung: 'bilanz',
    steuerart: 'einkommensteuer',
    gewerbesteuer: true,
    gewerbesteuerFreibetrag: true,
  },
];

const BY_VALUE = new Map(RECHTSFORMEN.map((r) => [r.value, r]));
const DEFAULT_RECHTSFORM = RECHTSFORMEN[0] as RechtsformInfo;

export function rechtsformInfo(value: string | null | undefined): RechtsformInfo {
  return BY_VALUE.get((value ?? '') as Rechtsform) ?? DEFAULT_RECHTSFORM;
}

export function rechtsformLabel(value: string | null | undefined): string {
  return rechtsformInfo(value).label;
}

export const UST_PERIODEN: { value: 'monat' | 'quartal'; label: string }[] = [
  { value: 'quartal', label: 'Quartal (vierteljährlich)' },
  { value: 'monat', label: 'Monat (monatlich)' },
];

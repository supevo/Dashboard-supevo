/**
 * Central German UI and error strings. Keep all user-facing copy here so the
 * codebase stays English while the interface stays German.
 */

import type { AppErrorCode } from '@/lib/errors';

export const de = {
  app: {
    name: 'Supevo Dashboard',
  },
  auth: {
    loginTitle: 'Anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    login: 'Anmelden',
    logout: 'Abmelden',
    forgotPassword: 'Passwort vergessen?',
    forgotPasswordTitle: 'Passwort zurücksetzen',
    forgotPasswordHint:
      'Wir senden dir einen Link zum Zurücksetzen, sofern ein Konto existiert.',
    forgotPasswordSubmit: 'Link anfordern',
    resetPasswordTitle: 'Neues Passwort setzen',
    newPassword: 'Neues Passwort',
    newPasswordConfirm: 'Passwort bestätigen',
    resetPasswordSubmit: 'Passwort speichern',
    inviteTitle: 'Konto einrichten',
    inviteHint: 'Vervollständige dein Konto, um beizutreten.',
    fullName: 'Vollständiger Name',
    acceptInvite: 'Konto erstellen',
    genericResetSent:
      'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link versendet.',
  },
  nav: {
    dashboard: 'Übersicht',
    projects: 'Projekte',
    time: 'Zeiterfassung',
    clients: 'Kunden',
    team: 'Team',
    reports: 'Berichte',
    settings: 'Einstellungen',
    profile: 'Profil',
    notifications: 'Benachrichtigungen',
    approvals: 'Freigaben',
  },
  errors: {
    UNAUTHENTICATED: 'Bitte melde dich an, um fortzufahren.',
    FORBIDDEN: 'Du hast keine Berechtigung für diese Aktion.',
    NOT_FOUND: 'Der angeforderte Eintrag wurde nicht gefunden.',
    VALIDATION: 'Bitte überprüfe deine Eingaben.',
    CONFLICT: 'Die Daten wurden zwischenzeitlich geändert. Bitte lade neu.',
    RATE_LIMITED: 'Zu viele Versuche. Bitte versuche es später erneut.',
    INTERNAL: 'Es ist ein unerwarteter Fehler aufgetreten.',
    invalidCredentials: 'E-Mail oder Passwort ist falsch.',
    invalidInvite: 'Diese Einladung ist ungültig oder abgelaufen.',
    passwordsDoNotMatch: 'Die Passwörter stimmen nicht überein.',
    noAccess:
      'Dein Konto ist noch keiner Organisation zugeordnet. Bitte wende dich an deine Administration.',
  } satisfies Record<AppErrorCode, string> & Record<string, string>,
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    loading: 'Wird geladen …',
    backToLogin: 'Zurück zur Anmeldung',
  },
} as const;

export function errorMessage(code: AppErrorCode): string {
  return de.errors[code];
}

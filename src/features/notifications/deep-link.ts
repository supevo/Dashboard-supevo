/**
 * Löst zu einer Benachrichtigung die passende Zielseite auf – abhängig vom
 * Bereich (Agentur `app` vs. Kundenportal `portal`) und dem Entitätstyp. So
 * führt der „Öffnen"-Link (in der Liste und in der E-Mail) direkt zur relevanten
 * Seite, statt nur aufs Dashboard.
 *
 * Bewusst tolerant: unbekannte Typen liefern null (kein Link). Wo eine
 * kunden-genaue Deep-URL nicht möglich ist, wird auf die passende Sektion
 * verwiesen.
 */
export function notificationHref(
  area: 'app' | 'portal',
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  const portal = area === 'portal';
  switch (entityType) {
    case 'task':
      return entityId ? `/${area}/tasks/${entityId}` : null;
    case 'chat':
      return portal ? '/portal' : entityId ? `/app/chat/${entityId}` : '/app';
    case 'onboarding':
      // Kunde: Onboarding-Stepper liegt auf der Portal-Startseite.
      return portal ? '/portal' : entityId ? `/app/clients/${entityId}` : '/app/clients';
    case 'inquiry':
      return portal ? '/portal/inquiries' : null;
    case 'appointment':
      return portal ? '/portal/appointments' : '/app/calendar';
    case 'invoice':
      return portal ? '/portal/invoices' : '/app/finance?tab=rechnungen';
    case 'marketing_plan':
      return portal ? '/portal/plan' : entityId ? `/app/clients/${entityId}` : null;
    case 'membership':
    case 'client_membership':
    case 'client_memberships':
      return portal ? '/portal/membership' : entityId ? `/app/clients/${entityId}` : null;
    case 'client_asset':
    case 'file':
      return portal ? '/portal/documents' : null;
    case 'client_company':
    case 'client_contact':
    case 'client_request':
      return portal ? null : entityId ? `/app/clients/${entityId}` : '/app/clients';
    case 'absence':
      return portal ? null : '/app/absences';
    case 'feedback':
      return portal ? null : '/app/feedback';
    case 'award':
    case 'kudos':
      return portal ? '/portal/hub' : '/app/kudos';
    case 'optimization':
      return portal ? null : '/app/workload';
    default:
      return null;
  }
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import {
  getClientCompany,
  listClientContacts,
} from '@/features/client-companies/queries';
import { InviteContactForm } from '@/features/client-companies/components/invite-contact-form';
import { ContactRow } from '@/features/client-companies/components/contact-row';
import { ClientProfileForm } from '@/features/client-companies/components/client-profile-form';
import { AccountManagerForm } from '@/features/account-manager/components/account-manager-form';
import { listTeamMembers } from '@/features/messenger/queries';
import {
  listBillingEntities,
  getBillingEntityForClient,
} from '@/features/billing/queries';
import { getClientMembership } from '@/features/billing/membership';
import { listClientInvoices } from '@/features/billing/invoice-queries';
import { MembershipForm } from '@/features/billing/components/membership-form';
import { ClientBillingEntityForm } from '@/features/billing/components/client-billing-entity-form';
import { InvoicesSection } from '@/features/billing/components/invoices-section';
import { RequestsSection } from '@/features/requests/components/requests-section';
import { listClientRequests } from '@/features/requests/queries';
import { MonthlyReport } from '@/features/reports/components/monthly-report';
import { getClientHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { getSatisfactionSummary } from '@/features/satisfaction/queries';
import { SatisfactionSummaryCard } from '@/features/satisfaction/components/satisfaction-summary';
import { getInquiryEndpoint, listInquiries } from '@/features/inquiries/queries';
import { InquirySettings } from '@/features/inquiries/components/inquiry-settings';
import { InquiryList } from '@/features/inquiries/components/inquiry-list';
import { listCompanyHub } from '@/features/assets/queries';
import { AssetHubManager } from '@/features/assets/components/asset-hub-manager';
import { getOneDriveStatus, getClientFolder } from '@/features/onedrive/queries';
import { ClientFolderLink } from '@/features/onedrive/components/client-folder-link';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { getPlan } from '@/features/marketing-plan/queries';
import { PlanManager } from '@/features/marketing-plan/components/plan-manager';
import { getOnboarding } from '@/features/onboarding/queries';
import { OnboardingSetup } from '@/features/onboarding/components/onboarding-setup';
import { getLegacySettings } from '@/features/legacy/queries';
import { LegacySettingsForm } from '@/features/legacy/components/legacy-settings-form';
import { PrintBillingToggle } from '@/features/print-billing/components/print-billing-toggle';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientCompanyId: string }>;
}) {
  const { clientCompanyId } = await params;
  const { user, orgId } = await requireAgencyPage();
  const isAdmin = isOrgAdmin(user, orgId);

  const company = await getClientCompany(orgId, clientCompanyId);
  if (!company) notFound();

  // All independent (general data + admin-only billing/OneDrive) → one parallel
  // batch. Admin-only queries resolve to null/[] for normal staff, so nothing
  // extra is fetched for them. Only the OneDrive folder mapping stays sequential
  // because it depends on whether OneDrive is configured.
  const planYear = new Date().getFullYear();
  const [
    requests,
    healthMap,
    satisfaction,
    inquiryEndpoint,
    inquiries,
    hub,
    marketingPlan,
    onboarding,
    legacySettings,
    contacts,
    membership,
    billingEntity,
    billingEntities,
    invoices,
    teamMembers,
    oneDrive,
  ] = await Promise.all([
    listClientRequests(clientCompanyId),
    getClientHealthMap(orgId),
    getSatisfactionSummary(clientCompanyId),
    getInquiryEndpoint(clientCompanyId),
    listInquiries(clientCompanyId),
    listCompanyHub(clientCompanyId),
    getPlan(clientCompanyId, planYear),
    getOnboarding(clientCompanyId, orgId),
    isAdmin ? getLegacySettings(clientCompanyId) : Promise.resolve(null),
    listClientContacts(orgId, clientCompanyId),
    isAdmin ? getClientMembership(clientCompanyId) : Promise.resolve(null),
    isAdmin ? getBillingEntityForClient(orgId, clientCompanyId) : Promise.resolve(null),
    isAdmin ? listBillingEntities(orgId) : Promise.resolve([]),
    isAdmin ? listClientInvoices(clientCompanyId) : Promise.resolve([]),
    isAdmin ? listTeamMembers(orgId) : Promise.resolve([]),
    isAdmin ? getOneDriveStatus(orgId) : Promise.resolve(null),
  ]);

  // OneDrive folder mapping (admin only; card hidden when not configured).
  const oneDriveFolder = oneDrive?.configured
    ? await getClientFolder(orgId, clientCompanyId)
    : null;

  const tabs: TabDef[] = [
    {
      key: 'overview',
      label: 'Übersicht',
      content: (
        <>
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>👤 Verantwortliche Ansprechpartner</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Haupt- und stellvertretender Ansprechpartner. Werden dem Kunden
                  im Portal angezeigt (Foto, Name, Direktkontakt).
                </p>
              </CardHeader>
              <CardContent>
                <AccountManagerForm
                  clientCompanyId={clientCompanyId}
                  currentManagerId={company.accountManagerId}
                  currentSecondaryManagerId={company.secondaryAccountManagerId}
                  staff={(teamMembers ?? []).map((m) => ({ userId: m.userId, name: m.name }))}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{de.satisfaction.agencyTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <SatisfactionSummaryCard summary={satisfaction} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.report.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyReport clientCompanyId={clientCompanyId} />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      key: 'profile',
      label: 'Profil & Kontakte',
      content: (
        <>
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>{de.clientProfile.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ClientProfileForm
                  orgId={orgId}
                  clientCompanyId={clientCompanyId}
                  contactEmail={company.contactEmail}
                  industry={company.industry}
                  brands={company.brands}
                  interests={company.interests}
                  expressTicketsPerMonth={company.expressTicketsPerMonth}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{de.clients.inviteContact}</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteContactForm orgId={orgId} clientCompanyId={clientCompanyId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.clients.contacts}</CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {de.clients.noContacts}
                </p>
              ) : (
                <ul className="divide-y">
                  {contacts.map((c) => (
                    <ContactRow
                      key={c.id}
                      orgId={orgId}
                      clientCompanyId={clientCompanyId}
                      contact={c}
                      canManage={isAdmin}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>🚀 Onboarding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Entscheide, ob und mit welchen Bestandteilen dieser Kunde ein
              Onboarding durchläuft.
            </p>
          </CardHeader>
          <CardContent>
            <OnboardingSetup clientCompanyId={clientCompanyId} status={onboarding} />
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'requests',
      label: 'Anfragen & Plan',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{de.requests.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestsSection
                clientCompanyId={clientCompanyId}
                requests={requests}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.inquiries.agencyTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InquirySettings
                clientCompanyId={clientCompanyId}
                endpoint={inquiryEndpoint}
                baseUrl={env.NEXT_PUBLIC_APP_URL}
              />
              <InquiryList inquiries={inquiries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🗺️ Marketingplan {planYear}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Jahresplan aus Maßnahmen pro Monat. Zur Abstimmung an den Kunden
                geben; akzeptierte Maßnahmen ins Kanban übernehmen.
              </p>
            </CardHeader>
            <CardContent>
              <PlanManager
                clientCompanyId={clientCompanyId}
                plan={marketingPlan}
                year={planYear}
              />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      key: 'files',
      label: 'Dateien & Marke',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>🗂️ Marken-Hub</CardTitle>
              <p className="text-sm text-muted-foreground">
                Marken-Guidelines &amp; finale Logos – dauerhaft hinterlegt und auch
                für den Kunden im Portal sichtbar.
              </p>
            </CardHeader>
            <CardContent>
              <AssetHubManager
                clientCompanyId={clientCompanyId}
                brands={hub.brands}
                assets={hub.assets}
                canReveal
                secretVaultEnabled={isSecretVaultEnabled()}
                variant="assets"
              />
            </CardContent>
          </Card>

          {isAdmin && oneDrive?.configured && (
            <Card>
              <CardHeader>
                <CardTitle>☁️ OneDrive-Kundenordner</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Verknüpfe den OneDrive-Ordner dieses Kunden. Hochgeladene Aufgaben-
                  Dateien werden automatisch dorthin gespiegelt.
                </p>
              </CardHeader>
              <CardContent>
                <ClientFolderLink
                  clientCompanyId={clientCompanyId}
                  currentPath={oneDriveFolder?.folderPath ?? null}
                  connected={oneDrive.connected}
                />
              </CardContent>
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'access',
      label: 'Zugänge',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>🔑 Zugänge</CardTitle>
            <p className="text-sm text-muted-foreground">
              Login-Daten des Kunden – Passwörter verschlüsselt gespeichert, per
              Klick anzeigbar. Vom Team angelegte Zugänge bleiben team-intern.
            </p>
          </CardHeader>
          <CardContent>
            <AssetHubManager
              clientCompanyId={clientCompanyId}
              brands={hub.brands}
              assets={hub.assets}
              canReveal
              secretVaultEnabled={isSecretVaultEnabled()}
              variant="access"
            />
          </CardContent>
        </Card>
      ),
    },
  ];

  if (isAdmin) {
    // Abrechnung als eigener Reiter (nur Admin) – nach Onboarding einsortiert.
    const billingTab: TabDef = {
      key: 'billing',
      label: 'Abrechnung',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Mitgliedschaft</CardTitle>
            </CardHeader>
            <CardContent>
              <MembershipForm
                orgId={orgId}
                clientCompanyId={clientCompanyId}
                membership={membership}
                settings={billingEntity}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rechnungssteller</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientBillingEntityForm
                orgId={orgId}
                clientCompanyId={clientCompanyId}
                entities={billingEntities}
                currentEntityId={company.billingEntityId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rechnungen</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoicesSection
                clientCompanyId={clientCompanyId}
                invoices={invoices}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🏛️ Legacy-Kunde &amp; Paket</CardTitle>
              <p className="text-sm text-muted-foreground">
                Bestandskunde mit Website-/Betreuungspaket. Preis frei
                überschreibbar (Rabatte); Werbebudget nur bei Performance.
              </p>
            </CardHeader>
            <CardContent>
              <LegacySettingsForm
                orgId={orgId}
                clientCompanyId={clientCompanyId}
                isLegacy={company.isLegacy}
                settings={legacySettings}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🖨️ Drucksachen</CardTitle>
              <p className="text-sm text-muted-foreground">
                Legt fest, ob Druckprodukte dieses Kunden abgerechnet werden.
              </p>
            </CardHeader>
            <CardContent>
              <PrintBillingToggle
                clientCompanyId={clientCompanyId}
                billPrint={company.billPrintProducts}
              />
            </CardContent>
          </Card>
        </>
      ),
    };
    // Reihenfolge: Übersicht · Profil · Onboarding · Abrechnung · Anfragen · Dateien · Zugänge
    tabs.splice(3, 0, billingTab);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/clients"
          className="text-sm text-primary hover:underline"
        >
          ← {de.clients.back}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <ClientHealthDot health={healthMap.get(clientCompanyId)} showLabel />
        </div>
        <p className="text-sm text-muted-foreground">
          {company.contactEmail ?? '—'} ·{' '}
          {company.isActive ? de.clients.active : de.clients.inactive}
        </p>
      </div>

      <Tabs tabs={tabs} />
    </div>
  );
}

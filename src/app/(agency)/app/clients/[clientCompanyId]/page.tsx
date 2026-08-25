import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin, isSuperAdmin, can } from '@/lib/authz/policies';
import { PurgeClientButton } from '@/features/admin/components/purge-client-button';
import {
  getClientCompany,
  listClientContacts,
} from '@/features/client-companies/queries';
import { InviteContactForm } from '@/features/client-companies/components/invite-contact-form';
import { ContactRow } from '@/features/client-companies/components/contact-row';
import { ClientProfileForm } from '@/features/client-companies/components/client-profile-form';
import { ClientCoreDataForm } from '@/features/client-companies/components/client-core-data-form';
import { BackupLoginCard } from '@/features/client-companies/components/backup-login-card';
import { AccountManagerForm } from '@/features/account-manager/components/account-manager-form';
import { AttentionFactorForm } from '@/features/client-companies/components/attention-factor-form';
import { listTeamMembers } from '@/features/messenger/queries';
import { listBillingEntities } from '@/features/billing/queries';
import { getClientMembership } from '@/features/billing/membership';
import { listClientInvoices } from '@/features/billing/invoice-queries';
import { MembershipForm } from '@/features/billing/components/membership-form';
import { MembershipConfiguratorPanel } from '@/features/memberships/components/membership-configurator-panel';
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
import { InquiryKanban } from '@/features/inquiries/components/inquiry-kanban';
import { listCompanyHub } from '@/features/assets/queries';
import { AssetHubManager } from '@/features/assets/components/asset-hub-manager';
import { getOneDriveStatus, getClientFolder } from '@/features/onedrive/queries';
import { ClientFolderLink } from '@/features/onedrive/components/client-folder-link';
import { ClientFilesBrowser } from '@/features/onedrive/components/client-files-browser';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import {
  SettingsDrawer,
  type DrawerSection,
} from '@/components/ui/settings-drawer';
import {
  ClientBoards,
  type ClientBoardBundle,
} from '@/features/tasks/components/client-boards';
import {
  listClientProjects,
  getProject,
  listProjectMembers,
} from '@/features/projects/queries';
import { ProjectSettingsForm } from '@/features/projects/components/project-settings-form';
import { ProjectCoverUploader } from '@/features/projects/components/project-cover-uploader';
import { getBoardView } from '@/features/tasks/queries';
import { listRecurringTasks } from '@/features/recurring/queries';
import { listMarketingReports } from '@/features/marketing-reports/queries';
import { ReportsManager } from '@/features/marketing-reports/components/reports-manager';
import { getPlan } from '@/features/marketing-plan/queries';
import { PlanManager } from '@/features/marketing-plan/components/plan-manager';
import { getOnboarding } from '@/features/onboarding/queries';
import { OnboardingSetup } from '@/features/onboarding/components/onboarding-setup';
import { PrintBillingToggle } from '@/features/print-billing/components/print-billing-toggle';
import { ClientPagesManager } from '@/features/client-pages/components/client-pages-manager';
import { listClientPages, listClientTaskOptions } from '@/features/client-pages/queries';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

const TAB_KEYS = ['board', 'inquiries', 'plan', 'pages', 'files'] as const;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientCompanyId: string }>;
  searchParams: Promise<{ tab?: string; board?: string }>;
}) {
  const { clientCompanyId } = await params;
  const { tab, board: boardParam } = await searchParams;
  const { user, orgId } = await requireAgencyPage();
  const isAdmin = isOrgAdmin(user, orgId);
  const canCreateProject = can(user, { type: 'project.create', orgId });

  const company = await getClientCompany(orgId, clientCompanyId);
  if (!company) notFound();

  // All independent (general data + admin-only billing/OneDrive) → one parallel
  // batch. Admin-only queries resolve to null/[] for normal staff, so nothing
  // extra is fetched for them. Only the OneDrive folder mapping stays sequential
  // because it depends on whether OneDrive is configured.
  const [
    requests,
    healthMap,
    satisfaction,
    inquiryEndpoint,
    inquiries,
    hub,
    marketingPlan,
    marketingReports,
    onboarding,
    contacts,
    membership,
    billingEntities,
    invoices,
    teamMembers,
    oneDrive,
    pages,
    projectMetas,
    taskOptions,
  ] = await Promise.all([
    listClientRequests(clientCompanyId),
    getClientHealthMap(orgId),
    getSatisfactionSummary(clientCompanyId),
    getInquiryEndpoint(clientCompanyId),
    listInquiries(clientCompanyId),
    listCompanyHub(clientCompanyId),
    getPlan(clientCompanyId),
    listMarketingReports(clientCompanyId),
    getOnboarding(clientCompanyId, orgId),
    listClientContacts(orgId, clientCompanyId),
    isAdmin ? getClientMembership(clientCompanyId) : Promise.resolve(null),
    isAdmin ? listBillingEntities(orgId) : Promise.resolve([]),
    isAdmin ? listClientInvoices(clientCompanyId) : Promise.resolve([]),
    isAdmin ? listTeamMembers(orgId) : Promise.resolve([]),
    isAdmin ? getOneDriveStatus(orgId) : Promise.resolve(null),
    listClientPages(clientCompanyId),
    listClientProjects(orgId, clientCompanyId),
    listClientTaskOptions(clientCompanyId),
  ]);

  // OneDrive folder mapped to this client. Fetched for all staff so the Dateien
  // tab can show the inline folder browser; the admin mapping card reuses it.
  const clientFolder = await getClientFolder(orgId, clientCompanyId);

  // Assemble the board bundles for the merged client view (one per project).
  const boardBundles = (
    await Promise.all(
      projectMetas.map(async (meta) => {
        const [project, boardView, members, recurring] = await Promise.all([
          getProject(meta.id),
          getBoardView(meta.id),
          listProjectMembers(meta.id),
          listRecurringTasks(meta.id),
        ]);
        if (!project) return null;
        return {
          project,
          board: boardView,
          members,
          recurring,
        } satisfies ClientBoardBundle;
      }),
    )
  ).filter((b): b is ClientBoardBundle => b !== null);

  // Board settings + cover live in the drawer too, so there is a single ⚙️
  // (no separate per-board gear). One card per board the user may manage.
  const manageableBoards = boardBundles.filter((b) => b.project.canManage);
  const boardSection: DrawerSection = {
    key: 'board',
    label: 'Board',
    icon: '🗂️',
    content: (
      <>
        {manageableBoards.map((b) => (
          <Card key={b.project.id}>
            <CardHeader>
              <CardTitle>{b.project.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Titelbild, Name, Status, Sichtbarkeit &amp; Archiv dieses Boards.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProjectCoverUploader projectId={b.project.id} />
              <ProjectSettingsForm orgId={orgId} project={b.project} />
            </CardContent>
          </Card>
        ))}
      </>
    ),
  };

  // Configuration lives behind the ⚙️ drawer so the tabs stay focused on the
  // day-to-day work (Board · Marketingplan · Seiten · Dateien).
  const drawerSections: DrawerSection[] = [
    ...(manageableBoards.length > 0 ? [boardSection] : []),
    {
      key: 'overview',
      label: 'Übersicht',
      icon: '📊',
      content: (
        <>
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>🎯 Betreuungs-Faktor</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Gewicht für die Ampel: wie groß der faire Anteil dieses Kunden
                  an der Team-Aufmerksamkeit ist. Steuert, ab wann die Ampel auf
                  unterversorgt (rot) bzw. überzogen (orange) springt.
                </p>
              </CardHeader>
              <CardContent>
                <AttentionFactorForm
                  orgId={orgId}
                  clientCompanyId={clientCompanyId}
                  value={company.attentionFactor}
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

          <Card>
            <CardHeader>
              <CardTitle>{de.marketingReport.agencyTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportsManager
                clientCompanyId={clientCompanyId}
                reports={marketingReports}
              />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      key: 'profile',
      label: 'Profil & Kontakte',
      icon: '👤',
      content: (
        <>
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>🏢 Stammdaten</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Name, Notizen und Kundentyp – dieselben Angaben wie beim Anlegen.
                </p>
              </CardHeader>
              <CardContent>
                <ClientCoreDataForm
                  orgId={orgId}
                  clientCompanyId={clientCompanyId}
                  name={company.name}
                  notes={company.notes}
                  isLegacy={company.isLegacy}
                />
              </CardContent>
            </Card>
          )}

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
                  staff={(teamMembers ?? []).map((m) => ({
                    userId: m.userId,
                    name: m.name,
                  }))}
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

          {isSuperAdmin(user) && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle>⚠️ Gefahrenzone</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Kunden endgültig löschen (inkl. Projekte, Aufgaben, Rechnungen,
                  Zeiten). Nur per Master-Passwort. Vor allem zum Aufräumen von
                  Testdaten vor dem Live-Betrieb.
                </p>
              </CardHeader>
              <CardContent>
                <PurgeClientButton
                  clientCompanyId={clientCompanyId}
                  clientName={company.name}
                />
              </CardContent>
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      icon: '🚀',
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
      label: 'Anfragen',
      icon: '📥',
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
                inboundDomain={process.env.INBOUND_DOMAIN ?? null}
              />
              <p className="text-xs text-muted-foreground">
                {'Die eingegangenen Anfragen findest du im Reiter „Kundenanfragen".'}
              </p>
            </CardContent>
          </Card>
        </>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'billing',
            label: 'Abrechnung',
            icon: '💶',
            content: (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle>
                        {company.isLegacy
                          ? '🧩 Mitgliedschafts-Baukasten'
                          : '🧩 supevo-Mitgliedschaft'}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {company.isLegacy
                          ? 'Module wählen → Preis ergibt sich live. Erste Einrichtung gilt sofort, spätere Änderungen ab dem Folgemonat.'
                          : 'Stufe wählen. Ein gesetzter Custom-Preis überschreibt den regulären Stufenpreis und wird oben angezeigt.'}
                      </p>
                    </div>
                    <Link
                      href={`/app/clients/${clientCompanyId}/vertrag`}
                      className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      📄 Vertrag
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <MembershipConfiguratorPanel
                      clientCompanyId={clientCompanyId}
                      show={company.isLegacy ? 'modules' : 'stages'}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Mitgliedschaft (Abrechnungsdetails)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MembershipForm
                      orgId={orgId}
                      clientCompanyId={clientCompanyId}
                      membership={membership}
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
                      recipientEmail={company.invoiceRecipientEmail}
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
          } satisfies DrawerSection,
        ]
      : []),
    {
      key: 'access',
      label: 'Zugänge',
      icon: '🔑',
      content: (
        <>
          {isSuperAdmin(user) && (
            <Card>
              <CardHeader>
                <CardTitle>🔐 Backup-Login (als Kunde einloggen)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Nur Super-Admin: ein eigener Portal-Zugang für diesen Kunden zum
                  Testen und Ansichten-Vergleichen.
                </p>
              </CardHeader>
              <CardContent>
                <BackupLoginCard clientCompanyId={clientCompanyId} />
              </CardContent>
            </Card>
          )}
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
        </>
      ),
    },
  ];

  const tabs: TabDef[] = [
    {
      key: 'board',
      label: 'Board',
      content: (
        <ClientBoards
          orgId={orgId}
          clientCompanyId={clientCompanyId}
          companyName={company.name}
          bundles={boardBundles}
          canCreate={canCreateProject}
          initialProjectId={boardParam}
        />
      ),
    },
    {
      key: 'inquiries',
      label: 'Kundenanfragen',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>📥 Kundenanfragen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Leads dieses Kunden als Board – ziehe Karten zwischen den Spalten,
              um den Status zu ändern. Eingang &amp; Sichtbarkeit stellst du im
              {' ⚙️-Menü unter „Anfragen" '}
              ein.
            </p>
          </CardHeader>
          <CardContent>
            <InquiryKanban inquiries={inquiries} />
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'plan',
      label: 'Marketingplan',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>🗺️ Marketingplan</CardTitle>
            <p className="text-sm text-muted-foreground">
              Phasenbasierter Plan aus einzelnen Maßnahmen – ohne festen
              Zeitraum. Zur Abstimmung an den Kunden geben; Maßnahmen ins Kanban
              übernehmen.
            </p>
          </CardHeader>
          <CardContent>
            <PlanManager
              clientCompanyId={clientCompanyId}
              plan={marketingPlan}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'pages',
      label: 'Seiten',
      content: (
        <ClientPagesManager
          clientCompanyId={clientCompanyId}
          pages={pages}
          taskOptions={taskOptions}
        />
      ),
    },
    {
      key: 'files',
      label: 'Dateien',
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
                  Verknüpfe den OneDrive-Ordner dieses Kunden. Hochgeladene
                  Aufgaben-Dateien werden automatisch dorthin gespiegelt.
                </p>
              </CardHeader>
              <CardContent>
                <ClientFolderLink
                  clientCompanyId={clientCompanyId}
                  currentPath={clientFolder?.folderPath ?? null}
                  connected={oneDrive.connected}
                />
              </CardContent>
            </Card>
          )}

          {clientFolder && (
            <Card>
              <CardHeader>
                <CardTitle>☁️ OneDrive-Dateien</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ordnerstruktur dieses Kunden – durchklicken und Dateien
                  herunterladen.
                </p>
              </CardHeader>
              <CardContent>
                <ClientFilesBrowser clientCompanyId={clientCompanyId} />
              </CardContent>
            </Card>
          )}
        </>
      ),
    },
  ];

  const initialTab = TAB_KEYS.includes(tab as (typeof TAB_KEYS)[number])
    ? tab
    : 'board';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/clients"
            className="text-sm text-primary hover:underline"
          >
            ← {de.clients.back}
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-2xl font-bold">{company.name}</h1>
            {/* Legacy clients run on a fixed package and are not on the Ampel. */}
            {!company.isLegacy && (
              <ClientHealthDot
                health={healthMap.get(clientCompanyId)}
                showLabel
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {company.contactEmail ?? '—'} ·{' '}
            {company.isActive ? de.clients.active : de.clients.inactive}
          </p>
        </div>
        <SettingsDrawer sections={drawerSections} />
      </div>

      <Tabs tabs={tabs} initialKey={initialTab} />
    </div>
  );
}

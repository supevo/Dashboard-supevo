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
import { getBillingSettings } from '@/features/billing/queries';
import { getClientMembership } from '@/features/billing/membership';
import { listClientInvoices } from '@/features/billing/invoice-queries';
import { MembershipForm } from '@/features/billing/components/membership-form';
import { InvoicesSection } from '@/features/billing/components/invoices-section';
import { RequestsSection } from '@/features/requests/components/requests-section';
import { listClientRequests } from '@/features/requests/queries';
import { RecapSection } from '@/features/recap/components/recap-section';
import { MonthlyReport } from '@/features/reports/components/monthly-report';
import { getClientHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { getSatisfactionSummary } from '@/features/satisfaction/queries';
import { SatisfactionSummaryCard } from '@/features/satisfaction/components/satisfaction-summary';
import { listMarketingReports } from '@/features/marketing-reports/queries';
import { ReportsManager } from '@/features/marketing-reports/components/reports-manager';
import { getInquiryEndpoint, listInquiries } from '@/features/inquiries/queries';
import { InquirySettings } from '@/features/inquiries/components/inquiry-settings';
import { InquiryList } from '@/features/inquiries/components/inquiry-list';
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

  // Data every agency staffer may see.
  const [
    requests,
    healthMap,
    satisfaction,
    marketingReports,
    inquiryEndpoint,
    inquiries,
  ] = await Promise.all([
    listClientRequests(clientCompanyId),
    getClientHealthMap(orgId),
    getSatisfactionSummary(clientCompanyId),
    listMarketingReports(clientCompanyId),
    getInquiryEndpoint(clientCompanyId),
    listInquiries(clientCompanyId),
  ]);

  // Billing / contacts are admin-only.
  const [contacts, membership, billingSettings, invoices] = isAdmin
    ? await Promise.all([
        listClientContacts(orgId, clientCompanyId),
        getClientMembership(clientCompanyId),
        getBillingSettings(orgId),
        listClientInvoices(clientCompanyId),
      ])
    : [[], null, null, []];

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
          <ClientHealthDot
            health={healthMap.get(clientCompanyId)}
            showLabel
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {company.contactEmail ?? '—'} ·{' '}
          {company.isActive ? de.clients.active : de.clients.inactive}
        </p>
      </div>

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
          <CardTitle>{de.satisfaction.agencyTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <SatisfactionSummaryCard summary={satisfaction} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.recap.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecapSection clientCompanyId={clientCompanyId} />
        </CardContent>
      </Card>

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

      {isAdmin && (
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
                settings={billingSettings}
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
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

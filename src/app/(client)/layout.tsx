import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import type { UserMenuItem } from '@/components/layout/user-menu';
import {
  getCurrentUser,
  hasAgencyAccess,
  hasClientAccess,
} from '@/features/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { hasMyMarketingPlan } from '@/features/marketing-plan/queries';
import { isInquiryInboxEnabled } from '@/features/inquiries/queries';
import { getExpressStatus } from '@/features/express/queries';
import { ExpressHeaderBadge } from '@/features/express/components/express-header-badge';
import { FeedbackWidget } from '@/features/feedback/components/feedback-widget';
import { de } from '@/lib/i18n/de';

// Marketingplan wird separat eingefügt, nur wenn ein Plan hinterlegt ist.
const NAV_ITEMS: NavItem[] = [
  { href: '/portal', label: de.nav.dashboard },
  { href: '/portal/projects', label: de.nav.projects },
  { href: '/portal/chat', label: '💬 Chat' },
  { href: '/portal/ideas', label: '💡 Ideen' },
  { href: '/portal/appointments', label: '📅 Termine' },
  { href: '/portal/hub', label: 'Marken-Hub' },
  { href: '/portal/access', label: 'Zugänge' },
  { href: '/portal/approvals', label: de.nav.approvals },
  { href: '/portal/reports', label: de.nav.reports },
  { href: '/portal/membership', label: de.nav.membership },
  { href: '/portal/invoices', label: 'Rechnungen' },
  { href: '/portal/documents', label: '📁 Dokumente' },
];

const MENU_ITEMS: UserMenuItem[] = [
  { href: '/portal/profile', label: de.nav.profile },
  { href: '/portal/notifications', label: de.nav.notifications },
];

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Agency staff use the internal area; only external users see the portal.
  if (!hasClientAccess(user)) {
    redirect(hasAgencyAccess(user) ? '/app' : '/no-access');
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  // Show the inquiries inbox only when the agency has enabled it for this client.
  const company = await getMyClientCompany();
  const [inquiriesEnabled, hasPlan] = await Promise.all([
    company ? isInquiryInboxEnabled(company.clientCompanyId) : Promise.resolve(false),
    hasMyMarketingPlan(),
  ]);

  // Build the nav: Marketingplan directly after the dashboard, but only when a
  // plan is deposited; Anfragen only when the inbox is enabled.
  const navItems: NavItem[] = [
    NAV_ITEMS[0]!,
    ...(hasPlan ? [{ href: '/portal/plan', label: '🗺️ Marketingplan' }] : []),
    ...NAV_ITEMS.slice(1),
    ...(inquiriesEnabled ? [{ href: '/portal/inquiries', label: de.nav.inquiries }] : []),
  ];

  const expressStatus = company
    ? await getExpressStatus(company.clientCompanyId)
    : null;

  return (
    <AppShell
      navItems={navItems}
      menuItems={MENU_ITEMS}
      areaLabel="Kundenportal"
      area="portal"
      userId={user.id}
      userName={user.fullName ?? user.email}
      hasAvatar={Boolean(profile?.avatar_url)}
      headerBadge={
        expressStatus ? <ExpressHeaderBadge status={expressStatus} /> : null
      }
    >
      {children}
      <FeedbackWidget />
    </AppShell>
  );
}

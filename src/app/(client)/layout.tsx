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
import { getMyAccountManagers } from '@/features/account-manager/queries';
import { ClientChatDock } from '@/features/messenger/components/client-chat-dock';
import { de } from '@/lib/i18n/de';

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

  // Gruppierte Portal-Navigation. Bedingte Punkte (Marketingplan, Anfragen)
  // werden in die passende Gruppe eingehängt.
  const navItems: NavItem[] = [
    { href: '#arbeitsbereich', label: 'Arbeitsbereich', heading: true },
    { href: '/portal', label: 'Übersicht' },
    { href: '/portal/projects', label: 'Projekte' },
    { href: '/portal/reports', label: 'Berichte' },
    ...(inquiriesEnabled
      ? [{ href: '/portal/inquiries', label: de.nav.inquiries }]
      : []),

    { href: '#planung', label: 'Planung & Kreativität', heading: true },
    { href: '/portal/ideas', label: 'Ideen' },
    { href: '/portal/appointments', label: 'Termine' },
    ...(hasPlan ? [{ href: '/portal/plan', label: 'Marketingplan' }] : []),

    { href: '#brand', label: 'Brand & Ressourcen', heading: true },
    { href: '/portal/hub', label: 'Marken-Hub' },
    { href: '/portal/documents', label: 'Dokumente' },

    { href: '#verwaltung', label: 'Verwaltung & Zugänge', heading: true },
    { href: '/portal/access', label: 'Zugänge' },
    { href: '/portal/membership', label: 'Mitgliedschaft' },
    { href: '/portal/invoices', label: 'Rechnungen' },
  ];

  const expressStatus = company
    ? await getExpressStatus(company.clientCompanyId)
    : null;

  // Responsible contacts for the floating chat dock header.
  const managers = await getMyAccountManagers();
  const chatPartners = [managers.primary, managers.secondary]
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      hasAvatar: m.hasAvatar,
      status: m.status,
    }));

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
      <ClientChatDock meId={user.id} partners={chatPartners} />
    </AppShell>
  );
}

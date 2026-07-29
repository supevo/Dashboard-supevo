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
import { isInquiryInboxEnabled } from '@/features/inquiries/queries';
import { de } from '@/lib/i18n/de';

const NAV_ITEMS: NavItem[] = [
  { href: '/portal', label: de.nav.dashboard },
  { href: '/portal/projects', label: de.nav.projects },
  { href: '/portal/hub', label: 'Marken-Hub' },
  { href: '/portal/approvals', label: de.nav.approvals },
  { href: '/portal/reports', label: de.nav.reports },
  { href: '/portal/membership', label: de.nav.membership },
  { href: '/portal/invoices', label: 'Rechnungen' },
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
  const inquiriesEnabled = company
    ? await isInquiryInboxEnabled(company.clientCompanyId)
    : false;
  const navItems: NavItem[] = inquiriesEnabled
    ? [
        ...NAV_ITEMS,
        { href: '/portal/inquiries', label: de.nav.inquiries },
      ]
    : NAV_ITEMS;

  return (
    <AppShell
      navItems={navItems}
      menuItems={MENU_ITEMS}
      areaLabel="Kundenportal"
      area="portal"
      userId={user.id}
      userName={user.fullName ?? user.email}
      hasAvatar={Boolean(profile?.avatar_url)}
    >
      {children}
    </AppShell>
  );
}

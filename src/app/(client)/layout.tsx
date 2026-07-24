import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import type { UserMenuItem } from '@/components/layout/user-menu';
import {
  getCurrentUser,
  hasAgencyAccess,
  hasClientAccess,
} from '@/features/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { de } from '@/lib/i18n/de';

const NAV_ITEMS: NavItem[] = [
  { href: '/portal', label: de.nav.dashboard },
  { href: '/portal/projects', label: de.nav.projects },
  { href: '/portal/approvals', label: de.nav.approvals },
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

  return (
    <AppShell
      navItems={NAV_ITEMS}
      menuItems={MENU_ITEMS}
      areaLabel="Kundenportal"
      userId={user.id}
      userName={user.fullName ?? user.email}
      hasAvatar={Boolean(profile?.avatar_url)}
    >
      {children}
    </AppShell>
  );
}

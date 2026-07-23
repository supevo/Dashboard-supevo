import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import {
  getCurrentUser,
  hasAgencyAccess,
  hasClientAccess,
} from '@/features/auth/session';
import { de } from '@/lib/i18n/de';

const NAV_ITEMS: NavItem[] = [
  { href: '/portal', label: de.nav.dashboard },
  { href: '/portal/projects', label: de.nav.projects },
  { href: '/portal/approvals', label: de.nav.approvals },
  { href: '/portal/notifications', label: de.nav.notifications },
  { href: '/portal/profile', label: de.nav.profile },
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

  return (
    <AppShell
      navItems={NAV_ITEMS}
      areaLabel="Kundenportal"
      userName={user.fullName ?? user.email}
    >
      {children}
    </AppShell>
  );
}

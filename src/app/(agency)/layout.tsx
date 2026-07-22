import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import {
  getCurrentUser,
  hasAgencyAccess,
  hasClientAccess,
} from '@/features/auth/session';
import { de } from '@/lib/i18n/de';

const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: de.nav.dashboard },
  { href: '/app/projects', label: de.nav.projects },
  { href: '/app/time', label: de.nav.time },
  { href: '/app/clients', label: de.nav.clients },
  { href: '/app/team', label: de.nav.team },
  { href: '/app/reports', label: de.nav.reports },
  { href: '/app/settings', label: de.nav.settings },
  { href: '/app/profile', label: de.nav.profile },
];

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Enforce the internal/external boundary at the layout level.
  if (!hasAgencyAccess(user)) {
    redirect(hasClientAccess(user) ? '/portal' : '/no-access');
  }

  return (
    <AppShell
      navItems={NAV_ITEMS}
      areaLabel="Agenturbereich"
      userName={user.fullName ?? user.email}
    >
      {children}
    </AppShell>
  );
}

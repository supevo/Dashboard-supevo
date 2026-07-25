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

// Primary workspace navigation (left sidebar).
const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: de.nav.dashboard },
  { href: '/app/my-tasks', label: de.nav.agenda },
  { href: '/app/projects', label: de.nav.projects },
  { href: '/app/clients', label: de.nav.clients },
  { href: '/app/team', label: de.nav.team },
  { href: '/app/workload', label: de.nav.workload },
  { href: '/app/reports', label: de.nav.reports },
];

// Personal items live in the top-right user menu.
const MENU_ITEMS: UserMenuItem[] = [
  { href: '/app/profile', label: de.nav.profile },
  { href: '/app/settings', label: de.nav.settings },
  { href: '/app/notifications', label: de.nav.notifications },
  { href: '/app/time', label: de.nav.time },
  { href: '/app/diagnostics', label: de.nav.diagnostics },
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
      areaLabel="Agenturbereich"
      userId={user.id}
      userName={user.fullName ?? user.email}
      hasAvatar={Boolean(profile?.avatar_url)}
      searchEnabled
    >
      {children}
    </AppShell>
  );
}

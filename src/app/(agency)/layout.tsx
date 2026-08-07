import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import type { UserMenuItem } from '@/components/layout/user-menu';
import { ChatDock } from '@/features/messenger/components/chat-dock';
import { FeedbackWidget } from '@/features/feedback/components/feedback-widget';
import { PomodoroTimer } from '@/components/layout/pomodoro-timer';
import { TeamRail } from '@/features/presence/components/team-rail';
import { getMyGamification } from '@/features/gamification/queries';
import { getCoinBalance } from '@/features/loot/queries';
import {
  getCurrentUser,
  hasAgencyAccess,
  hasClientAccess,
} from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin, isSuperAdmin } from '@/lib/authz/policies';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { de } from '@/lib/i18n/de';

// Primary workspace navigation (left sidebar) — visible to all agency staff.
const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: de.nav.dashboard },
  { href: '/app/calendar', label: de.nav.calendar },
  { href: '/app/projects', label: de.nav.projects },
  { href: '/app/clients', label: de.nav.clients },
  { href: '/app/leads', label: de.nav.leads },
  { href: '/app/reports', label: de.nav.reports },
  { href: '/app/colleagues', label: de.nav.colleagues },
  { href: '/app/passwords', label: '🔐 Passwörter' },
];

// Leadership-only entries appended for org admins (and super admins).
// Mitarbeiter erreichen die Belohnungen über den Level Hub – im Menü nur für Admins.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/app/team', label: de.nav.team },
  { href: '/app/motivation', label: '🎯 Motivation' },
  { href: '/app/feedback', label: '💬 Feedback' },
  { href: '/app/team-radar', label: 'Team-Radar' },
];

// Personal items visible to every agency staffer.
const MENU_ITEMS: UserMenuItem[] = [
  { href: '/app/profile', label: de.nav.profile },
  { href: '/app/kudos', label: de.nav.levelHub },
  { href: '/app/absences', label: de.nav.absence },
  { href: '/app/notifications', label: de.nav.notifications },
  { href: '/app/time', label: de.nav.time },
];

// Management-only menu entries (configuration + diagnostics).
const ADMIN_MENU_ITEMS: UserMenuItem[] = [
  { href: '/app/templates', label: de.nav.templates },
  { href: '/app/settings', label: de.nav.settings },
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
  const orgId = primaryAgencyOrgId(user);
  const gamification = await getMyGamification(user.id, orgId ?? undefined);

  const admin = Boolean(orgId && isOrgAdmin(user, orgId));
  const navItems = [
    ...NAV_ITEMS,
    ...(admin ? ADMIN_NAV_ITEMS : []),
    // Finanzen (Ausgaben + Rechnungen) – nur Super-Admin.
    ...(isSuperAdmin(user) ? [{ href: '/app/finance', label: '💶 Finanzen' }] : []),
  ];
  const menuItems = admin ? [...MENU_ITEMS, ...ADMIN_MENU_ITEMS] : MENU_ITEMS;
  const coins = orgId ? await getCoinBalance(user.id, orgId) : undefined;

  return (
    <AppShell
      navItems={navItems}
      menuItems={menuItems}
      areaLabel="Agenturbereich"
      userId={user.id}
      userName={user.fullName ?? user.email}
      hasAvatar={Boolean(profile?.avatar_url)}
      level={gamification.level}
      levelProgressPct={gamification.progressPct}
      status={gamification.status}
      coins={coins}
      searchEnabled
      userMenuInRail
      sidebarFooter={<PomodoroTimer />}
      rightRail={
        <TeamRail
          selfMenu={{
            userId: user.id,
            name: user.fullName ?? user.email,
            hasAvatar: Boolean(profile?.avatar_url),
            items: menuItems,
            level: gamification.level,
            progressPct: gamification.progressPct,
            status: gamification.status,
            frameUrl: gamification.frameUrl,
          }}
        />
      }
    >
      {children}
      <ChatDock meId={user.id} meName={user.fullName ?? user.email} />
      <FeedbackWidget />
    </AppShell>
  );
}

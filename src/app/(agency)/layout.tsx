import { redirect } from 'next/navigation';
import { AppShell, type NavItem } from '@/components/layout/app-shell';
import { getOrgBranding } from '@/features/branding/queries';
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
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Target,
  BarChart3,
  Radar,
  Users,
  Trophy,
  MessageSquare,
  KeyRound,
  Wallet,
} from 'lucide-react';
import { de } from '@/lib/i18n/de';

// Section header for the sidebar (rendered as a non-clickable heading).
const heading = (label: string): NavItem => ({ href: '', label, heading: true });

/**
 * Builds the grouped left-sidebar navigation. Sections carry headings; the
 * "Team & Motivation" and "Ressourcen" groups grow with role so every heading
 * always has at least one entry (no empty sections for plain staff).
 */
function buildNavItems(admin: boolean, superAdmin: boolean): NavItem[] {
  return [
    heading('Arbeit'),
    { href: '/app', label: de.nav.dashboard, icon: <LayoutDashboard /> },
    { href: '/app/calendar', label: de.nav.calendar, icon: <CalendarDays /> },
    // Kunden & Projekte sind verschmolzen: ein Kunde öffnet direkt sein Board
    // (Kanban), Projekte sind weitere Boards innerhalb des Kunden.
    { href: '/app/clients', label: de.nav.clients, icon: <Building2 /> },
    { href: '/app/leads', label: de.nav.leads, icon: <Target /> },

    // Auswertung & Team/Motivation nur für Admins – Mitarbeiter sehen die
    // gleichen Team-/Kollegen-Infos in der rechten Leiste.
    ...(admin
      ? [
          heading('Auswertung'),
          { href: '/app/reports', label: de.nav.reports, icon: <BarChart3 /> },

          heading('Team & Motivation'),
          { href: '/app/team-radar', label: 'Team-Radar', icon: <Radar /> },
          { href: '/app/team', label: 'Management', icon: <Users /> },
          { href: '/app/motivation', label: 'Motivation', icon: <Trophy /> },
          { href: '/app/feedback', label: 'Feedback', icon: <MessageSquare /> },
        ]
      : []),

    heading('Ressourcen'),
    { href: '/app/passwords', label: 'Passwörter', icon: <KeyRound /> },
    // Finanzen (Ausgaben + Rechnungen) – nur Super-Admin.
    ...(superAdmin
      ? [{ href: '/app/finance', label: 'Finanzen', icon: <Wallet /> }]
      : []),
  ];
}

// Personal items visible to every agency staffer.
const MENU_ITEMS: UserMenuItem[] = [
  { href: '/app/profile', label: de.nav.profile },
  { href: '/app/kudos', label: de.nav.levelHub },
  { href: '/app/goals', label: de.goals.title },
  { href: '/app/absences', label: de.nav.absence },
  { href: '/app/notifications', label: de.nav.notifications },
  { href: '/app/time', label: de.nav.time },
];

// Management-only menu entries (configuration + diagnostics).
// Diagnose ist über die Einstellungen erreichbar (kein eigener Menüpunkt),
// damit die teuren Live-Checks nur bei Bedarf laufen.
const ADMIN_MENU_ITEMS: UserMenuItem[] = [
  { href: '/app/templates', label: de.nav.templates },
  { href: '/app/settings', label: de.nav.settings },
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
  const navItems = buildNavItems(admin, isSuperAdmin(user));
  const menuItems = admin ? [...MENU_ITEMS, ...ADMIN_MENU_ITEMS] : MENU_ITEMS;
  const coins = orgId ? await getCoinBalance(user.id, orgId) : undefined;
  const branding = orgId ? await getOrgBranding(orgId) : null;

  return (
    <AppShell
      navItems={navItems}
      menuItems={menuItems}
      areaLabel="Agenturbereich"
      logo={branding ? { dark: branding.logoDark, light: branding.logoLight } : undefined}
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

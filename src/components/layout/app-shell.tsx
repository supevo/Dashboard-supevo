import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { PresenceTracker } from '@/components/layout/presence-tracker';
import { CommandPalette } from '@/components/layout/command-palette';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Logo } from '@/components/layout/logo';
import { RunningTimer } from '@/components/layout/running-timer';
import { UserMenu, type UserMenuItem } from '@/components/layout/user-menu';
import { de } from '@/lib/i18n/de';

export interface NavItem {
  href: string;
  label: string;
  /** Optional leading icon (a rendered lucide element, single-colour). */
  icon?: React.ReactNode;
  /** Renders as a non-clickable section header instead of a link. */
  heading?: boolean;
}

interface AppShellProps {
  navItems: NavItem[];
  menuItems: UserMenuItem[];
  areaLabel: string;
  /** Which app area this shell renders – controls notification deep links. */
  area?: 'app' | 'portal';
  userId: string;
  userName: string;
  hasAvatar: boolean;
  searchEnabled?: boolean;
  level?: number;
  levelProgressPct?: number;
  status?: 'online' | 'afk' | 'dnd';
  coins?: number;
  /** Optional permanent right sidebar (e.g. the team rail). */
  rightRail?: React.ReactNode;
  /** Optional content pinned to the bottom of the left sidebar (e.g. the
   *  Pomodoro focus timer). Hidden on mobile with the rest of the sidebar. */
  sidebarFooter?: React.ReactNode;
  /** Optional badge rendered in the header (e.g. the Express-Ticket credit). */
  headerBadge?: React.ReactNode;
  /** When true, the header user menu hides on desktop (the right rail shows it),
   *  staying available on mobile where the rail is hidden. */
  userMenuInRail?: boolean;
  children: React.ReactNode;
}

/** Shared authenticated shell with sidebar navigation and a user menu. */
export function AppShell({
  navItems,
  menuItems,
  areaLabel,
  area = 'app',
  userId,
  userName,
  hasAvatar,
  searchEnabled = false,
  level,
  levelProgressPct,
  status,
  coins,
  rightRail,
  headerBadge,
  sidebarFooter,
  userMenuInRail = false,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6">
          <Logo className="h-7" />
          <p className="mt-1 text-xs text-muted-foreground">{areaLabel}</p>
        </div>
        <SidebarNav items={navItems} />
        {/* pb-16 keeps the footer clear of the floating feedback button that
            sits fixed at the bottom-left corner. */}
        {sidebarFooter && <div className="mt-auto pb-16 pt-4">{sidebarFooter}</div>}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav navItems={navItems} areaLabel={areaLabel} />
            <span className="truncate text-sm text-muted-foreground">
              {areaLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {headerBadge}
            {searchEnabled && <RunningTimer />}
            {searchEnabled && <CommandPalette />}
            <NotificationBell area={area} />
            <ThemeToggle />
            {typeof coins === 'number' && (
              <Link
                href="/app/kudos#belohnungen"
                title={de.hub.rewards.coinChipTitle}
                className="flex items-center gap-1 rounded-full border bg-amber-400/10 px-2.5 py-1 text-sm font-semibold text-amber-600 hover:bg-amber-400/20 dark:text-amber-400"
              >
                <span aria-hidden>🪙</span>
                <span>{coins}</span>
              </Link>
            )}
            <div className={userMenuInRail ? 'lg:hidden' : undefined}>
              <UserMenu
                userId={userId}
                name={userName}
                hasAvatar={hasAvatar}
                items={menuItems}
                level={level}
                progressPct={levelProgressPct}
                status={status}
              />
            </div>
          </div>
        </header>
        <PresenceTracker />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      {rightRail}
    </div>
  );
}

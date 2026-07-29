import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { PresenceTracker } from '@/components/layout/presence-tracker';
import { CommandPalette } from '@/components/layout/command-palette';
import { MobileNav } from '@/components/layout/mobile-nav';
import { RunningTimer } from '@/components/layout/running-timer';
import { UserMenu, type UserMenuItem } from '@/components/layout/user-menu';
import { de } from '@/lib/i18n/de';

export interface NavItem {
  href: string;
  label: string;
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
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r bg-card p-4 md:block">
        <div className="mb-6">
          <p className="text-sm font-bold text-primary">{de.app.name}</p>
          <p className="text-xs text-muted-foreground">{areaLabel}</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
        </header>
        <PresenceTracker />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      {rightRail}
    </div>
  );
}

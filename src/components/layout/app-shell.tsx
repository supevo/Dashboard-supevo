import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
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
  userId: string;
  userName: string;
  hasAvatar: boolean;
  children: React.ReactNode;
}

/** Shared authenticated shell with sidebar navigation and a user menu. */
export function AppShell({
  navItems,
  menuItems,
  areaLabel,
  userId,
  userName,
  hasAvatar,
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
        <header className="flex items-center justify-between border-b bg-card px-6 py-3">
          <span className="text-sm text-muted-foreground">{areaLabel}</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu
              userId={userId}
              name={userName}
              hasAvatar={hasAvatar}
              items={menuItems}
            />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/components/layout/app-shell';
import { cn } from '@/lib/utils';

/** True when the current path is (under) a nav item's href. Root items
 *  ('/app', '/portal') match exactly so they don't light up on every subpage. */
export function isNavActive(pathname: string, href: string): boolean {
  const isRoot = href === '/app' || href === '/portal';
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar navigation with active-route highlighting and section headings. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 overflow-y-auto">
      {items.map((item) =>
        item.heading ? (
          <div
            key={`h-${item.label}`}
            className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-0"
          >
            {item.label}
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isNavActive(pathname, item.href) ? 'page' : undefined}
            className={cn(
              'block rounded-md px-3 py-2 text-sm transition-colors',
              isNavActive(pathname, item.href)
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

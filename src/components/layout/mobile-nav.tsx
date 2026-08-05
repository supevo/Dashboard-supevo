'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/components/layout/app-shell';
import { de } from '@/lib/i18n/de';

/** Hamburger button + slide-in drawer navigation for small screens (< md). */
export function MobileNav({
  navItems,
  areaLabel,
}: {
  navItems: NavItem[];
  areaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={de.nav.menu}
        className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={de.common.close}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <nav className="relative flex h-full w-64 max-w-[80vw] flex-col border-r bg-card p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-primary">{de.app.name}</p>
                <p className="text-xs text-muted-foreground">{areaLabel}</p>
              </div>
              <button
                type="button"
                aria-label={de.common.close}
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto">
              {navItems.map((item) =>
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
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOutAction } from '@/features/auth/actions';
import { Avatar } from '@/components/ui/avatar';
import { SubmitButton } from '@/components/ui/submit-button';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export interface UserMenuItem {
  href: string;
  label: string;
}

/** Avatar + name button in the header that opens a dropdown with profile links. */
export function UserMenu({
  userId,
  name,
  hasAvatar,
  items,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  items: UserMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar userId={userId} name={name} hasAvatar={hasAvatar} size="md" />
        <span className="hidden text-sm font-medium sm:inline">{name}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-40 mt-2 w-56 rounded-md border bg-card p-1 shadow-lg',
          )}
        >
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
          </div>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
              role="menuitem"
            >
              {item.label}
            </Link>
          ))}
          <div className="border-t px-1 pt-1">
            <form action={signOutAction}>
              <SubmitButton variant="ghost" size="sm" className="w-full">
                {de.auth.logout}
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

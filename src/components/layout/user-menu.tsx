'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/features/auth/actions';
import { setUserStatusAction } from '@/features/gamification/actions';
import { Avatar } from '@/components/ui/avatar';
import { SubmitButton } from '@/components/ui/submit-button';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export interface UserMenuItem {
  href: string;
  label: string;
}

type Status = 'online' | 'afk' | 'dnd';

const STATUS: Record<Status, { dot: string; icon: string }> = {
  online: { dot: 'bg-emerald-500', icon: '' },
  afk: { dot: 'bg-amber-500', icon: '🕐' },
  dnd: { dot: 'bg-red-500', icon: '' },
};

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-4 w-4', className)} aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Avatar ringed by a level-progress circle with the level number at the bottom. */
function LevelAvatar({
  userId,
  name,
  hasAvatar,
  level,
  progressPct,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  level: number;
  progressPct: number;
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, progressPct)) / 100);
  return (
    <div className="relative h-[52px] w-[52px] shrink-0">
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-[7px]">
        <Avatar userId={userId} name={name} hasAvatar={hasAvatar} size="lg" className="h-[38px] w-[38px]" />
      </div>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground shadow">
        {de.level.short} {level}
      </span>
    </div>
  );
}

/** Header avatar + name that opens a dropdown with status + profile links. */
export function UserMenu({
  userId,
  name,
  hasAvatar,
  items,
  level,
  progressPct = 0,
  status = 'online',
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  items: UserMenuItem[];
  level?: number;
  progressPct?: number;
  status?: Status;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Status>(status);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const gamified = typeof level === 'number';

  useEffect(() => setCurrent(status), [status]);

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

  const pickStatus = async (s: Status) => {
    setCurrent(s);
    await setUserStatusAction(s);
    router.refresh();
  };

  const st = STATUS[current];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {gamified ? (
          <LevelAvatar
            userId={userId}
            name={name}
            hasAvatar={hasAvatar}
            level={level}
            progressPct={progressPct}
          />
        ) : (
          <Avatar userId={userId} name={name} hasAvatar={hasAvatar} size="md" />
        )}
        <span className="hidden text-left sm:block">
          <span className="flex items-center gap-1 text-sm font-medium">
            {name}
            <ChevronDown className="text-muted-foreground" />
          </span>
          {gamified && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={cn('inline-block h-2 w-2 rounded-full', st.dot)} />
              {st.icon} {de.presence[current]}
            </span>
          )}
        </span>
        {!gamified && <ChevronDown className="text-muted-foreground sm:hidden" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 rounded-md border bg-card p-1 shadow-lg"
        >
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
          </div>

          {gamified && (
            <div className="border-b py-1">
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase text-muted-foreground">
                {de.presence.title}
              </p>
              {(['online', 'afk', 'dnd'] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void pickStatus(s)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted',
                    current === s && 'bg-muted',
                  )}
                  role="menuitemradio"
                  aria-checked={current === s}
                >
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', STATUS[s].dot)} />
                  <span>
                    {STATUS[s].icon} {de.presence[s]}
                  </span>
                </button>
              ))}
            </div>
          )}

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

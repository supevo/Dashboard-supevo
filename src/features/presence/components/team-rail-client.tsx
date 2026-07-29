'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { UserMenu } from '@/components/layout/user-menu';
import type { TeamRailData, RailMember } from '@/features/presence/team-rail';
import type { RailSelfMenu } from '@/features/presence/components/team-rail';
import { de } from '@/lib/i18n/de';

const POLL_MS = 20_000;

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  afk: 'Abwesend',
  dnd: 'Nicht stören',
};

function statusText(status: string | null): string {
  return status ? STATUS_LABEL[status] ?? 'Online' : 'Offline';
}

function activityLine(m: RailMember): string | null {
  if (!m.activity) return null;
  const { projectName, taskTitle, live } = m.activity;
  if (live) return projectName ? `▶ ${projectName}` : '▶ Zeiterfassung läuft';
  return projectName ? `zuletzt: ${projectName}` : `zuletzt: ${taskTitle}`;
}

/** Opens the chat dock on a DM with the given user (ChatDock listens). */
function startChat(userId: string) {
  window.dispatchEvent(new CustomEvent('supevo:open-dm', { detail: userId }));
}

function MemberRow({ m }: { m: RailMember }) {
  const [hover, setHover] = useState(false);
  const line = activityLine(m);

  return (
    <li
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => startChat(m.userId)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
      >
        <Avatar userId={m.userId} name={m.name} hasAvatar={m.hasAvatar} status={m.status} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {line ?? statusText(m.status)}
          </span>
        </span>
      </button>

      {hover && (
        <div className="absolute right-full top-0 z-50 mr-2 w-64 rounded-xl border bg-card p-3 shadow-xl">
          <div className="flex items-center gap-3">
            <Avatar userId={m.userId} name={m.name} hasAvatar={m.hasAvatar} status={m.status} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {de.level.short} {m.level} · {m.roleLabel}
              </div>
              <div className="text-xs text-muted-foreground">{statusText(m.status)}</div>
            </div>
          </div>

          {m.activity && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-2 text-xs">
              <div className="font-medium text-foreground">
                {m.activity.live ? '▶ Arbeitet gerade' : 'Zuletzt gearbeitet'}
              </div>
              {m.activity.projectName && (
                <div className="mt-0.5 truncate text-muted-foreground">
                  Projekt: {m.activity.projectName}
                </div>
              )}
              <div className="truncate text-muted-foreground">Aufgabe: {m.activity.taskTitle}</div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => startChat(m.userId)}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Chat beginnen
            </button>
            <Link
              href={`/app/team/${m.userId}`}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Profil
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Discord-style team rail: own avatar on top, colleagues below with presence
 * and current/last activity. Hovering a colleague opens a tooltip with their
 * profile, what they're working on, and a "Chat beginnen" button.
 */
export function TeamRailClient({
  initial,
  selfMenu,
}: {
  initial: TeamRailData;
  selfMenu: RailSelfMenu;
}) {
  const [data, setData] = useState(initial);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/team/rail', { cache: 'no-store' });
      if (!res.ok) return;
      setData((await res.json()) as TeamRailData);
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const online = data.members.filter((m) => m.status && m.status !== 'offline');
  const offline = data.members.filter((m) => !m.status || m.status === 'offline');

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l bg-card lg:flex">
      {/* Own profile + menu (moved here from the header to avoid duplication) */}
      <div className="border-b p-3">
        <UserMenu
          userId={selfMenu.userId}
          name={selfMenu.name}
          hasAvatar={selfMenu.hasAvatar}
          items={selfMenu.items}
          level={selfMenu.level}
          progressPct={selfMenu.progressPct}
          status={selfMenu.status}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {online.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aktiv – {online.length}
            </div>
            <ul className="space-y-0.5">
              {online.map((m) => (
                <MemberRow key={m.userId} m={m} />
              ))}
            </ul>
          </>
        )}

        {offline.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Offline – {offline.length}
            </div>
            <ul className="space-y-0.5 opacity-70">
              {offline.map((m) => (
                <MemberRow key={m.userId} m={m} />
              ))}
            </ul>
          </>
        )}

        {data.members.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">Keine Kolleg:innen.</p>
        )}
      </div>
    </aside>
  );
}

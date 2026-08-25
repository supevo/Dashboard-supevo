'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/features/notifications/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { formatBerlinDateTime } from '@/lib/time';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import type { NotificationView } from '@/features/notifications/queries';
import type { NotificationType } from '@/lib/database.types';
import { notificationHref } from '@/features/notifications/deep-link';

function deepLink(area: 'app' | 'portal', n: NotificationView): string | null {
  return notificationHref(area, n.entityType, n.entityId);
}

function NotificationRow({
  area,
  n,
}: {
  area: 'app' | 'portal';
  n: NotificationView;
}) {
  const [, markRead] = useActionState(markNotificationReadAction, idleResult);
  const [, del] = useActionState(deleteNotificationAction, idleResult);
  const href = deepLink(area, n);

  return (
    <li
      className={`flex items-start justify-between gap-3 py-3 ${
        n.isRead ? 'opacity-60' : ''
      }`}
    >
      {href ? (
        <Link
          href={href}
          className="group min-w-0 flex-1"
          aria-label={de.notifications.open}
        >
          <div className="text-sm font-medium group-hover:underline">
            {!n.isRead && (
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
            )}
            {n.title}
          </div>
          {n.body && (
            <div className="truncate text-xs text-muted-foreground">{n.body}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {de.notificationType[n.type]} · {formatBerlinDateTime(n.createdAt)}
          </div>
        </Link>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {!n.isRead && (
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
            )}
            {n.title}
          </div>
          {n.body && (
            <div className="truncate text-xs text-muted-foreground">{n.body}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {de.notificationType[n.type]} · {formatBerlinDateTime(n.createdAt)}
          </div>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {href && (
          <Link href={href} className="text-sm text-primary hover:underline">
            {de.notifications.open}
          </Link>
        )}
        {!n.isRead && (
          <form action={markRead}>
            <input type="hidden" name="notificationId" value={n.id} />
            <SubmitButton variant="ghost" size="sm">
              {de.notifications.markRead}
            </SubmitButton>
          </form>
        )}
        <form action={del}>
          <input type="hidden" name="notificationId" value={n.id} />
          <SubmitButton variant="ghost" size="sm">
            {de.notifications.delete}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

export function NotificationList({
  area,
  notifications,
}: {
  area: 'app' | 'portal';
  notifications: NotificationView[];
}) {
  const [filter, setFilter] = useState<'all' | NotificationType>('all');
  const [allReadState, markAll] = useActionState(
    async () => markAllNotificationsReadAction(),
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (allReadState.status === 'success') router.refresh();
  }, [allReadState, router]);

  const types = [...new Set(notifications.map((n) => n.type))];
  const shown =
    filter === 'all'
      ? notifications
      : notifications.filter((n) => n.type === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | NotificationType)}
          className="h-9 w-auto"
        >
          <option value="all">
            {de.notifications.filter}: {de.notifications.all}
          </option>
          {types.map((t) => (
            <option key={t} value={t}>
              {de.notificationType[t]}
            </option>
          ))}
        </Select>
        <form action={markAll}>
          <SubmitButton variant="outline" size="sm">
            {de.notifications.markAllRead}
          </SubmitButton>
        </form>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.notifications.none}</p>
      ) : (
        <ul className="divide-y">
          {shown.map((n) => (
            <NotificationRow key={n.id} area={area} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

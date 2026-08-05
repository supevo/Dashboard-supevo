import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listNotifications } from '@/features/notifications/queries';
import { NotificationList } from '@/features/notifications/components/notification-list';
import { getMyTaskNotifyPref } from '@/features/notification-prefs/queries';
import { TaskNotifyToggle } from '@/features/notification-prefs/components/task-notify-toggle';
import { de } from '@/lib/i18n/de';

export default async function PortalNotificationsPage() {
  await requireClientPage();
  const [notifications, taskNotify] = await Promise.all([
    listNotifications(),
    getMyTaskNotifyPref(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.notifications.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>⚙️ Einstellungen</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskNotifyToggle enabled={taskNotify} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.notifications.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationList area="portal" notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  );
}

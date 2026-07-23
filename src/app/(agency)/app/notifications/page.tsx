import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listNotifications } from '@/features/notifications/queries';
import { NotificationList } from '@/features/notifications/components/notification-list';
import { de } from '@/lib/i18n/de';

export default async function AgencyNotificationsPage() {
  await requireAgencyPage();
  const notifications = await listNotifications();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.notifications.title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{de.notifications.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationList area="app" notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  );
}

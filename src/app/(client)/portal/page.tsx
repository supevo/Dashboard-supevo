import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Willkommen</h1>
        <p className="text-muted-foreground">
          Schön, dass Sie da sind, {user?.fullName ?? user?.email}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Kundenportal</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ihre freigegebenen Projekte, Aufgaben und Freigaben erscheinen hier,
          sobald die entsprechenden Bereiche in den nächsten Phasen aktiviert
          werden.
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';

export default async function AgencyDashboardPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Übersicht</h1>
        <p className="text-muted-foreground">
          Willkommen zurück, {user?.fullName ?? user?.email}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Agenturbereich</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Das Fundament steht. Projektübersicht, Kanban, Zeiterfassung und
          weitere Bereiche folgen in den nächsten Phasen.
        </CardContent>
      </Card>
    </div>
  );
}

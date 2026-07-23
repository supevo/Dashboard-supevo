import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';
import { de } from '@/lib/i18n/de';

export default async function ClientProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.nav.profile}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{user.fullName ?? user.email}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">E-Mail: </span>
            {user.email}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

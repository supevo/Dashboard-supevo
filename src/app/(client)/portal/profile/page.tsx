import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';
import { getMyClientProfile } from '@/features/client-companies/queries';
import { MyClientProfileForm } from '@/features/client-companies/components/my-client-profile-form';
import { de } from '@/lib/i18n/de';

export default async function ClientProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getMyClientProfile();

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

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>{de.clientProfile.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {de.clientProfile.portalHint}
            </p>
          </CardHeader>
          <CardContent>
            <MyClientProfileForm
              industry={profile.industry}
              brands={profile.brands}
              interests={profile.interests}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AvatarUploader } from '@/features/profile/components/avatar-uploader';
import { de } from '@/lib/i18n/de';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Administrator',
  agency_admin: 'Agentur Administrator',
  project_manager: 'Projektleiter',
  employee: 'Mitarbeiter',
  freelancer: 'Freelancer',
  client: 'Kunde',
  guest: 'Gast',
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.nav.profile}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{de.profile.picture}</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUploader
            userId={user.id}
            name={user.fullName ?? user.email}
            hasAvatar={Boolean(profile?.avatar_url)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{user.fullName ?? user.email}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">E-Mail: </span>
            {user.email}
          </p>
          <div>
            <span className="text-muted-foreground">Rollen: </span>
            {user.memberships
              .map((m) => ROLE_LABELS[m.role] ?? m.role)
              .join(', ') || '—'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

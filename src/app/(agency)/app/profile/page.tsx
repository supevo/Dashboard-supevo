import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/features/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AvatarUploader } from '@/features/profile/components/avatar-uploader';
import { ProfileForm } from '@/features/profile/components/profile-form';
import { SkillsPrefsSection } from '@/features/skills/components/skills-prefs-section';
import { listMySkills } from '@/features/skills/queries';
import { listMyPreferences } from '@/features/preferences/queries';
import { getKudosStats } from '@/features/kudos/queries';
import { badgeLabel, levelForPoints } from '@/features/kudos/badges';
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

  const [skills, preferences, kudos] = await Promise.all([
    listMySkills(user.id),
    listMyPreferences(user.id),
    getKudosStats(user.id),
  ]);
  const { level, next } = levelForPoints(kudos.totalPoints);

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
          <CardTitle>Angaben</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfileForm
            fullName={user.fullName ?? ''}
            email={user.email}
          />
          <div className="border-t pt-3 text-sm">
            <span className="text-muted-foreground">Rollen: </span>
            {user.memberships
              .map((m) => ROLE_LABELS[m.role] ?? m.role)
              .join(', ') || '—'}
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>🏆 {de.kudos.myKudos}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-2xl font-bold">Level {level}</div>
              <div className="text-xs text-muted-foreground">
                {kudos.totalPoints} / {next} {de.kudos.points}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">{kudos.count}</div>
              <div className="text-xs text-muted-foreground">{de.kudos.received}</div>
            </div>
            {kudos.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {kudos.badges.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-background px-2 py-1 text-xs"
                  >
                    {badgeLabel(b)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.skills.title} &amp; Lieblingsarbeit</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillsPrefsSection skills={skills} preferences={preferences} />
        </CardContent>
      </Card>
    </div>
  );
}

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { AcceptInviteForm } from '@/features/auth/components/accept-invite-form';
import { getValidInvitationByToken } from '@/features/invitations/queries';
import { de } from '@/lib/i18n/de';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getValidInvitationByToken(token);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.auth.inviteTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {invite ? (
          <AcceptInviteForm token={token} email={invite.email} />
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">{de.errors.invalidInvite}</Alert>
            <Link href="/login" className="text-sm text-primary hover:underline">
              {de.common.backToLogin}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listOrgMembers } from '@/features/memberships/queries';
import { listOpenInvitations } from '@/features/invitations/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { InviteForm } from '@/features/memberships/components/invite-form';
import { MemberRow } from '@/features/memberships/components/member-row';
import { InvitationRow } from '@/features/invitations/components/invitation-row';
import { de } from '@/lib/i18n/de';

export default async function TeamPage() {
  const { orgId } = await requireOrgAdminPage();
  const [members, invitations, companies] = await Promise.all([
    listOrgMembers(orgId),
    listOpenInvitations(orgId),
    listClientCompanies(orgId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.team.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{de.team.inviteTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm orgId={orgId} clientCompanies={companies} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.team.members}</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.team.noMembers}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {members.map((m) => (
                    <MemberRow key={m.membershipId} orgId={orgId} member={m} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.team.openInvitations}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {de.team.noInvitations}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {invitations.map((i) => (
                    <InvitationRow key={i.id} orgId={orgId} invitation={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listOrgMembers } from '@/features/memberships/queries';
import { listOpenInvitations } from '@/features/invitations/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { InviteForm } from '@/features/memberships/components/invite-form';
import { MemberRow } from '@/features/memberships/components/member-row';
import { InvitationRow } from '@/features/invitations/components/invitation-row';
import { APP_ROLES, ROLE_RANK } from '@/lib/authz/roles';
import { de } from '@/lib/i18n/de';

// Rollen als sichtbare Kategorien, nach Rang (privilegiert zuerst).
const ROLE_ORDER = [...APP_ROLES].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);

export default async function TeamPage() {
  const { user, orgId } = await requireOrgAdminPage();
  const canPurge = isSuperAdmin(user);
  const [members, invitations, companies] = await Promise.all([
    listOrgMembers(orgId),
    listOpenInvitations(orgId),
    listClientCompanies(orgId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Management</h1>

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
            <div className="space-y-5">
              {ROLE_ORDER.map((role) => {
                const group = members.filter((m) => m.role === role);
                if (group.length === 0) return null;
                return (
                  <div key={role}>
                    <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {de.roles[role]}
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case">
                        {group.length}
                      </span>
                    </h3>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <tbody>
                          {group.map((m) => (
                            <MemberRow
                              key={m.membershipId}
                              orgId={orgId}
                              member={m}
                              canPurge={canPurge}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
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

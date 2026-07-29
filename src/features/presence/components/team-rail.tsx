import { getTeamRail } from '@/features/presence/team-rail';
import { TeamRailClient } from '@/features/presence/components/team-rail-client';

/** Server wrapper: fetches the team rail and renders the client rail (agency). */
export async function TeamRail() {
  const data = await getTeamRail();
  if (!data) return null;
  return <TeamRailClient initial={data} />;
}

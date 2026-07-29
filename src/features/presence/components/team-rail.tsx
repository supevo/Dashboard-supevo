import { getTeamRail } from '@/features/presence/team-rail';
import { TeamRailClient } from '@/features/presence/components/team-rail-client';
import type { UserMenuItem } from '@/components/layout/user-menu';

/** Data for the self profile menu shown at the top of the rail. */
export interface RailSelfMenu {
  userId: string;
  name: string;
  hasAvatar: boolean;
  items: UserMenuItem[];
  level?: number;
  progressPct?: number;
  status?: 'online' | 'afk' | 'dnd';
}

/** Server wrapper: fetches the team rail and renders the client rail (agency). */
export async function TeamRail({ selfMenu }: { selfMenu: RailSelfMenu }) {
  const data = await getTeamRail();
  if (!data) return null;
  return <TeamRailClient initial={data} selfMenu={selfMenu} />;
}

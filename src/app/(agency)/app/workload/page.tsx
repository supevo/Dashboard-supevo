import { redirect } from 'next/navigation';

/** Merged into Team-Radar (tab „Auslastung"). Kept as a redirect so old
 *  bookmarks and deep links keep working. */
export default function WorkloadRedirect() {
  redirect('/app/team-radar?tab=auslastung');
}

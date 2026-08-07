import { redirect } from 'next/navigation';

/** Merged into Team-Radar (tab „Punkte & Level"). Kept as a redirect so old
 *  bookmarks and deep links keep working. */
export default function CockpitRedirect() {
  redirect('/app/team-radar?tab=punkte');
}

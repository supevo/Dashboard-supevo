import { redirect } from 'next/navigation';

/** Merged into the Motivation-Hub (tab „Challenges & XP"). Kept as a redirect
 *  so old bookmarks and deep links keep working. */
export default function ChallengesRedirect() {
  redirect('/app/motivation?tab=challenges');
}

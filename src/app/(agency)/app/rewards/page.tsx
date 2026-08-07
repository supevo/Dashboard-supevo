import { redirect } from 'next/navigation';

/** Admin loot management moved into the Motivation-Hub (tab „Belohnungen");
 *  the employee-facing shop lives in the Level Hub. Kept as a redirect so old
 *  bookmarks and deep links keep working. */
export default function RewardsRedirect() {
  redirect('/app/motivation?tab=belohnungen');
}

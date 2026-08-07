import { redirect } from 'next/navigation';

/** The XP ranking is part of the Level Hub. This standalone page was a
 *  duplicate; kept as a redirect so old bookmarks keep working. */
export default function LeaderboardRedirect() {
  redirect('/app/kudos');
}

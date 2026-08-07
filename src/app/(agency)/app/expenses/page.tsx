import { redirect } from 'next/navigation';

/** Moved into the Finanzen module (tab „Ausgaben"). Kept as a redirect so old
 *  bookmarks and deep links keep working. */
export default function ExpensesRedirect() {
  redirect('/app/finance?tab=ausgaben');
}

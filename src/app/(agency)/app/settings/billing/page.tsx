import { redirect } from 'next/navigation';

/** Moved into the Finanzen module (tab „Rechnungen"). Kept as a redirect so old
 *  bookmarks and deep links keep working. */
export default function BillingSettingsRedirect() {
  redirect('/app/finance?tab=rechnungen');
}

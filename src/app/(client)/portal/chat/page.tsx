import { redirect } from 'next/navigation';

/** The client chat now lives in the floating dock (bottom-right), not as a
 *  page. Redirect any old links/bookmarks to the dashboard. */
export default function PortalChatRedirect() {
  redirect('/portal');
}

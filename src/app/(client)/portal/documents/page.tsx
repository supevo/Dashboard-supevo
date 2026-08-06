import { redirect } from 'next/navigation';

/**
 * The dedicated documents page was retired: contracts & mandates now live under
 * "Mitgliedschaft", brand files under "Brand", invoices under "Rechnungen".
 * Kept as a redirect so old links keep working.
 */
export default function PortalDocumentsPage() {
  redirect('/portal/membership');
}

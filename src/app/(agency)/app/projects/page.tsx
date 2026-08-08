import { redirect } from 'next/navigation';

/**
 * Projects and clients are merged: a client opens directly onto its board.
 * The former project gallery now lives inside the client overview.
 */
export default function ProjectsPage() {
  redirect('/app/clients');
}

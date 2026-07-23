import { redirect } from 'next/navigation';
import { getCurrentUser, landingPathFor } from '@/features/auth/session';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(landingPathFor(user));
}

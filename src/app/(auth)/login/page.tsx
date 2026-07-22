import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/components/login-form';
import { getCurrentUser, landingPathFor } from '@/features/auth/session';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { de } from '@/lib/i18n/de';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    redirect(safeRedirectPath(redirectTo, landingPathFor(user)));
  }
  const safeTarget = safeRedirectPath(redirectTo, '');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.auth.loginTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={safeTarget || undefined} />
      </CardContent>
    </Card>
  );
}

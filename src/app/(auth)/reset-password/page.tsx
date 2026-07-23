import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { de } from '@/lib/i18n/de';

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.auth.resetPasswordTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}

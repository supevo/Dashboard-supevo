import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { de } from '@/lib/i18n/de';

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.auth.forgotPasswordTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}

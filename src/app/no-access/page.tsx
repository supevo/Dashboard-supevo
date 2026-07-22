import { signOutAction } from '@/features/auth/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { de } from '@/lib/i18n/de';

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Noch kein Zugang</h1>
      <p className="max-w-md text-muted-foreground">{de.errors.noAccess}</p>
      <form action={signOutAction}>
        <SubmitButton variant="outline">{de.auth.logout}</SubmitButton>
      </form>
    </main>
  );
}

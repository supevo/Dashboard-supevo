import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-destructive">403</p>
      <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
      <p className="text-muted-foreground">{de.errors.FORBIDDEN}</p>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        Zur Startseite
      </Link>
    </main>
  );
}

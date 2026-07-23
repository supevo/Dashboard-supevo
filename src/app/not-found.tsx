import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-semibold">Seite nicht gefunden</h1>
      <p className="text-muted-foreground">{de.errors.NOT_FOUND}</p>
      <Link href="/" className={buttonVariants()}>
        Zur Startseite
      </Link>
    </main>
  );
}

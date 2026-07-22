import { de } from '@/lib/i18n/de';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-primary">
          {de.app.name}
        </h1>
        {children}
      </div>
    </main>
  );
}

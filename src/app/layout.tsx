import type { Metadata } from 'next';
import './globals.css';
import { de } from '@/lib/i18n/de';
import { ACTIVE_BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: de.app.name,
  description: 'Mandantenfähiges Projektmanagement für Agentur und Kunden.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" data-brand={ACTIVE_BRAND} suppressHydrationWarning>
      <head>
        {/* Apply the stored (or system) theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

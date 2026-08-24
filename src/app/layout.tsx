import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { de } from '@/lib/i18n/de';
import { BRAND_COOKIE, resolveBrand } from '@/lib/brand';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: de.app.name,
  description: 'Mandantenfähiges Projektmanagement für Agentur und Kunden.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'supevo', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0f0d10',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = resolveBrand((await cookies()).get(BRAND_COOKIE)?.value);
  return (
    <html lang="de" data-brand={brand} suppressHydrationWarning>
      <head>
        {/* Apply the stored (or system) theme + colour palette before paint to
            avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}var p=localStorage.getItem('palette');if(p&&p!=='default'){document.documentElement.setAttribute('data-palette',p);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

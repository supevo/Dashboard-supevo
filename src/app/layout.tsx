import type { Metadata } from 'next';
import './globals.css';
import { de } from '@/lib/i18n/de';

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
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

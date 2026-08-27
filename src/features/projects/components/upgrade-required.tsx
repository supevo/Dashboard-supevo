import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Shown to supevo-Smart (Baukasten/Legacy) clients where the task board would
 * be – the interactive board is a supevo Stage 1 & 2 feature.
 */
export function ProjectsUpgradeRequired() {
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-3xl">🚀</div>
        <h2 className="text-lg font-semibold">Upgrade auf supevo Stage 1 &amp; 2</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Das Aufgaben-Board ist Teil von supevo Stage 1 &amp; 2. Damit können Sie
          beliebig viele Aufgaben einreichen, die wir nacheinander abarbeiten.
          Sprechen Sie Ihren Ansprechpartner an.
        </p>
        <Link
          href="/portal/membership"
          className="mt-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Mitgliedschaft ansehen
        </Link>
      </CardContent>
    </Card>
  );
}

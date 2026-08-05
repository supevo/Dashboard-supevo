import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import type { AccountManager } from '@/features/account-manager/queries';

/**
 * Client-facing card for the responsible account manager: photo, name and
 * direct actions (chat, request an appointment). Server component – no client
 * state needed. Rendered on the portal dashboard.
 */
export function AccountManagerCard({ manager }: { manager: AccountManager }) {
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <Avatar
          userId={manager.userId}
          name={manager.name}
          hasAvatar={manager.hasAvatar}
          status={manager.status}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {manager.role === 'secondary'
              ? 'Ihre Vertretung'
              : 'Ihr Ansprechpartner'}
          </div>
          <div className="truncate text-lg font-semibold">{manager.name}</div>
          <div className="text-xs text-muted-foreground">
            {manager.role === 'secondary'
              ? 'Vertretung – falls euer Hauptkontakt nicht erreichbar ist.'
              : 'Für alle Fragen rund um eure Betreuung.'}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/portal/chat"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            💬 Chat starten
          </Link>
          <Link
            href="/portal/appointments"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            📅 Termin vereinbaren
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

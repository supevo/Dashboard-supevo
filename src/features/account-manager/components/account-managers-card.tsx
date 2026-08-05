import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { OpenChatButton } from '@/features/account-manager/components/open-chat-button';
import type { AccountManager } from '@/features/account-manager/queries';

/**
 * Client-facing card for the responsible contact(s): the main contact and – if
 * set – a second one shown right next to them. One shared chat (messages reach
 * everyone registered) and appointment action. Rendered on the portal dashboard.
 */
export function AccountManagersCard({
  primary,
  secondary,
}: {
  primary: AccountManager;
  secondary: AccountManager | null;
}) {
  const people = [primary, ...(secondary ? [secondary] : [])];

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {people.length > 1 ? 'Ihre Ansprechpartner' : 'Ihr Ansprechpartner'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-5">
            {people.map((p) => (
              <div key={p.userId} className="flex items-center gap-2.5">
                <Avatar
                  userId={p.userId}
                  name={p.name}
                  hasAvatar={p.hasAvatar}
                  status={p.status}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Für alle Fragen rund um eure Betreuung.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <OpenChatButton />
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

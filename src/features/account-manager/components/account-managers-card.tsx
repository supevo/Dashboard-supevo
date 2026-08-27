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
              <div key={p.userId} className="flex items-start gap-2.5">
                <Avatar
                  userId={p.userId}
                  name={p.name}
                  hasAvatar={p.hasAvatar}
                  status={p.status}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    {p.status === 'online' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Online
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs">
                    {p.phone ? (
                      <a
                        href={`tel:${p.phone.replace(/\s+/g, '')}`}
                        className="block text-muted-foreground hover:text-foreground"
                      >
                        📞 {p.phone}
                      </a>
                    ) : null}
                    {p.email ? (
                      <a
                        href={`mailto:${p.email}`}
                        className="block truncate text-muted-foreground hover:text-foreground"
                      >
                        ✉️ {p.email}
                      </a>
                    ) : null}
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

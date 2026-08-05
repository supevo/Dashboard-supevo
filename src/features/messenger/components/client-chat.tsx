'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { sendClientChatMessageAction } from '@/features/messenger/client-chat-actions';
import type { ChannelMessage } from '@/features/messenger/queries';
import { cn } from '@/lib/utils';

/**
 * Client-facing chat with the account manager. Deliberately simple: text
 * messages only — no stickers, no polls. Refreshes periodically so replies from
 * the agency show up. Used both in the portal and shareable elsewhere.
 */
export interface ChatPartner {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

export function ClientChat({
  channelId,
  initialMessages,
  meId,
  partner = null,
}: {
  channelId: string;
  initialMessages: ChannelMessage[];
  meId: string;
  /** The account manager on the other side, for the chat header. */
  partner?: ChatPartner | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Poll for new messages every 15s.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [initialMessages.length]);

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const res = await sendClientChatMessageAction(channelId, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <div className="flex h-[65vh] flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Avatar
          userId={partner?.userId ?? ''}
          name={partner?.name ?? 'Support-Team'}
          hasAvatar={partner?.hasAvatar ?? false}
          status={partner?.status ?? null}
          size="sm"
        />
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {partner?.name ?? 'Ihr Support-Team'}
          </div>
          <div className="text-xs text-muted-foreground">
            {partner ? 'Ihr fester Ansprechpartner' : 'Wir sind für euch da'}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {initialMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Nachrichten. Schreibt uns – wir sind für euch da!
          </p>
        ) : (
          initialMessages.map((m) => {
            const mine = m.authorId === meId;
            return (
              <div
                key={m.id}
                className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}
              >
                {m.authorId && (
                  <Avatar
                    userId={m.authorId}
                    name={m.authorName}
                    hasAvatar={m.authorHasAvatar}
                    size="sm"
                  />
                )}
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                    mine
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted',
                  )}
                >
                  {!mine && (
                    <div className="mb-0.5 text-xs font-medium opacity-70">
                      {m.authorName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            placeholder="Nachricht schreiben…"
            className="max-h-32 min-h-[40px] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button size="sm" type="button" onClick={send} disabled={pending}>
            Senden
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { sendClientChatMessageAction } from '@/features/messenger/client-chat-actions';
import type { ChannelMessage } from '@/features/messenger/queries';
import { cn } from '@/lib/utils';

export interface DockPartner {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

const POLL_MS = 10_000;
/** Custom event other components can dispatch to open the dock. */
export const OPEN_CLIENT_CHAT_EVENT = 'supevo:open-client-chat';

/**
 * Floating chat widget for the client portal — same idea as the agency chat
 * dock, but a single conversation with the responsible contact(s). Lives in the
 * portal layout (bottom-right), so it is NOT a left-menu entry. Messages go to
 * every registered contact (handled server-side).
 */
export function ClientChatDock({
  meId,
  partners,
}: {
  meId: string;
  partners: DockPartner[];
}) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/chat', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        channelId: string | null;
        messages: ChannelMessage[];
      };
      setChannelId(data.channelId);
      setMessages(data.messages ?? []);
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  // Open on external event (e.g. the "Chat starten" button on the dashboard).
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_CLIENT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_CLIENT_CHAT_EVENT, handler);
  }, []);

  // Poll only while open.
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send() {
    const text = body.trim();
    if (!text || !channelId) return;
    setError(null);
    setSending(true);
    try {
      const res = await sendClientChatMessageAction(channelId, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody('');
      await load();
    } catch {
      setError('Senden fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  }

  const title = partners.length > 0 ? 'Ihre Ansprechpartner' : 'Ihr Team';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        💬 Chat
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[70vh] max-h-[560px] w-[92vw] max-w-[380px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <div className="flex -space-x-2">
          {partners.length > 0 ? (
            partners.map((p) => (
              <Avatar
                key={p.userId}
                userId={p.userId}
                name={p.name}
                hasAvatar={p.hasAvatar}
                status={p.status}
                size="sm"
              />
            ))
          ) : (
            <Avatar userId="" name="Team" hasAvatar={false} size="sm" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {partners.length > 0 && (
            <div className="truncate text-xs text-muted-foreground">
              {partners.map((p) => p.name).join(' · ')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Chat schließen"
          className="rounded px-1.5 text-lg text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Nachrichten. Schreibt uns – wir sind für euch da!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === meId;
            return (
              <div
                key={m.id}
                className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}
              >
                {m.authorId && !mine && (
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
                      : 'rounded-bl-sm bg-background border',
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

      <div className="border-t p-2.5">
        {error && <p className="mb-1 text-xs text-destructive">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            placeholder="Nachricht schreiben…"
            className="max-h-28 min-h-[38px] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button size="sm" type="button" onClick={send} disabled={sending}>
            Senden
          </Button>
        </div>
      </div>
    </div>
  );
}

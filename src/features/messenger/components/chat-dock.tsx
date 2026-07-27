'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createChannelAction,
  sendChannelMessageAction,
} from '@/features/messenger/actions';
import type { ChatChannel, ChannelMessage } from '@/features/messenger/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;
const OPEN_KEY = 'chatDockOpen';
const ACTIVE_KEY = 'chatDockChannel';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ConversationView({ channel }: { channel: ChatChannel }) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [state, action] = useActionState(sendChannelMessageAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/channels/${channel.id}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChannelMessage[] };
      setMessages(data.messages);
    } catch {
      /* transient — next poll retries */
    }
  }, [channel.id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      void load();
    }
  }, [state, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b px-3 py-2 text-sm font-semibold"># {channel.name}</div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{de.messenger.noMessages}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex gap-2', m.isMine && 'flex-row-reverse')}>
              <Avatar
                userId={m.authorId ?? ''}
                name={m.authorName}
                hasAvatar={m.authorHasAvatar}
                size="sm"
              />
              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                  m.isMine ? 'bg-primary text-primary-foreground' : 'border bg-background',
                )}
              >
                <div className="mb-0.5 text-[11px] opacity-70">
                  {m.authorName} · {timeLabel(m.createdAt)}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <form ref={formRef} action={action} className="flex items-end gap-2 border-t p-2">
        <input type="hidden" name="channelId" value={channel.id} />
        <Textarea
          name="body"
          required
          rows={1}
          placeholder={`${de.messenger.messagePlaceholder} #${channel.name}`}
          className="max-h-24 min-h-[38px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <SubmitButton size="sm">{de.messenger.send}</SubmitButton>
      </form>
    </div>
  );
}

function CreateChannel({ onCreated }: { onCreated: () => void }) {
  const [state, action] = useActionState(createChannelAction, idleResult);
  useEffect(() => {
    if (state.status === 'success') onCreated();
  }, [state, onCreated]);
  return (
    <form action={action} className="space-y-1 p-2">
      {state.status === 'error' && (
        <Alert variant="destructive" className="text-[11px]">
          {state.message}
        </Alert>
      )}
      <Input name="name" required placeholder={de.messenger.channelName} className="h-7 text-xs" />
      <SubmitButton size="sm" className="w-full">
        {de.messenger.create}
      </SubmitButton>
    </form>
  );
}

/**
 * Persistent chat widget docked at the bottom-right across the agency area.
 * Collapsed to a launcher bar; expands to a channel list + conversation.
 */
export function ChatDock() {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Restore the open/active state so it survives reloads.
  useEffect(() => {
    setOpen(localStorage.getItem(OPEN_KEY) === '1');
    setActiveId(localStorage.getItem(ACTIVE_KEY));
  }, []);
  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }, [open]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/overview', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { channels: ChatChannel[] };
      setChannels(data.channels);
      setActiveId((cur) =>
        cur && data.channels.some((c) => c.id === cur)
          ? cur
          : (data.channels[0]?.id ?? null),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) void loadChannels();
  }, [open, loadChannels]);

  const active = channels.find((c) => c.id === activeId) ?? null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        💬 {de.messenger.title}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[520px] max-h-[calc(100vh-2rem)] w-[680px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">{de.messenger.title}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-2 text-lg leading-none text-muted-foreground hover:bg-muted"
          aria-label={de.common.close}
          title={de.common.close}
        >
          –
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-40 shrink-0 flex-col border-r sm:w-48">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {de.messenger.channels}
            </span>
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="rounded px-1.5 text-base leading-none text-muted-foreground hover:bg-muted"
              title={de.messenger.newChannel}
              aria-label={de.messenger.newChannel}
            >
              +
            </button>
          </div>
          {creating && (
            <CreateChannel
              onCreated={() => {
                setCreating(false);
                void loadChannels();
              }}
            />
          )}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
            {channels.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                {de.messenger.noChannels}
              </p>
            ) : (
              channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    activeId === c.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  # {c.name}
                </button>
              ))
            )}
          </nav>
        </aside>

        {active ? (
          <ConversationView key={active.id} channel={active} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {de.messenger.noChannels}
          </div>
        )}
      </div>
    </div>
  );
}

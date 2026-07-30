'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { EmojiPicker } from '@/features/messenger/components/emoji-picker';
import { StickerPicker } from '@/features/messenger/components/sticker-picker';
import { useChatTyping } from '@/features/messenger/use-chat-typing';
import { TypingIndicator } from '@/features/messenger/components/typing-indicator';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;

function CreateChannel({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createChannelAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-2 p-2">
      {state.status === 'error' && (
        <Alert variant="destructive" className="text-xs">
          {state.message}
        </Alert>
      )}
      <Input name="name" required placeholder={de.messenger.channelName} className="h-8 text-sm" />
      <Input name="description" placeholder={de.messenger.channelDescription} className="h-8 text-sm" />
      <div className="flex gap-1">
        <SubmitButton size="sm">{de.messenger.create}</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function MessagePane({
  channel,
  initialMessages,
  meId,
  meName,
}: {
  channel: ChatChannel;
  initialMessages: ChannelMessage[];
  meId: string;
  meName: string;
}) {
  const { typing, notifyTyping } = useChatTyping(channel.id, meId, meName);
  const [messages, setMessages] = useState<ChannelMessage[]>(initialMessages);
  const [state, action] = useActionState(sendChannelMessageAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    const pos = start + emoji.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/channels/${channel.id}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChannelMessage[] };
      setMessages(data.messages);
    } catch {
      /* transient network error — next poll retries */
    }
  }, [channel.id]);

  // Reset to the server-provided messages when the channel changes, then poll.
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
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
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-b px-4 py-3">
        <div className="font-semibold"># {channel.name}</div>
        {channel.description && (
          <div className="text-xs text-muted-foreground">{channel.description}</div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{de.messenger.noMessages}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex gap-2', m.isMine && 'flex-row-reverse')}>
              <Avatar
                userId={m.authorId ?? ''}
                name={m.authorName}
                hasAvatar={m.authorHasAvatar}
                status={m.authorStatus}
                size="sm"
              />
              <div
                className={cn(
                  'max-w-[75%] rounded-lg text-sm',
                  m.stickerUrl
                    ? ''
                    : cn(
                        'px-3 py-2',
                        m.isMine ? 'bg-primary text-primary-foreground' : 'bg-background border',
                      ),
                )}
              >
                <div className="mb-0.5 text-xs opacity-70">
                  {m.authorName} ·{' '}
                  {new Date(m.createdAt).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                {m.stickerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.stickerUrl}
                    alt="Sticker"
                    className="max-h-32 max-w-[160px] object-contain"
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <TypingIndicator names={typing} />

      <form ref={formRef} action={action} className="flex items-end gap-2 border-t p-3">
        <input type="hidden" name="channelId" value={channel.id} />
        <Textarea
          ref={inputRef}
          name="body"
          required
          rows={1}
          placeholder={`${de.messenger.messagePlaceholder} #${channel.name}`}
          className="max-h-32 min-h-[40px] flex-1 resize-none"
          onChange={notifyTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <EmojiPicker onPick={insertEmoji} />
        <StickerPicker channelId={channel.id} onSent={() => void load()} />
        <SubmitButton size="sm">{de.messenger.send}</SubmitButton>
      </form>
    </section>
  );
}

export function Messenger({
  channels,
  activeChannel,
  initialMessages,
  meId,
  meName,
}: {
  channels: ChatChannel[];
  activeChannel: ChatChannel | null;
  initialMessages: ChannelMessage[];
  meId: string;
  meName: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-[75vh] overflow-hidden rounded-lg border bg-card">
      <aside className="flex w-44 shrink-0 flex-col border-r sm:w-56">
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-sm font-semibold">{de.messenger.channels}</span>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded px-1.5 text-lg leading-none text-muted-foreground hover:bg-muted"
            title={de.messenger.newChannel}
            aria-label={de.messenger.newChannel}
          >
            +
          </button>
        </div>
        {creating && <CreateChannel onDone={() => setCreating(false)} />}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {channels.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{de.messenger.noChannels}</p>
          ) : (
            channels.map((c) => (
              <Link
                key={c.id}
                href={`/app/chat/${c.id}`}
                className={cn(
                  'block truncate rounded px-2 py-1.5 text-sm hover:bg-muted',
                  activeChannel?.id === c.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                # {c.name}
              </Link>
            ))
          )}
        </nav>
      </aside>

      {activeChannel ? (
        <MessagePane
          key={activeChannel.id}
          channel={activeChannel}
          initialMessages={initialMessages}
          meId={meId}
          meName={meName}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {de.messenger.selectChannel}
        </div>
      )}
    </div>
  );
}

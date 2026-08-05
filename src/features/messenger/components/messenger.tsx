'use client';

import { DropZone } from '@/components/ui/drop-zone';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createChannelAction,
  sendChannelMessageAction,
  toggleChatFileKeepAction,
} from '@/features/messenger/actions';
import type {
  ChatChannel,
  ChannelMessage,
  ChannelFile,
} from '@/features/messenger/queries';
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
import { ChatAttachButton } from '@/features/messenger/components/chat-attach-button';
import { PollBlock } from '@/features/messenger/components/poll-block';
import { PollComposer } from '@/features/messenger/components/poll-composer';
import { useChatTyping } from '@/features/messenger/use-chat-typing';
import { TypingIndicator } from '@/features/messenger/components/typing-indicator';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

/** Renders an uploaded chat file: image preview or file chip + keep toggle. */
export function FileBlock({
  messageId,
  file,
  onChanged,
}: {
  messageId: string;
  file: ChannelFile;
  onChanged: () => void;
}) {
  const [kept, setKept] = useState(file.keep);
  const [busy, setBusy] = useState(false);
  const left = daysLeft(file.expiresAt);

  const toggle = async () => {
    const next = !kept;
    setKept(next);
    setBusy(true);
    await toggleChatFileKeepAction(messageId, next);
    setBusy(false);
    onChanged();
  };

  if (file.removed || !file.url) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        🗑️ {file.name} · nach 60 Tagen automatisch gelöscht
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {file.isImage ? (
        <a href={file.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.name}
            className="max-h-56 max-w-[280px] rounded-md border object-contain"
          />
        </a>
      ) : (
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <span className="text-lg" aria-hidden>📎</span>
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
          </span>
        </a>
      )}
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={kept} disabled={busy} onChange={toggle} className="h-3 w-3" />
        {kept ? (
          <span>⭐ wichtig – dauerhaft gesichert</span>
        ) : (
          <span>löscht automatisch{left != null ? ` in ${left} Tagen` : ''} · als wichtig markieren</span>
        )}
      </label>
    </div>
  );
}

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ChannelMessage[] | null>(null);

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

  const runSearch = useCallback(async () => {
    const q = search.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    try {
      const res = await fetch(`/api/chat/channels/${channel.id}/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChannelMessage[] };
      setResults(data.messages);
    } catch {
      /* ignore */
    }
  }, [search, channel.id]);

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
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold"># {channel.name}</div>
            {channel.description && (
              <div className="truncate text-xs text-muted-foreground">{channel.description}</div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void runSearch(); }
                if (e.key === 'Escape') { setSearch(''); setResults(null); }
              }}
              placeholder="🔍 Suchen…"
              className="h-8 w-32 text-sm sm:w-48"
            />
            {results !== null && (
              <button
                type="button"
                onClick={() => { setSearch(''); setResults(null); }}
                className="rounded px-1.5 text-sm text-muted-foreground hover:bg-muted"
                aria-label="Suche schließen"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {results !== null && (
        <div className="border-b bg-muted/20 p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            {results.length} Treffer für „{search.trim()}&ldquo;
          </div>
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nichts gefunden.</p>
          ) : (
            <ul className="max-h-52 space-y-2 overflow-y-auto">
              {results.map((m) => (
                <li key={m.id} className="rounded-md border bg-background p-2 text-xs">
                  <div className="mb-0.5 text-muted-foreground">
                    {m.authorName} ·{' '}
                    {new Date(m.createdAt).toLocaleDateString('de-DE')}
                  </div>
                  <div className="break-words">
                    {m.file ? `📎 ${m.file.name}` : m.body}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                  m.stickerUrl || m.file || m.poll
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
                ) : m.file ? (
                  <FileBlock messageId={m.id} file={m.file} onChanged={() => void load()} />
                ) : m.poll ? (
                  <PollBlock poll={m.poll} canClose={m.isMine} onChanged={() => void load()} />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <TypingIndicator names={typing} />

      {uploadError && (
        <Alert variant="destructive" className="mx-3 text-xs">
          {uploadError}
        </Alert>
      )}

      <DropZone overlayLabel="Datei hier ablegen">
      <form ref={formRef} action={action} className="flex items-end gap-2 border-t p-3">
        <input type="hidden" name="channelId" value={channel.id} />
        <ChatAttachButton
          channelId={channel.id}
          onUploaded={() => void load()}
          onError={setUploadError}
          className="h-9 w-9 text-lg"
        />
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
        {/* Sticker sind im Kunden-Chat für Kunde & Mitarbeiter deaktiviert. */}
        {channel.kind !== 'client' && (
          <StickerPicker channelId={channel.id} onSent={() => void load()} />
        )}
        <PollComposer
          channelId={channel.id}
          onCreated={() => void load()}
          className="h-9 w-9 text-lg"
        />
        <SubmitButton size="sm">{de.messenger.send}</SubmitButton>
      </form>
      </DropZone>
    </section>
  );
}

export function Messenger({
  channels,
  clientChannels = [],
  activeChannel,
  initialMessages,
  meId,
  meName,
}: {
  channels: ChatChannel[];
  clientChannels?: ChatChannel[];
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

          {clientChannels.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kunden
              </div>
              {clientChannels.map((c) => (
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
                  💬 {c.name}
                </Link>
              ))}
            </>
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

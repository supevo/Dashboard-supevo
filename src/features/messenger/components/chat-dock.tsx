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
  markChannelRead,
  openDmAction,
} from '@/features/messenger/actions';
import type {
  ChatChannel,
  ChannelMessage,
  DmConversation,
  TeamMember,
} from '@/features/messenger/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { EmojiPicker } from '@/features/messenger/components/emoji-picker';
import { StickerPicker } from '@/features/messenger/components/sticker-picker';
import { ChatAttachButton } from '@/features/messenger/components/chat-attach-button';
import { PollBlock } from '@/features/messenger/components/poll-block';
import { PollComposer } from '@/features/messenger/components/poll-composer';
import { FileBlock } from '@/features/messenger/components/messenger';
import { useChatTyping } from '@/features/messenger/use-chat-typing';
import { TypingIndicator } from '@/features/messenger/components/typing-indicator';
import { playChatPing } from '@/features/messenger/notify-sound';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;
const OVERVIEW_POLL_MS = 12000;
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

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function ConversationView({
  channelId,
  title,
  meId,
  meName,
}: {
  channelId: string;
  title: string;
  meId: string;
  meName: string;
}) {
  const { typing, notifyTyping } = useChatTyping(channelId, meId, meName);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [state, action] = useActionState(sendChannelMessageAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChannelMessage[] };
      setMessages(data.messages);
    } catch {
      /* transient — next poll retries */
    }
  }, [channelId]);

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
      <div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>
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
                  'max-w-[75%] rounded-lg text-sm',
                  m.stickerUrl || m.file || m.poll
                    ? ''
                    : cn(
                        'px-3 py-2',
                        m.isMine ? 'bg-primary text-primary-foreground' : 'border bg-background',
                      ),
                )}
              >
                <div className="mb-0.5 text-[11px] opacity-70">
                  {m.authorName} · {timeLabel(m.createdAt)}
                </div>
                {m.stickerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.stickerUrl}
                    alt="Sticker"
                    className="max-h-28 max-w-[140px] object-contain"
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
        <Alert variant="destructive" className="mx-2 text-[11px]">
          {uploadError}
        </Alert>
      )}

      <form ref={formRef} action={action} className="flex items-end gap-2 border-t p-2">
        <input type="hidden" name="channelId" value={channelId} />
        <Textarea
          ref={inputRef}
          name="body"
          required
          rows={1}
          placeholder={de.messenger.messagePlaceholder}
          className="max-h-24 min-h-[38px] flex-1 resize-none text-sm"
          onChange={notifyTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <ChatAttachButton
          channelId={channelId}
          onUploaded={() => void load()}
          onError={setUploadError}
          className="h-9 w-9 text-lg"
        />
        <EmojiPicker onPick={insertEmoji} />
        <StickerPicker channelId={channelId} onSent={() => void load()} />
        <PollComposer
          channelId={channelId}
          onCreated={() => void load()}
          className="h-9 w-9 text-lg"
        />
        <SubmitButton size="sm">{de.messenger.send}</SubmitButton>
      </form>
    </div>
  );
}

function CreateChannel({
  members,
  onCreated,
}: {
  members: TeamMember[];
  onCreated: () => void;
}) {
  const [state, action] = useActionState(createChannelAction, idleResult);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (state.status === 'success') onCreated();
  }, [state, onCreated]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form action={action} className="space-y-1.5 p-2">
      {state.status === 'error' && (
        <Alert variant="destructive" className="text-[11px]">
          {state.message}
        </Alert>
      )}
      <Input name="name" required placeholder={de.messenger.channelName} className="h-7 text-xs" />
      <label className="flex items-center gap-1.5 text-[11px]">
        <input
          type="checkbox"
          name="isPrivate"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        {de.messenger.privateChannel}
      </label>
      {isPrivate && (
        <div className="max-h-24 space-y-0.5 overflow-y-auto rounded border p-1">
          {members.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">–</p>
          ) : (
            members.map((m) => (
              <label key={m.userId} className="flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                  className="h-3.5 w-3.5"
                />
                {m.name}
              </label>
            ))
          )}
        </div>
      )}
      <input type="hidden" name="memberIds" value={JSON.stringify(selected)} />
      <SubmitButton size="sm" className="w-full">
        {de.messenger.create}
      </SubmitButton>
    </form>
  );
}

export function ChatDock({ meId, meName }: { meId: string; meName: string }) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<DmConversation[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [startingDm, setStartingDm] = useState(false);

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

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/overview', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        channels: ChatChannel[];
        dms: DmConversation[];
        members: TeamMember[];
        unread?: Record<string, number>;
      };
      setChannels(data.channels);
      setDms(data.dms);
      setMembers(data.members);
      // Ping when the total unread count rises (a new message arrived). Skip the
      // very first load so we don't ping for pre-existing unreads.
      const total = Object.values(data.unread ?? {}).reduce((a, b) => a + b, 0);
      if (prevUnreadRef.current !== null && total > prevUnreadRef.current) {
        playChatPing();
      }
      prevUnreadRef.current = total;
      setUnread(data.unread ?? {});
      setActiveId((cur) => {
        const known = [...data.channels, ...data.dms].some((c) => c.id === cur);
        return cur && known ? cur : (data.channels[0]?.id ?? data.dms[0]?.id ?? null);
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const t = setInterval(() => void loadOverview(), OVERVIEW_POLL_MS);
    return () => clearInterval(t);
  }, [loadOverview]);

  useEffect(() => {
    if (!open || !activeId) return;
    if ((unread[activeId] ?? 0) === 0) return;
    void markChannelRead(activeId);
    setUnread((u) => ({ ...u, [activeId]: 0 }));
  }, [open, activeId, unread]);

  const startDm = async (userId: string) => {
    const res = await openDmAction(userId);
    if ('channelId' in res) {
      setActiveId(res.channelId);
      setStartingDm(false);
      void loadOverview();
    }
  };

  // The team rail dispatches this to open a DM with a colleague.
  const startDmRef = useRef(startDm);
  startDmRef.current = startDm;
  useEffect(() => {
    const handler = (e: Event) => {
      const userId = (e as CustomEvent<string>).detail;
      setOpen(true);
      if (userId) void startDmRef.current(userId);
    };
    window.addEventListener('supevo:open-dm', handler);
    return () => window.removeEventListener('supevo:open-dm', handler);
  }, []);

  // Resizable dock: pinned bottom-right, so a top-left grip grows it up/left.
  const [size, setSize] = useState({ w: 680, h: 520 });
  const sizeRef = useRef(size);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('supevo:chat-size');
      if (raw) {
        const s = JSON.parse(raw) as { w?: number; h?: number };
        if (s.w && s.h) {
          const next = { w: s.w, h: s.h };
          sizeRef.current = next;
          setSize(next);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const s = resizeStart.current;
    if (!s) return;
    const w = Math.max(340, Math.min(window.innerWidth - 24, s.w + (s.x - e.clientX)));
    const h = Math.max(320, Math.min(window.innerHeight - 24, s.h + (s.y - e.clientY)));
    const next = { w, h };
    sizeRef.current = next;
    setSize(next);
  };
  const onResizeUp = () => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    try {
      localStorage.setItem('supevo:chat-size', JSON.stringify(sizeRef.current));
    } catch {
      /* ignore */
    }
  };

  const activeChannel = channels.find((c) => c.id === activeId);
  const activeDm = dms.find((d) => d.id === activeId);
  const activeTitle = activeChannel
    ? `${activeChannel.isPrivate ? '🔒' : '#'} ${activeChannel.name}`
    : (activeDm?.otherName ?? '');
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const dmMemberIds = new Set(dms.map((d) => d.otherUserId));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        💬 {de.messenger.title}
        {totalUnread > 0 && (
          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{ width: size.w, height: size.h }}
      className="fixed bottom-4 right-4 z-50 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
    >
      {/* Ziehgriff oben links – zieht das Fenster größer/kleiner */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="Größe ändern"
        className="absolute left-0 top-0 z-20 h-4 w-4 cursor-nwse-resize"
        style={{ touchAction: 'none' }}
      >
        <span className="absolute left-1 top-1 h-2 w-2 border-l-2 border-t-2 border-muted-foreground/50" />
      </div>
      <div className="flex items-center justify-between border-b px-3 py-2 pl-5">
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
        <aside className="flex w-44 shrink-0 flex-col overflow-y-auto border-r sm:w-52">
          {/* Direct messages */}
          <div className="flex items-center justify-between px-2 pt-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {de.messenger.directMessages}
            </span>
            <button
              type="button"
              onClick={() => setStartingDm((v) => !v)}
              className="rounded px-1.5 text-base leading-none text-muted-foreground hover:bg-muted"
              title={de.messenger.newDm}
              aria-label={de.messenger.newDm}
            >
              +
            </button>
          </div>
          {startingDm && (
            <div className="mx-1.5 mb-1 max-h-28 space-y-0.5 overflow-y-auto rounded border p-1">
              {members.filter((m) => !dmMemberIds.has(m.userId)).length === 0 ? (
                <p className="px-1 py-0.5 text-[11px] text-muted-foreground">–</p>
              ) : (
                members
                  .filter((m) => !dmMemberIds.has(m.userId))
                  .map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => void startDm(m.userId)}
                      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                    >
                      <Avatar userId={m.userId} name={m.name} hasAvatar={m.hasAvatar} status={m.status} size="sm" />
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))
              )}
            </div>
          )}
          <div className="space-y-0.5 px-1.5 pb-1">
            {dms.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveId(d.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                  activeId === d.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <Avatar userId={d.otherUserId} name={d.otherName} hasAvatar={d.otherHasAvatar} status={d.otherStatus} size="sm" />
                <span className="truncate">{d.otherName}</span>
                {activeId !== d.id && <UnreadBadge count={unread[d.id] ?? 0} />}
              </button>
            ))}
          </div>

          {/* Channels */}
          <div className="mt-1 flex items-center justify-between px-2 pt-1">
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
              members={members}
              onCreated={() => {
                setCreating(false);
                void loadOverview();
              }}
            />
          )}
          <nav className="space-y-0.5 px-1.5 pb-2">
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
                    'flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    activeId === c.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">
                    {c.isPrivate ? '🔒' : '#'} {c.name}
                  </span>
                  {activeId !== c.id && <UnreadBadge count={unread[c.id] ?? 0} />}
                </button>
              ))
            )}
          </nav>
        </aside>

        {activeId && activeTitle ? (
          <ConversationView
            key={activeId}
            channelId={activeId}
            title={activeTitle}
            meId={meId}
            meName={meName}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {de.messenger.selectChannel}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { DropZone } from '@/components/ui/drop-zone';

import {
  useActionState,
  useCallback,
  useEffect,
  useOptimistic,
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
import { idleResult, successResult, errorResult, type ActionResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { EmojiPicker } from '@/features/messenger/components/emoji-picker';
import { StickerPicker } from '@/features/messenger/components/sticker-picker';
import { uploadChatFile } from '@/features/messenger/upload-chat-file';
import { ChatSoundPicker } from '@/features/messenger/components/chat-sound-picker';
import { PollBlock } from '@/features/messenger/components/poll-block';
import { PollComposer } from '@/features/messenger/components/poll-composer';
import { FileBlock } from '@/features/messenger/components/messenger';
import { useChatTyping } from '@/features/messenger/use-chat-typing';
import { TypingIndicator } from '@/features/messenger/components/typing-indicator';
import { playChatPing } from '@/features/messenger/notify-sound';
import {
  savePushSubscriptionAction,
  deletePushSubscriptionAction,
} from '@/features/push/actions';
import { cn } from '@/lib/utils';

/** base64url (VAPID-Public-Key) → Uint8Array für die PushManager-API. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const POLL_MS = 5000;
// Der Ungelesen-Zähler in der angedockten Leiste muss nicht sekundengenau sein.
// Er lief bisher alle 12 s je Nutzer auf JEDER Seite – und war damit die mit
// Abstand teuerste DB-Last (chat_unread_counts + Kanal-/Mitglieder-Abfragen,
// >100k Aufrufe/Tag). 30 s reichen für ein Hintergrund-Badge völlig; zusätzlich
// pausiert der Poll, wenn der Tab im Hintergrund liegt (siehe unten).
const OVERVIEW_POLL_MS = 30000;
const OPEN_KEY = 'chatDockOpen';
const ACTIVE_KEY = 'chatDockChannel';
const SIDEBAR_KEY = 'chatDockSidebarCollapsed';

/** Kürzel aus einem Namen (2 Buchstaben) für die eingeklappte Sidebar. */
function abbrev(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '–';
}

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
  isClient = false,
  onBack,
}: {
  channelId: string;
  title: string;
  meId: string;
  meName: string;
  /** Client chat: hide team-only tools (stickers, polls). */
  isClient?: boolean;
  /** Mobil: „‹"-Zurück-Button zur Kanalliste (nur wenn gesetzt). */
  onBack?: () => void;
}) {
  const { typing, notifyTyping } = useChatTyping(channelId, meId, meName);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  // Lesestand der anderen Teilnehmer (für „Gesendet/Gelesen" unter Nachrichten).
  const [reads, setReads] = useState<{ userId: string; lastReadAt: string }[]>([]);
  // Angehängte, noch NICHT gesendete Dateien (Vorschau im Composer, mit X).
  const [pending, setPending] = useState<{ id: string; file: File; url: string }[]>([]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const stagingRef = useRef<HTMLInputElement>(null);
  // Zitierte Nachricht, auf die geantwortet wird (WhatsApp-Stil). null = keine.
  const [replyTo, setReplyTo] = useState<ChannelMessage | null>(null);

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    setPending((prev) => [
      ...prev,
      ...arr.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        url: URL.createObjectURL(f),
      })),
    ]);
  }
  function removePending(id: string) {
    setPending((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter((p) => p.id !== id);
    });
  }
  // Optimistisches Senden: die eigene Nachricht sofort anzeigen, statt auf zwei
  // Server-Runden (Insert + komplettes Neuladen) zu warten. Über Cross-Region +
  // Free-Tier fühlte sich genau diese Wartezeit für die Mitarbeiter träge an.
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (cur, body: string): ChannelMessage[] => [
      ...cur,
      {
        id: `optimistic-${Date.now()}`,
        authorId: meId,
        authorName: meName,
        authorHasAvatar: false,
        authorStatus: null,
        body,
        stickerUrl: null,
        file: null,
        poll: null,
        replyTo: null,
        createdAt: new Date().toISOString(),
        isMine: true,
      },
    ],
  );
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const [state, action, isPending] = useActionState(
    async (prev: ActionResult, formData: FormData): Promise<ActionResult> => {
      const body = (formData.get('body') as string | null)?.trim() ?? '';
      // 1) Angehängte Dateien hochladen (jede wird eine eigene Nachricht).
      const files = pendingRef.current;
      if (files.length > 0) {
        setUploadError(null);
        for (const p of files) {
          const r = await uploadChatFile(channelId, p.file);
          if (!r.ok) {
            setUploadError(r.error ?? 'Upload fehlgeschlagen.');
            return errorResult(r.error ?? 'Upload fehlgeschlagen.');
          }
        }
        files.forEach((p) => URL.revokeObjectURL(p.url));
        setPending([]);
      }
      // 2) Textnachricht (nur wenn vorhanden) senden.
      if (body) {
        addOptimistic(body);
        const res = await sendChannelMessageAction(prev, formData);
        // Nach Erfolg im SELBEN Übergang neu laden (kein Flackern der Blase).
        if (res.status === 'success') {
          setReplyTo(null);
          await loadRef.current();
        }
        return res;
      }
      // Nur Dateien: neu laden, damit die Datei-Nachrichten erscheinen.
      if (files.length > 0) {
        await loadRef.current();
        return successResult();
      }
      return prev;
    },
    idleResult,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Synchrone Sperre gegen Doppel-Absenden bei schnellem mehrfachem Enter.
  const submittingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Nur automatisch nach unten scrollen, wenn man ohnehin (fast) unten ist –
  // beim Nachlesen weiter oben nicht mehr wegspringen.
  const stickToBottom = useRef(true);
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
      const data = (await res.json()) as {
        messages: ChannelMessage[];
        reads?: { userId: string; lastReadAt: string }[];
      };
      setMessages(data.messages);
      setReads(data.reads ?? []);
    } catch {
      /* transient — next poll retries */
    }
  }, [channelId]);
  loadRef.current = load;

  useEffect(() => {
    // Nachrichten-Poll pausiert im Hintergrund-Tab (spart unnötige Runden).
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!t) t = setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void load();
        start();
      }
    };
    void load();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  useEffect(() => {
    // Neuladen erfolgt bereits in der Action (optimistisches Senden) – hier nur
    // das Eingabefeld leeren.
    if (state.status === 'success') {
      formRef.current?.reset();
      // Auto-Grow-Höhe wieder auf Standard zurücksetzen.
      if (inputRef.current) inputRef.current.style.height = '';
    }
  }, [state]);

  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [optimisticMessages]);

  // Sende-Sperre wieder freigeben, sobald die Aktion durch ist.
  useEffect(() => {
    if (!isPending) submittingRef.current = false;
  }, [isPending]);

  // „Gesendet" / „Gelesen" unter einer eigenen Nachricht. Ist genau eine andere
  // Person beteiligt (DM), zeigen wir die Uhrzeit; sonst „Gelesen von N/M".
  function readStatus(createdAt: string): { text: string; read: boolean } | null {
    const at = new Date(createdAt).getTime();
    const readers = reads.filter((r) => new Date(r.lastReadAt).getTime() >= at);
    if (reads.length <= 1) {
      const first = readers[0];
      if (first) {
        const t = new Date(first.lastReadAt).toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return { text: `Gelesen · ${t}`, read: true };
      }
      return { text: 'Gesendet', read: false };
    }
    if (readers.length === 0) return { text: 'Gesendet', read: false };
    return { text: `Gelesen von ${readers.length}/${reads.length}`, read: readers.length === reads.length };
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2 text-sm font-semibold">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1.5 rounded px-1.5 py-0.5 text-base leading-none text-muted-foreground hover:bg-muted"
            aria-label="Zurück zur Kanalliste"
            title="Zurück"
          >
            ‹
          </button>
        )}
        <span className="min-w-0 truncate">{title}</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-3"
      >
        {optimisticMessages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{de.messenger.noMessages}</p>
        ) : (
          optimisticMessages.map((m) => (
            <div key={m.id} id={`cm-${m.id}`} className="space-y-0.5">
            <div className={cn('group flex items-center gap-2', m.isMine && 'flex-row-reverse')}>
              <Avatar
                userId={m.authorId ?? ''}
                name={m.authorName}
                hasAvatar={m.authorHasAvatar}
                size="sm"
                className="self-end"
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
                {m.replyTo && (
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById(`cm-${m.replyTo!.id}`)
                        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }}
                    className="mb-1 block w-full rounded border-l-2 border-current bg-black/10 px-2 py-1 text-left dark:bg-white/15"
                    title="Zur Originalnachricht"
                  >
                    <span className="block text-[11px] font-medium">{m.replyTo.authorName}</span>
                    <span className="block truncate text-[11px] opacity-80">{m.replyTo.preview}</span>
                  </button>
                )}
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
              <button
                type="button"
                onClick={() => {
                  setReplyTo(m);
                  inputRef.current?.focus();
                }}
                aria-label="Antworten"
                title="Antworten"
                className="shrink-0 rounded p-1 text-sm text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                ↩︎
              </button>
            </div>
            {m.isMine &&
              (() => {
                const s = readStatus(m.createdAt);
                return s ? (
                  <div
                    className={cn(
                      'px-9 text-right text-[10px]',
                      s.read ? 'text-sky-500 dark:text-sky-400' : 'text-muted-foreground',
                    )}
                  >
                    {s.read ? '✓✓ ' : '✓ '}
                    {s.text}
                  </div>
                ) : null;
              })()}
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

      <DropZone overlayLabel="Datei hier ablegen">
      <form ref={formRef} action={action} className="flex flex-col gap-2 border-t p-2">
        <input type="hidden" name="channelId" value={channelId} />
        <input type="hidden" name="replyToId" value={replyTo?.id ?? ''} />
        <input
          ref={stagingRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Antwort-Vorschau (WhatsApp-Stil): zitierte Nachricht + Abbrechen. */}
        {replyTo && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-primary">
                Antwort an {replyTo.authorName}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {replyTo.body?.trim()
                  ? replyTo.body
                  : replyTo.stickerUrl
                    ? '📷 Sticker'
                    : replyTo.file
                      ? `📎 ${replyTo.file.name}`
                      : replyTo.poll
                        ? '📊 Umfrage'
                        : '…'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Antwort verwerfen"
              className="shrink-0 rounded px-1 text-sm text-muted-foreground hover:bg-muted"
            >
              ✕
            </button>
          </div>
        )}

        {/* Anhang-Vorschau: eingefügte/gewählte Bilder werden erst beim Senden
            hochgeladen; jedes lässt sich per ✕ wieder entfernen. */}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <div key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.file.name}
                  className="h-16 w-16 rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  aria-label="Anhang entfernen"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs shadow ring-1 ring-border hover:bg-muted"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            name="body"
            required={pending.length === 0}
            rows={2}
            placeholder={de.messenger.messagePlaceholder}
            className="max-h-60 min-h-[56px] flex-1 resize-none text-sm leading-relaxed"
            onChange={(e) => {
              notifyTyping();
              // Mitwachsen wie in Slack: Höhe an den Inhalt anpassen (bis max-h-60).
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
            }}
            onPaste={(e) => {
              // Bilder aus der Zwischenablage NICHT sofort senden, sondern als
              // Anhang vormerken (mehrere möglich).
              const imgs = Array.from(e.clipboardData?.items ?? [])
                .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f);
              if (imgs.length > 0) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // Mehrfaches Enter während des Sendens ignorieren (kein Doppel-Post).
                if (isPending || submittingRef.current) return;
                submittingRef.current = true;
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={() => stagingRef.current?.click()}
            aria-label="Bild anhängen"
            title="Bild anhängen (auch per Einfügen oder Ziehen)"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg hover:bg-muted"
          >
            📎
          </button>
          <EmojiPicker onPick={insertEmoji} />
          {!isClient && (
            <>
              <StickerPicker channelId={channelId} onSent={() => void load()} />
              <PollComposer
                channelId={channelId}
                onCreated={() => void load()}
                className="h-9 w-9 text-lg"
              />
            </>
          )}
          <SubmitButton size="sm">{de.messenger.send}</SubmitButton>
        </div>
      </form>
      </DropZone>
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
  const [clientChannels, setClientChannels] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<DmConversation[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef<number | null>(null);
  // Ungelesen je Konversation beim letzten Poll – um zu erkennen, WELCHE
  // gestiegen ist (für das Desktop-Popup mit Kanal-/Absendername).
  const prevUnreadByIdRef = useRef<Record<string, number>>({});
  // Browser-Push für den Chat: Das 🔔 im Kopf abonniert echtes Web-Push (wie
  // unter „Benachrichtigungen"), damit Nachrichten auch bei geschlossenem Tab
  // aufpoppen. notifyEnabled = Abo aktiv; Ref für den Poll (stabile cb).
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const notifyEnabledRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [startingDm, setStartingDm] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Mobil: nur EINE Ebene sichtbar (Liste ODER Chat) statt nebeneinander.
  const [mobile, setMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  // Eingeklappte (Avatar-only) Darstellung nur am Desktop; mobil immer voll.
  const collapsed = !mobile && sidebarCollapsed;

  // Kanal/DM öffnen – auf dem Handy zusätzlich in die Chat-Ansicht wechseln.
  const openChannel = useCallback((id: string) => {
    setActiveId(id);
    setMobileView('chat');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setOpen(localStorage.getItem(OPEN_KEY) === '1');
    setActiveId(localStorage.getItem(ACTIVE_KEY));
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Push-Abo dieses Browsers ermitteln (steuert den 🔔-Zustand im Kopf).
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setNotifyEnabled(!!sub))
      .catch(() => {});
  }, []);

  useEffect(() => {
    notifyEnabledRef.current = notifyEnabled;
  }, [notifyEnabled]);

  async function togglePush() {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      alert('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
      return;
    }
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      alert('Push ist serverseitig nicht konfiguriert (VAPID-Schlüssel fehlen).');
      return;
    }
    setNotifyBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      // Aktiv → deaktivieren (Abo lösen).
      if (notifyEnabled || existing) {
        if (existing) {
          await deletePushSubscriptionAction(existing.endpoint);
          await existing.unsubscribe();
        }
        setNotifyEnabled(false);
        return;
      }
      // Inaktiv → Erlaubnis holen + abonnieren + serverseitig speichern.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert(
          perm === 'denied'
            ? 'Benachrichtigungen sind im Browser blockiert. Bitte in den Website-Einstellungen erlauben.'
            : 'Bitte Benachrichtigungen für diese Seite erlauben.',
        );
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });
      setNotifyEnabled(res.ok);
      if (!res.ok) alert('Aktivieren fehlgeschlagen. Bitte erneut versuchen.');
    } catch {
      alert('Aktivieren fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setNotifyBusy(false);
    }
  }

  /** Zeigt eine Desktop-Benachrichtigung für gestiegene Konversationen. */
  const notifyDesktop = useCallback(
    (risen: { id: string; label: string }[]) => {
      if (!notifyEnabledRef.current || risen.length === 0) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const first = risen[0]!;
      const title = risen.length === 1 ? first.label : 'Team-Chat';
      const body =
        risen.length === 1
          ? 'Neue Nachricht'
          : `Neue Nachrichten in ${risen.map((r) => r.label).join(', ')}`;
      try {
        const n = new Notification(title, { body, tag: 'supevo-chat' });
        n.onclick = () => {
          window.focus();
          setOpen(true);
          openChannel(first.id);
          n.close();
        };
      } catch {
        /* ignore */
      }
    },
    [openChannel],
  );
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    // Andere schwebende Docks (Assistent/Coach) blenden ihre Buttons aus,
    // solange der Team-Chat offen ist, damit sie sich nicht überlappen.
    window.dispatchEvent(new CustomEvent('supevo:teamchat', { detail: open }));
  }, [open]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const loadOverview = useCallback(async (notify = false) => {
    try {
      const res = await fetch('/api/chat/overview', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        channels: ChatChannel[];
        clientChannels?: ChatChannel[];
        dms: DmConversation[];
        members: TeamMember[];
        unread?: Record<string, number>;
      };
      setChannels(data.channels);
      setClientChannels(data.clientChannels ?? []);
      setDms(data.dms);
      setMembers(data.members);
      // Ping when the total unread count rises (a new message arrived). Skip the
      // very first load so we don't ping for pre-existing unreads. Count every
      // conversation the dock lists (team channels, DMs and client chats).
      const listedIds = new Set(
        [...data.channels, ...(data.clientChannels ?? []), ...data.dms].map(
          (c) => c.id,
        ),
      );
      const nextUnread = data.unread ?? {};
      const total = Object.entries(nextUnread).reduce(
        (a, [id, n]) => (listedIds.has(id) ? a + n : a),
        0,
      );
      // Welche Konversationen sind gestiegen? (für Sound + Desktop-Popup)
      const prevById = prevUnreadByIdRef.current;
      const risen: { id: string; label: string }[] = [];
      if (prevUnreadRef.current !== null) {
        const labelFor = (id: string): string => {
          const ch = data.channels.find((c) => c.id === id);
          if (ch) return `${ch.isPrivate ? '🔒' : '#'} ${ch.name}`;
          const cl = (data.clientChannels ?? []).find((c) => c.id === id);
          if (cl) return cl.name;
          const dm = data.dms.find((d) => d.id === id);
          return dm ? dm.otherName : 'Team-Chat';
        };
        for (const [id, n] of Object.entries(nextUnread)) {
          if (listedIds.has(id) && n > (prevById[id] ?? 0)) {
            risen.push({ id, label: labelFor(id) });
          }
        }
      }
      prevUnreadByIdRef.current = nextUnread;
      if (prevUnreadRef.current !== null && total > prevUnreadRef.current) {
        playChatPing();
        if (notify) notifyDesktop(risen);
      }
      prevUnreadRef.current = total;
      setUnread(nextUnread);
      setActiveId((cur) => {
        const all = [...data.channels, ...(data.clientChannels ?? []), ...data.dms];
        const known = all.some((c) => c.id === cur);
        return cur && known ? cur : (data.channels[0]?.id ?? all[0]?.id ?? null);
      });
    } catch {
      /* ignore */
    }
  }, [notifyDesktop]);

  useEffect(() => {
    void loadOverview();
    // Nur pollen, wenn der Tab sichtbar ist. Mitarbeiter lassen das Dashboard den
    // ganzen Tag in einem Hintergrund-Tab offen – ohne diese Pause liefen die
    // teuren Übersichts-Abfragen sinnlos weiter. Beim Zurückkehren zum Tab sofort
    // einmal aktualisieren, damit das Badge nicht veraltet wirkt.
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (t) return;
      t = setInterval(() => void loadOverview(true), OVERVIEW_POLL_MS);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void loadOverview();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!open || !activeId) return;
    if ((unread[activeId] ?? 0) === 0) return;
    void markChannelRead(activeId);
    setUnread((u) => ({ ...u, [activeId]: 0 }));
  }, [open, activeId, unread]);

  const startDm = async (userId: string) => {
    setDmError(null);
    const res = await openDmAction(userId);
    if ('channelId' in res) {
      openChannel(res.channelId);
      setStartingDm(false);
      void loadOverview();
    } else {
      // Kein stiller Klick ins Leere mehr: Grund sichtbar machen und Dock öffnen.
      setDmError(res.error || 'Chat konnte nicht geöffnet werden.');
      setStartingDm(true);
      setOpen(true);
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
  const activeClient = clientChannels.find((c) => c.id === activeId);
  const activeDm = dms.find((d) => d.id === activeId);
  const activeTitle = activeChannel
    ? `${activeChannel.isPrivate ? '🔒' : '#'} ${activeChannel.name}`
    : activeClient
      ? `👤 ${activeClient.name}`
      : (activeDm?.otherName ?? '');
  // Count unread for every conversation the dock shows (team channels, DMs and
  // client chats).
  const dockIds = new Set(
    [...channels, ...clientChannels, ...dms].map((c) => c.id),
  );
  const totalUnread = Object.entries(unread).reduce(
    (a, [id, n]) => (dockIds.has(id) ? a + n : a),
    0,
  );
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
      style={mobile ? undefined : { width: size.w, height: size.h }}
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden border bg-card shadow-2xl',
        mobile
          ? 'inset-2 rounded-xl'
          : 'bottom-4 right-4 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] rounded-xl',
      )}
    >
      {/* Ziehgriff oben links – nur am Desktop (mobil füllt das Fenster). */}
      {!mobile && (
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
      )}
      <div className="flex items-center justify-between border-b px-3 py-2 pl-5">
        <span className="text-sm font-semibold">{de.messenger.title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void togglePush()}
            disabled={notifyBusy}
            className={cn(
              'rounded px-1.5 py-0.5 text-base leading-none hover:bg-muted disabled:opacity-50',
              notifyEnabled ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-pressed={notifyEnabled}
            title={
              notifyEnabled
                ? 'Push-Benachrichtigungen an – klicken zum Deaktivieren'
                : 'Push-Benachrichtigungen aktivieren (auch bei geschlossenem Tab)'
            }
            aria-label="Push-Benachrichtigungen umschalten"
          >
            {notifyEnabled ? '🔔' : '🔕'}
          </button>
          <ChatSoundPicker />
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
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex flex-col overflow-y-auto border-r transition-[width]',
            mobile
              ? mobileView === 'chat'
                ? 'hidden'
                : 'w-full shrink border-r-0'
              : cn('shrink-0', collapsed ? 'w-[3.25rem]' : 'w-44 sm:w-52'),
          )}
        >
          {/* Ein-/Ausklappen – am Handy sinnlos (Vollbild-Liste). */}
          <div
            className={cn(
              'px-2 pt-2',
              mobile ? 'hidden' : 'flex',
              collapsed ? 'justify-center' : 'justify-end',
            )}
          >
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
              aria-label="Seitenleiste ein- oder ausklappen"
              className="rounded px-1.5 py-0.5 text-sm leading-none text-muted-foreground hover:bg-muted"
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>

          {/* Direct messages */}
          {!collapsed ? (
            <div className="flex items-center justify-between px-2 pt-1">
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
          ) : (
            <div className="mx-2 mt-1 border-t" title={de.messenger.directMessages} />
          )}
          {dmError && !collapsed && (
            <Alert variant="destructive" className="mx-1.5 mb-1 text-[11px]">
              {dmError}
            </Alert>
          )}
          {startingDm && !collapsed && (
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
          <div className={cn('space-y-0.5 pb-1', collapsed ? 'px-1' : 'px-1.5')}>
            {dms.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openChannel(d.id)}
                title={collapsed ? d.otherName : undefined}
                className={cn(
                  'flex w-full items-center rounded hover:bg-muted',
                  collapsed ? 'justify-center px-0 py-1' : 'gap-1.5 px-2 py-1.5 text-left text-sm',
                  activeId === d.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Avatar userId={d.otherUserId} name={d.otherName} hasAvatar={d.otherHasAvatar} status={d.otherStatus} size="sm" />
                  {collapsed && activeId !== d.id && (unread[d.id] ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-card" />
                  )}
                </span>
                {!collapsed && <span className="truncate">{d.otherName}</span>}
                {!collapsed && activeId !== d.id && <UnreadBadge count={unread[d.id] ?? 0} />}
              </button>
            ))}
          </div>

          {/* Channels */}
          {!collapsed ? (
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
          ) : (
            <div className="mx-2 mt-1 border-t" title={de.messenger.channels} />
          )}
          {creating && !collapsed && (
            <CreateChannel
              members={members}
              onCreated={() => {
                setCreating(false);
                void loadOverview();
              }}
            />
          )}
          <nav className={cn('space-y-0.5 pb-2', collapsed ? 'px-1' : 'px-1.5')}>
            {channels.length === 0 ? (
              !collapsed && (
                <p className="px-2 py-2 text-[11px] text-muted-foreground">
                  {de.messenger.noChannels}
                </p>
              )
            ) : (
              channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openChannel(c.id)}
                  title={collapsed ? c.name : undefined}
                  className={cn(
                    'flex w-full items-center rounded hover:bg-muted',
                    collapsed ? 'justify-center px-0 py-1' : 'gap-1 px-2 py-1.5 text-left text-sm',
                    activeId === c.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {collapsed ? (
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold uppercase">
                      {c.isPrivate ? '🔒' : abbrev(c.name)}
                      {activeId !== c.id && (unread[c.id] ?? 0) > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-card" />
                      )}
                    </span>
                  ) : (
                    <>
                      <span className="truncate">
                        {c.isPrivate ? '🔒' : '#'} {c.name}
                      </span>
                      {activeId !== c.id && <UnreadBadge count={unread[c.id] ?? 0} />}
                    </>
                  )}
                </button>
              ))
            )}
          </nav>

          {/* Client chats (Kunde ↔ Ansprechpartner) */}
          {clientChannels.length > 0 && (
            <>
              {!collapsed ? (
                <div className="mt-1 px-2 pt-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {de.messenger.clients}
                  </span>
                </div>
              ) : (
                <div className="mx-2 mt-1 border-t" title={de.messenger.clients} />
              )}
              <nav className={cn('space-y-0.5 pb-2', collapsed ? 'px-1' : 'px-1.5')}>
                {clientChannels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openChannel(c.id)}
                    title={collapsed ? c.name : undefined}
                    className={cn(
                      'flex w-full items-center rounded hover:bg-muted',
                      collapsed ? 'justify-center px-0 py-1' : 'gap-1 px-2 py-1.5 text-left text-sm',
                      activeId === c.id
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {collapsed ? (
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-md border bg-primary/5 text-[10px] font-semibold uppercase">
                        {abbrev(c.name)}
                        {activeId !== c.id && (unread[c.id] ?? 0) > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-card" />
                        )}
                      </span>
                    ) : (
                      <>
                        <span className="truncate">👤 {c.name}</span>
                        {activeId !== c.id && <UnreadBadge count={unread[c.id] ?? 0} />}
                      </>
                    )}
                  </button>
                ))}
              </nav>
            </>
          )}
        </aside>

        {(!mobile || mobileView === 'chat') &&
          (activeId && activeTitle ? (
            <ConversationView
              key={activeId}
              channelId={activeId}
              title={activeTitle}
              meId={meId}
              meName={meName}
              isClient={Boolean(activeClient)}
              onBack={mobile ? () => setMobileView('list') : undefined}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
              {de.messenger.selectChannel}
            </div>
          ))}
      </div>
    </div>
  );
}

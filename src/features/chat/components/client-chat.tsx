'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { sendClientChatMessageAction } from '@/features/chat/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorHasAvatar: boolean;
  authorStatus: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
}

const POLL_MS = 8000;

/** Internal per-client chat: loads messages, polls, and sends. Agency only. */
export function ClientChat({ clientCompanyId }: { clientCompanyId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, formAction] = useActionState(
    sendClientChatMessageAction,
    idleResult,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${clientCompanyId}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      setMessages(data.messages);
    } catch {
      /* transient network error — next poll retries */
    }
  }, [clientCompanyId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Reload right after a successful send and clear the input.
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      void load();
    }
  }, [state, load]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        className="max-h-96 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{de.chat.empty}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn('flex gap-2', m.isMine && 'flex-row-reverse')}
            >
              <Avatar
                userId={m.authorId ?? ''}
                name={m.authorName}
                hasAvatar={m.authorHasAvatar}
                status={m.authorStatus}
                size="sm"
              />
              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                  m.isMine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background',
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
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form ref={formRef} action={formAction} className="space-y-2">
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <Textarea
          name="body"
          required
          rows={2}
          placeholder={de.chat.placeholder}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex justify-end">
          <SubmitButton size="sm">{de.chat.send}</SubmitButton>
        </div>
      </form>
    </div>
  );
}

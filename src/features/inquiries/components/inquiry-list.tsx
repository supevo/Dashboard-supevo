'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  setInquiryStatusAction,
  addInquiryCommentAction,
  setInquirySpamAction,
} from '@/features/inquiries/actions';
import type { WebInquiry, InquiryStatus } from '@/features/inquiries/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

const STATUSES: InquiryStatus[] = ['new', 'called', 'mailed', 'done'];

const STATUS_STYLE: Record<InquiryStatus, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  called: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  mailed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

function StatusControl({ inquiry }: { inquiry: WebInquiry }) {
  const [state, action] = useActionState(setInquiryStatusAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="flex flex-wrap gap-1">
      {STATUSES.map((s) => (
        <form key={s} action={action}>
          <input type="hidden" name="id" value={inquiry.id} />
          <input type="hidden" name="status" value={s} />
          <button
            type="submit"
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition',
              inquiry.status === s
                ? STATUS_STYLE[s]
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            {de.inquiries.status[s]}
          </button>
        </form>
      ))}
    </div>
  );
}

function CommentForm({ inquiryId }: { inquiryId: string }) {
  const [state, action] = useActionState(addInquiryCommentAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Textarea
        name="body"
        rows={2}
        required
        placeholder={de.inquiries.commentPlaceholder}
      />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="outline">
          {de.inquiries.addComment}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Kleiner „Spam / Kein Spam"-Umschalter je Anfrage. */
function SpamToggle({ inquiry }: { inquiry: WebInquiry }) {
  const [state, action] = useActionState(setInquirySpamAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={inquiry.id} />
      <input type="hidden" name="isSpam" value={inquiry.isSpam ? 'false' : 'true'} />
      <button
        type="submit"
        className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        {inquiry.isSpam ? '↩ Kein Spam' : 'Als Spam markieren'}
      </button>
    </form>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InquiryCard({ i }: { i: WebInquiry }) {
  return (
    <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {i.subject || i.name || de.inquiries.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {de.inquiries.received}: {formatDateTime(i.createdAt)}
                  {i.source ? ` · ${i.source}` : ''}
                </div>
              </div>
              <StatusControl inquiry={i} />
            </div>

            <div className="space-y-1 text-sm">
              {i.name && (
                <div>
                  <span className="text-muted-foreground">{de.inquiries.from}: </span>
                  {i.name}
                </div>
              )}
              {i.email && (
                <div>
                  <a href={`mailto:${i.email}`} className="text-primary hover:underline">
                    {i.email}
                  </a>
                </div>
              )}
              {i.phone && (
                <div>
                  <a href={`tel:${i.phone}`} className="text-primary hover:underline">
                    {i.phone}
                  </a>
                </div>
              )}
              {i.message && (
                <p className="whitespace-pre-wrap pt-1">{i.message}</p>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {de.inquiries.comments}
              </div>
              {i.comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">{de.inquiries.noComments}</p>
              ) : (
                <ul className="space-y-2">
                  {i.comments.map((c) => (
                    <li key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
                      <div className="text-xs text-muted-foreground">
                        {c.authorName} · {formatDateTime(c.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <CommentForm inquiryId={i.id} />
            </div>

            <div className="flex justify-end border-t pt-2">
              <SpamToggle inquiry={i} />
            </div>
          </CardContent>
        </Card>
  );
}

export function InquiryList({ inquiries }: { inquiries: WebInquiry[] }) {
  if (inquiries.length === 0) {
    return <p className="text-sm text-muted-foreground">{de.inquiries.empty}</p>;
  }

  const real = inquiries.filter((i) => !i.isSpam);
  const spam = inquiries.filter((i) => i.isSpam);

  return (
    <div className="space-y-4">
      {real.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.inquiries.empty}</p>
      ) : (
        real.map((i) => <InquiryCard key={i.id} i={i} />)
      )}

      {spam.length > 0 && (
        <details className="rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            🚫 Spam ({spam.length}) anzeigen
          </summary>
          <div className="mt-3 space-y-4">
            {spam.map((i) => (
              <InquiryCard key={i.id} i={i} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

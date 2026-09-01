'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setInquiryStatusAction,
  addInquiryCommentAction,
  setInquirySpamAction,
} from '@/features/inquiries/actions';
import type { WebInquiry } from '@/features/inquiries/queries';
import {
  inquiryStatusBucket,
  type InquiryStatus,
} from '@/features/inquiries/status';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

const COLUMNS: { key: InquiryStatus; accent: string }[] = [
  { key: 'new', accent: 'border-t-blue-500' },
  { key: 'not_reached', accent: 'border-t-rose-500' },
  { key: 'reached', accent: 'border-t-amber-500' },
  { key: 'appointment', accent: 'border-t-purple-500' },
  { key: 'offer', accent: 'border-t-sky-500' },
  { key: 'won', accent: 'border-t-emerald-500' },
  { key: 'lost', accent: 'border-t-muted-foreground/40' },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Kompakte Lead-Karte in einer Spalte. */
function LeadCard({
  inquiry,
  canManage,
  onOpen,
  onDragStart,
}: {
  inquiry: WebInquiry;
  canManage: boolean;
  onOpen: () => void;
  onDragStart: () => void;
}) {
  return (
    <button
      type="button"
      draggable={canManage}
      onDragStart={onDragStart}
      onClick={onOpen}
      className="w-full cursor-pointer rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/50 hover:shadow"
    >
      <div className="truncate text-sm font-medium">
        {inquiry.subject || inquiry.name || de.inquiries.title}
      </div>
      {inquiry.name && inquiry.subject && (
        <div className="truncate text-xs text-muted-foreground">{inquiry.name}</div>
      )}
      {inquiry.message && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {inquiry.message}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{inquiry.email || inquiry.phone || ''}</span>
        <span className="shrink-0">{fmtDate(inquiry.createdAt)}</span>
      </div>
    </button>
  );
}

function CommentForm({ inquiryId }: { inquiryId: string }) {
  const [state, action] = useActionState(addInquiryCommentAction, idleResult);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Textarea name="body" rows={2} required placeholder={de.inquiries.commentPlaceholder} />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="outline">
          {de.inquiries.addComment}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Detail-Dialog einer Anfrage (Kontakt, Nachricht, Status, Kommentare). */
function LeadDetail({
  inquiry,
  canManage,
  onClose,
  onMove,
}: {
  inquiry: WebInquiry;
  canManage: boolean;
  onClose: () => void;
  onMove: (status: InquiryStatus) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggleSpam() {
    const fd = new FormData();
    fd.set('id', inquiry.id);
    fd.set('isSpam', inquiry.isSpam ? 'false' : 'true');
    start(async () => {
      await setInquirySpamAction(idleResult, fd);
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title={inquiry.subject || inquiry.name || de.inquiries.title} dismissible>
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {de.inquiries.received}: {new Date(inquiry.createdAt).toLocaleString('de-DE')}
          {inquiry.source ? ` · ${inquiry.source}` : ''}
        </div>

        <div className="space-y-1 text-sm">
          {inquiry.name && (
            <div>
              <span className="text-muted-foreground">{de.inquiries.from}: </span>
              {inquiry.name}
            </div>
          )}
          {inquiry.email && (
            <a href={`mailto:${inquiry.email}`} className="block text-primary hover:underline">
              {inquiry.email}
            </a>
          )}
          {inquiry.phone && (
            <a href={`tel:${inquiry.phone}`} className="block text-primary hover:underline">
              {inquiry.phone}
            </a>
          )}
          {inquiry.message && <p className="whitespace-pre-wrap pt-1">{inquiry.message}</p>}
        </div>

        {/* Status umstellen (Tastatur-/Mobil-Fallback zum Ziehen). */}
        {canManage && (
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Status</div>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onMove(c.key)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition',
                    inquiryStatusBucket(inquiry.status) === c.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  {de.inquiries.status[c.key]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground">
            {de.inquiries.comments}
          </div>
          {inquiry.comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{de.inquiries.noComments}</p>
          ) : (
            <ul className="space-y-2">
              {inquiry.comments.map((c) => (
                <li key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {c.authorName} · {new Date(c.createdAt).toLocaleString('de-DE')}
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <CommentForm inquiryId={inquiry.id} />
        </div>

        {canManage && (
          <div className="flex justify-end border-t pt-3">
            <button
              type="button"
              onClick={toggleSpam}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {inquiry.isSpam ? '↩ Kein Spam' : 'Als Spam markieren'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Kundenanfragen als Kanban-Leadboard: Spalten je Status, Karten ziehbar
 * (Desktop) bzw. per Status-Buttons im Detail (Mobil/Tastatur). Spam liegt
 * eingeklappt unter dem Board.
 */
export function InquiryKanban({
  inquiries,
  canManage = true,
}: {
  inquiries: WebInquiry[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<InquiryStatus | null>(null);

  const real = inquiries.filter((i) => !i.isSpam);
  const spam = inquiries.filter((i) => i.isSpam);
  const open = inquiries.find((i) => i.id === openId) ?? null;

  function move(id: string, status: InquiryStatus) {
    const current = inquiries.find((i) => i.id === id);
    if (!current || current.status === status) return;
    const fd = new FormData();
    fd.set('id', id);
    fd.set('status', status);
    start(async () => {
      await setInquiryStatusAction(idleResult, fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {COLUMNS.map((col) => {
          const cards = real.filter((i) => inquiryStatusBucket(i.status) === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (!canManage) return;
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((v) => (v === col.key ? null : v))}
              onDrop={() => {
                if (dragId) move(dragId, col.key);
                setDragId(null);
                setDragOver(null);
              }}
              className={cn(
                'flex min-h-[8rem] flex-col rounded-xl border border-t-2 bg-muted/20 p-2',
                col.accent,
                dragOver === col.key && 'ring-2 ring-primary',
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">{de.inquiries.status[col.key]}</span>
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {cards.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {cards.map((i) => (
                  <LeadCard
                    key={i.id}
                    inquiry={i}
                    canManage={canManage}
                    onOpen={() => setOpenId(i.id)}
                    onDragStart={() => setDragId(i.id)}
                  />
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">
                    Keine Einträge
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {spam.length > 0 && (
        <details className="rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            🚫 Spam ({spam.length}) anzeigen
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {spam.map((i) => (
              <LeadCard
                key={i.id}
                inquiry={i}
                canManage={false}
                onOpen={() => setOpenId(i.id)}
                onDragStart={() => {}}
              />
            ))}
          </div>
        </details>
      )}

      {open && (
        <LeadDetail
          inquiry={open}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onMove={(status) => {
            move(open.id, status);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

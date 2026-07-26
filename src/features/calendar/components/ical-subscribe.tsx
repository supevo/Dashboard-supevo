'use client';

import { useState } from 'react';
import {
  getOrCreateFeedToken,
  regenerateFeedToken,
} from '@/features/calendar/feed-actions';
import { de } from '@/lib/i18n/de';

export function IcalSubscribe() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const toUrl = (token: string) =>
    `${window.location.origin}/api/calendar/ical?token=${token}`;

  const show = async () => {
    setBusy(true);
    const token = await getOrCreateFeedToken();
    if (token) setUrl(toUrl(token));
    setBusy(false);
  };

  const regenerate = async () => {
    setBusy(true);
    const token = await regenerateFeedToken();
    if (token) {
      setUrl(toUrl(token));
      setCopied(false);
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{de.calendar.icalHint}</p>

      {!url ? (
        <button
          type="button"
          onClick={show}
          disabled={busy}
          className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
        >
          {busy ? de.common.loading : de.calendar.icalShow}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copied ? de.calendar.icalCopied : de.calendar.icalCopy}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              {de.calendar.icalRegenerate}
            </button>
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>{de.calendar.icalStep1}</li>
            <li>{de.calendar.icalStep2}</li>
            <li>{de.calendar.icalStep3}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleInquiryEndpointAction,
  regenerateInquiryTokenAction,
} from '@/features/inquiries/actions';
import type { InquiryEndpoint } from '@/features/inquiries/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

export function InquirySettings({
  clientCompanyId,
  endpoint,
  baseUrl,
}: {
  clientCompanyId: string;
  endpoint: InquiryEndpoint | null;
  baseUrl: string;
}) {
  const [toggleState, toggleAction] = useActionState(toggleInquiryEndpointAction, idleResult);
  const [regenState, regenAction] = useActionState(regenerateInquiryTokenAction, idleResult);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (toggleState.status === 'success' || regenState.status === 'success') {
      router.refresh();
    }
  }, [toggleState, regenState, router]);

  const enabled = endpoint?.enabled ?? false;
  const webhookUrl = endpoint ? `${baseUrl}/api/inquiries/${endpoint.token}` : '';
  const errorMsg =
    toggleState.status === 'error'
      ? toggleState.message
      : regenState.status === 'error'
        ? regenState.message
        : null;

  const copy = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {enabled ? de.inquiries.enabled : de.inquiries.disabled}
        </span>
        <form action={toggleAction}>
          <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
          <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
          <SubmitButton size="sm" variant={enabled ? 'ghost' : 'default'}>
            {enabled ? de.inquiries.toggleOff : de.inquiries.enable}
          </SubmitButton>
        </form>
      </div>

      {errorMsg && <Alert variant="destructive">{errorMsg}</Alert>}

      {endpoint && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{de.inquiries.webhookUrl}</label>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
              {webhookUrl}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? de.inquiries.copied : de.inquiries.copy}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{de.inquiries.webhookHint}</p>

          <form action={regenAction} className="pt-1">
            <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
            <SubmitButton size="sm" variant="ghost">
              {de.inquiries.regenerate}
            </SubmitButton>
            <span className="ml-2 text-xs text-muted-foreground">
              {de.inquiries.regenerateHint}
            </span>
          </form>
        </div>
      )}
    </div>
  );
}

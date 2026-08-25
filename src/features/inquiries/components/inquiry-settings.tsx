'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleInquiryEndpointAction,
  regenerateInquiryTokenAction,
  toggleInquiryClientVisibleAction,
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
  inboundDomain = null,
}: {
  clientCompanyId: string;
  endpoint: InquiryEndpoint | null;
  baseUrl: string;
  /** Domain für den E-Mail-Eingang (z. B. inbound.supevo.de), aus INBOUND_DOMAIN. */
  inboundDomain?: string | null;
}) {
  const [toggleState, toggleAction] = useActionState(toggleInquiryEndpointAction, idleResult);
  const [regenState, regenAction] = useActionState(regenerateInquiryTokenAction, idleResult);
  const [visState, visAction] = useActionState(toggleInquiryClientVisibleAction, idleResult);
  const [copied, setCopied] = useState<'url' | 'email' | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (
      toggleState.status === 'success' ||
      regenState.status === 'success' ||
      visState.status === 'success'
    ) {
      router.refresh();
    }
  }, [toggleState, regenState, visState, router]);

  const enabled = endpoint?.enabled ?? false;
  const clientVisible = endpoint?.clientVisible ?? false;
  const webhookUrl = endpoint ? `${baseUrl}/api/inquiries/${endpoint.token}` : '';
  const inboundEmail =
    endpoint && inboundDomain ? `${endpoint.token}@${inboundDomain}` : '';
  const errorMsg =
    toggleState.status === 'error'
      ? toggleState.message
      : regenState.status === 'error'
        ? regenState.message
        : null;

  const copyValue = async (value: string, which: 'url' | 'email') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
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
        <div className="space-y-4">
          {/* Sichtbarkeit des Kundenanfragen-Boards im Kundenportal. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Für Kunde sichtbar</p>
              <p className="text-xs text-muted-foreground">
                Wenn aktiv, sieht der Kunde das Kundenanfragen-Board in seinem
                Portal (zwischen Übersicht und Projekte).
              </p>
            </div>
            <form action={visAction}>
              <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
              <input
                type="hidden"
                name="visible"
                value={clientVisible ? 'false' : 'true'}
              />
              <SubmitButton size="sm" variant={clientVisible ? 'ghost' : 'default'}>
                {clientVisible ? 'Ausblenden' : 'Für Kunde freigeben'}
              </SubmitButton>
            </form>
          </div>

          {/* Per E-Mail: Adresse dieses Kunden für den Funnel. */}
          {inboundEmail && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">📥 Per E-Mail (Funnel)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Wenn dein Funnel keinen Webhook kann: Diese Adresse als
                {' „weitere Mail" '}
                im Funnel hinterlegen – Anfragen dieses Kunden landen dann
                automatisch hier.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1.5 text-xs">
                  {inboundEmail}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyValue(inboundEmail, 'email')}
                >
                  {copied === 'email' ? de.inquiries.copied : de.inquiries.copy}
                </Button>
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                <li>Adresse kopieren.</li>
                <li>{'Im Funnel unter „weitere Mail" / Benachrichtigungs-E-Mail eintragen.'}</li>
                <li>Fertig – neue Anfragen erscheinen unten in der Liste.</li>
              </ol>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Die Adresse gehört nur zu diesem Kunden. Spam wird automatisch
                aussortiert.
              </p>
            </div>
          )}

          {/* Per Webhook: für Make/Zapier oder direkt einbindbare Formulare. */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              🔗 {de.inquiries.webhookUrl} (Make / Zapier / direkt)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
                {webhookUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyValue(webhookUrl, 'url')}
              >
                {copied === 'url' ? de.inquiries.copied : de.inquiries.copy}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{de.inquiries.webhookHint}</p>
          </div>

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

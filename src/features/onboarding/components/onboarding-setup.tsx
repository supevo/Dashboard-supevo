'use client';

import { DropZone } from '@/components/ui/drop-zone';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  configureOnboardingAction,
  createContractTemplateUpload,
  finalizeContractTemplate,
  generateContractFromMembershipAction,
  generateSepaPreviewAction,
  releaseSepaAction,
  resetOnboardingProgressAction,
} from '@/features/onboarding/agency-actions';
import type { OnboardingStatus } from '@/features/onboarding/queries';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const FILES_BUCKET = 'files';

/**
 * Agency click-funnel for a client's onboarding: decide whether to start it and
 * which parts apply (contract / SEPA / marketing plan), and deposit the contract
 * PDF the client will read + sign. The client only sees enabled steps, and only
 * after onboarding is started here.
 */
export function OnboardingSetup({
  clientCompanyId,
  status,
}: {
  clientCompanyId: string;
  status: OnboardingStatus;
}) {
  const router = useRouter();
  const [contract, setContract] = useState(status.requiresContract);
  const [sepa, setSepa] = useState(status.requiresSepa);
  const [plan, setPlan] = useState(status.requiresPlan);
  const [templateName, setTemplateName] = useState(status.contractTemplateName);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadTemplate(file: File) {
    setError(null);
    setUploading(true);
    try {
      const created = await createContractTemplateUpload({
        clientCompanyId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from(FILES_BUCKET)
        .uploadToSignedUrl(created.path, created.token, file, {
          contentType: file.type,
        });
      if (upErr) {
        setError('Upload fehlgeschlagen.');
        return;
      }
      const fin = await finalizeContractTemplate({
        clientCompanyId,
        storagePath: created.storagePath,
        fileName: file.name,
      });
      if (fin.status === 'error') {
        setError(fin.message);
        return;
      }
      setTemplateName(file.name);
      setNotice('Vertrag hinterlegt.');
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function runSepa(fn: () => Promise<{ status: string; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.status === 'error') {
        setError(res.message ?? 'Fehler.');
        return;
      }
      setNotice(res.message ?? 'Erledigt.');
      router.refresh();
    });
  }

  function save(start: boolean) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await configureOnboardingAction({
        clientCompanyId,
        start,
        requiresContract: contract,
        requiresSepa: sepa,
        requiresPlan: plan,
      });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setNotice((res.status === 'success' && res.message) || 'Gespeichert.');
      router.refresh();
    });
  }

  const Part = ({
    checked,
    onChange,
    label,
    hint,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    hint: string;
  }) => (
    <label className="flex items-start gap-2.5 rounded-md border p-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  const statusRow = (done: boolean, label: string, href?: string) => (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        {done ? '✅' : '⬜'} {label}
      </span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline"
        >
          PDF ansehen
        </a>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      {!status.started ? (
        <p className="text-sm text-muted-foreground">
          Nicht jeder Kunde braucht ein Onboarding. Wähle die Bestandteile und
          starte den Prozess – der Kunde sieht danach nur die aktivierten
          Schritte im Portal.
        </p>
      ) : (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Onboarding aktiv{' '}
          {status.complete ? '· abgeschlossen 🎉' : '· läuft'}
        </p>
      )}

      <div className="space-y-2">
        <Part
          checked={contract}
          onChange={setContract}
          label="Vertrag"
          hint="Kunde liest das Vertrags-PDF und unterschreibt digital."
        />
        {contract && (
          <DropZone className="ml-7 space-y-1.5" overlayLabel="Vertrags-PDF ablegen">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadTemplate(f);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runSepa(() => generateContractFromMembershipAction(clientCompanyId))}
                disabled={pending}
                title="Erzeugt den Vertrag aus der eingestellten Mitgliedschaft (Preis, Paket, Startdatum)."
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                📝 Aus Mitgliedschaft generieren
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                {uploading ? '⏳ Lädt…' : templateName ? '📄 PDF ersetzen' : '📄 PDF hochladen'}
              </button>
              {templateName && (
                <a
                  href={`/api/onboarding/contract-template?client=${clientCompanyId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-primary hover:underline"
                >
                  {templateName}
                </a>
              )}
            </div>
            {!templateName && (
              <p className="text-xs text-muted-foreground">
                Noch kein Vertrag hinterlegt. Generiere ihn aus der
                Mitgliedschaft oder lade ein PDF hoch – der Kunde liest und
                unterschreibt ihn dann online.
              </p>
            )}
          </DropZone>
        )}
        <Part
          checked={sepa}
          onChange={setSepa}
          label="SEPA-Mandat"
          hint="PDF generieren, prüfen, freigeben – dann füllt der Kunde IBAN + Unterschrift aus."
        />
        {sepa && (
          <div className="ml-7 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runSepa(() => generateSepaPreviewAction(clientCompanyId))}
                disabled={pending}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                {status.sepaPreviewPath ? '🔄 Vorschau neu erstellen' : '📄 SEPA-Vorschau erstellen'}
              </button>
              {status.sepaPreviewPath && (
                <a
                  href={`/api/onboarding/sepa-preview?client=${clientCompanyId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Vorschau ansehen ↗
                </a>
              )}
            </div>
            {status.sepaPreviewPath && !status.sepaReleased && (
              <button
                type="button"
                onClick={() => runSepa(() => releaseSepaAction(clientCompanyId))}
                disabled={pending}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                ✅ Freigeben &amp; an Kunden senden
              </button>
            )}
            {status.sepaReleased && !status.sepaSignedAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                An Kunden gesendet – wartet auf Unterschrift.
              </p>
            )}
          </div>
        )}
        <Part
          checked={plan}
          onChange={setPlan}
          label="Marketingplan"
          hint="Jahresplan zur Abstimmung; gilt als erledigt, sobald akzeptiert."
        />
      </div>

      {status.started && (
        <ul className="space-y-1 rounded-md bg-muted/30 p-3">
          {status.requiresContract &&
            statusRow(
              Boolean(status.contractSignedAt),
              'Vertrag unterschrieben',
              status.contractPdfPath
                ? `/api/onboarding/contract?client=${clientCompanyId}`
                : undefined,
            )}
          {status.requiresSepa &&
            statusRow(
              Boolean(status.sepaSignedAt),
              `SEPA-Mandat${status.sepaIbanLast4 ? ` · IBAN ••••${status.sepaIbanLast4}` : ''}`,
              status.sepaPdfPath
                ? `/api/onboarding/sepa?client=${clientCompanyId}`
                : undefined,
            )}
          {status.requiresPlan && statusRow(status.planAccepted, 'Marketingplan akzeptiert')}
          {!status.requiresContract && !status.requiresSepa && !status.requiresPlan && (
            <li className="text-sm text-muted-foreground">Keine Bestandteile ausgewählt.</li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {!status.started ? (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            className={cn(
              'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90',
              pending && 'opacity-60',
            )}
          >
            🚀 Onboarding starten
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Änderungen speichern
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
            >
              Onboarding deaktivieren
            </button>
            {(status.contractSignedAt || status.sepaSignedAt) && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Onboarding zurücksetzen? Vertrags- und SEPA-Unterschrift des Kunden werden gelöscht, er unterschreibt neu. Vorlage, SEPA-Vorschau und der Marketingplan bleiben erhalten.',
                    )
                  ) {
                    return;
                  }
                  setError(null);
                  setNotice(null);
                  startTransition(async () => {
                    const res = await resetOnboardingProgressAction(clientCompanyId);
                    if (res.status === 'success') {
                      setNotice('message' in res ? (res.message ?? 'Zurückgesetzt.') : 'Zurückgesetzt.');
                      router.refresh();
                    } else {
                      setError('message' in res ? res.message : 'Fehlgeschlagen.');
                    }
                  });
                }}
                disabled={pending}
                className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"
              >
                ↩︎ Onboarding zurücksetzen
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

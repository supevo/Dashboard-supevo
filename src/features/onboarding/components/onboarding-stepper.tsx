'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signContractAction, signSepaAction } from '@/features/onboarding/actions';
import type { OnboardingStatus } from '@/features/onboarding/queries';
import { SignaturePad } from '@/features/onboarding/components/signature-pad';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

function StepDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : active
            ? 'border-primary text-primary'
            : 'border-muted-foreground/30 text-muted-foreground',
      )}
    >
      {done ? '✓' : ''}
    </span>
  );
}

export function OnboardingStepper({ status }: { status: OnboardingStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openContract, setOpenContract] = useState(false);
  const [openSepa, setOpenSepa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vertrag
  const [cSig, setCSig] = useState<string | null>(null);
  const [cName, setCName] = useState('');

  // SEPA
  const [sSig, setSSig] = useState<string | null>(null);
  const [sName, setSName] = useState('');
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('');

  if (status.complete) return null;

  const contractDone = Boolean(status.contractSignedAt);
  const sepaDone = Boolean(status.sepaSignedAt);
  const planDone = status.planAccepted;

  const signContract = () =>
    start(async () => {
      setError(null);
      const res = await signContractAction({ signaturePng: cSig, signer: cName });
      if (res.status === 'error') return setError(res.message);
      setOpenContract(false);
      router.refresh();
    });

  const signSepa = () =>
    start(async () => {
      setError(null);
      const res = await signSepaAction({
        signaturePng: sSig,
        signer: sName,
        accountHolder: holder,
        iban,
      });
      if (res.status === 'error') return setError(res.message);
      setOpenSepa(false);
      router.refresh();
    });

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle>👋 Willkommen – kurzes Onboarding</CardTitle>
        <p className="text-sm text-muted-foreground">
          In wenigen Schritten seid ihr startklar. Alles digital – kein PDF-Hin
          und Her.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 1. Vertrag */}
        <div className="flex items-center gap-3">
          <StepDot done={contractDone} active={!contractDone} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Vertrag unterschreiben</div>
            <div className="text-xs text-muted-foreground">
              {contractDone ? 'Erledigt – danke!' : 'Dienstleistungsvertrag digital bestätigen.'}
            </div>
          </div>
          {!contractDone && (
            <Button size="sm" onClick={() => setOpenContract(true)}>
              Unterschreiben
            </Button>
          )}
        </div>

        {/* 2. SEPA */}
        <div className="flex items-center gap-3">
          <StepDot done={sepaDone} active={contractDone && !sepaDone} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">SEPA-Mandat erteilen</div>
            <div className="text-xs text-muted-foreground">
              {sepaDone
                ? `Erledigt – IBAN ••••${status.sepaIbanLast4 ?? ''}`
                : 'Lastschriftmandat digital erteilen.'}
            </div>
          </div>
          {!sepaDone && (
            <Button size="sm" variant={contractDone ? 'default' : 'outline'} onClick={() => setOpenSepa(true)}>
              Unterschreiben
            </Button>
          )}
        </div>

        {/* 3. Marketingplan */}
        <div className="flex items-center gap-3">
          <StepDot done={planDone} active={contractDone && sepaDone && !planDone} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Marketingplan abstimmen</div>
            <div className="text-xs text-muted-foreground">
              {planDone ? 'Plan akzeptiert – wir legen los!' : 'Euren Jahresplan ansehen & freigeben.'}
            </div>
          </div>
          {!planDone && (
            <Link
              href="/portal/plan"
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Zum Plan
            </Link>
          )}
        </div>
      </CardContent>

      {/* Vertrag-Modal */}
      <Modal open={openContract} onClose={() => setOpenContract(false)} title="Vertrag unterschreiben">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Mit deiner Unterschrift bestätigst du den Dienstleistungsvertrag. Wir
            speichern ein PDF mit Zeitstempel.
          </p>
          <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Dein vollständiger Name" maxLength={120} />
          <SignaturePad onChange={setCSig} />
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end">
            <Button size="sm" disabled={pending || !cSig || cName.trim().length < 2} onClick={signContract}>
              Rechtsverbindlich unterschreiben
            </Button>
          </div>
        </div>
      </Modal>

      {/* SEPA-Modal */}
      <Modal open={openSepa} onClose={() => setOpenSepa(false)} title="SEPA-Lastschriftmandat">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Erteile uns das SEPA-Lastschriftmandat. Deine IBAN wird verschlüsselt
            gespeichert.
          </p>
          <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Kontoinhaber" maxLength={140} />
          <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN" maxLength={40} />
          <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Dein vollständiger Name" maxLength={120} />
          <SignaturePad onChange={setSSig} />
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={pending || !sSig || sName.trim().length < 2 || holder.trim().length < 2 || iban.trim().length < 15}
              onClick={signSepa}
            >
              Mandat erteilen
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

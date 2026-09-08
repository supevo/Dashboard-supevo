'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';

const STORE_KEY = 'membershipsProfitEstimate.v2';

type Form = 'einzel' | 'gmbh';

interface EntityInput {
  umsatz: string; // €/Monat netto
  loehne: string; // €/Monat
  kosten: string; // €/Monat
  form: Form;
  rate: string; // % effektiv
}

interface EntityRevenue {
  id: string;
  name: string;
  netMonthlyCents: number;
}

function euro(n: number): string {
  return formatEuroCents(Math.round(n * 100));
}
function num(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
/** Rechtsform grob aus dem Firmennamen raten (GmbH/UG/AG → Körperschaft). */
function guessForm(name: string): Form {
  return /\b(gmbh|ug|ag|ltd|kg|mbh)\b/i.test(name) ? 'gmbh' : 'einzel';
}
const DEFAULT_RATE: Record<Form, string> = { einzel: '35', gmbh: '30' };

/**
 * Überschlagsrechnung getrennt je Rechnungssteller: Einige Kunden laufen übers
 * Einzelunternehmen, andere über die GmbH (am Rechnungssteller hinterlegt). Pro
 * Steller: Netto-Umsatz − Löhne − Kosten = Gewinn vor Steuern, dann grobe
 * Steuern je Rechtsform → monatlich übrig. Grobe Schätzung, keine
 * Steuerberatung. Eingaben liegen nur im Browser.
 */
export function MembershipsProfitEstimate({ entities }: { entities: EntityRevenue[] }) {
  const [inputs, setInputs] = useState<Record<string, EntityInput>>({});
  const [loaded, setLoaded] = useState(false);

  // Startwerte je Steller (Umsatz aus Abos, Rechtsform aus Name geraten).
  useEffect(() => {
    let saved: Record<string, Partial<EntityInput>> = {};
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) saved = JSON.parse(raw) as Record<string, Partial<EntityInput>>;
    } catch {
      /* ignore */
    }
    const next: Record<string, EntityInput> = {};
    for (const e of entities) {
      const s = saved[e.id] ?? {};
      const form = (s.form as Form) ?? guessForm(e.name);
      next[e.id] = {
        umsatz: s.umsatz ?? (e.netMonthlyCents / 100).toFixed(2),
        loehne: s.loehne ?? '',
        kosten: s.kosten ?? '',
        form,
        rate: s.rate ?? DEFAULT_RATE[form],
      };
    }
    setInputs(next);
    setLoaded(true);
  }, [entities]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(inputs));
    } catch {
      /* ignore */
    }
  }, [inputs, loaded]);

  const patch = (id: string, p: Partial<EntityInput>) =>
    setInputs((cur) => ({ ...cur, [id]: { ...cur[id]!, ...p } }));

  if (!loaded) return null;

  let sumUmsatz = 0;
  let sumUebrig = 0;
  const perEntity = entities.map((e) => {
    const i = inputs[e.id]!;
    const umsatz = num(i.umsatz);
    const gewinn = umsatz - num(i.loehne) - num(i.kosten);
    const steuer = gewinn > 0 ? (gewinn * num(i.rate)) / 100 : 0;
    const uebrig = gewinn - steuer;
    sumUmsatz += umsatz;
    sumUebrig += uebrig;
    return { e, i, gewinn, steuer, uebrig };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Überschlagsrechnung (grob) – je Rechnungssteller</CardTitle>
        <p className="text-sm text-muted-foreground">
          Getrennt nach Rechnungssteller (Einzelunternehmen bzw. GmbH – am Kunden
          hinterlegt). Netto-Umsatz minus Löhne und Kosten, dann überschlägige
          Steuern → was monatlich übrig bleibt. Grobe Schätzung, keine
          Steuerberatung. Eingaben nur in diesem Browser.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {perEntity.map(({ e, i, gewinn, steuer, uebrig }) => (
          <div key={e.id} className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{e.name}</div>
              <Select
                value={i.form}
                onChange={(ev) => {
                  const form = ev.target.value as Form;
                  patch(e.id, { form, rate: DEFAULT_RATE[form] });
                }}
                className="h-8 w-auto text-xs"
              >
                <option value="einzel">Einzelunternehmen</option>
                <option value="gmbh">GmbH</option>
              </Select>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <NumField label="Umsatz netto/Mon." value={i.umsatz} onChange={(v) => patch(e.id, { umsatz: v })} suffix="€" />
              <NumField label="Löhne/Mon." value={i.loehne} onChange={(v) => patch(e.id, { loehne: v })} suffix="€" />
              <NumField label="Kosten/Mon." value={i.kosten} onChange={(v) => patch(e.id, { kosten: v })} suffix="€" />
              <NumField label="Steuersatz" value={i.rate} onChange={(v) => patch(e.id, { rate: v })} suffix="%" />
            </div>

            <dl className="mt-2 space-y-0.5 text-sm">
              <Row label="Gewinn vor Steuern" value={euro(gewinn)} muted />
              <Row label={`Steuern (~${num(i.rate)}%)`} value={`− ${euro(steuer)}`} muted />
              <Row label="Bleibt übrig / Monat" value={euro(uebrig)} bold negative={uebrig < 0} />
            </dl>
            {i.form === 'einzel' && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Einzelunternehmen: Unternehmerlohn ist keine Betriebsausgabe – nicht bei „Löhne“ eintragen.
              </p>
            )}
          </div>
        ))}

        <div className="rounded-lg bg-muted/40 p-3">
          <dl className="space-y-0.5 text-sm">
            <Row label="Umsatz netto gesamt / Monat" value={euro(sumUmsatz)} muted />
            <Row label="Gesamt übrig / Monat" value={euro(sumUebrig)} bold negative={sumUebrig < 0} big />
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 pr-7 text-right text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  big,
  negative,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  big?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between',
        muted && 'text-muted-foreground',
        bold && 'border-t pt-1 font-semibold',
      )}
    >
      <dt>{label}</dt>
      <dd className={cn('tabular-nums', big && 'text-base font-bold', negative && 'text-destructive')}>
        {value}
      </dd>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';

const STORE_KEY = 'membershipsProfitEstimate.v1';

interface Inputs {
  umsatz: string; // €/Monat (netto), Startwert = Netto-MRR
  loehne: string; // €/Monat
  kosten: string; // €/Monat, sonstige Fixkosten
  steuerEinzel: string; // % effektiv
  steuerGmbh: string; // % effektiv
}

function euro(n: number): string {
  return formatEuroCents(Math.round(n * 100));
}

function num(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Grobe Überschlagsrechnung unter der Mitgliedschaftsliste: Netto-Umsatz minus
 * Löhne und sonstige Fixkosten = Gewinn vor Steuern, danach überschlägige
 * Steuern für Einzelunternehmen vs. GmbH → monatlich übrig. Bewusst simpel und
 * editierbar (keine Steuerberatung); Eingaben liegen nur im Browser.
 */
export function MembershipsProfitEstimate({
  netMonthlyCents,
}: {
  netMonthlyCents: number;
}) {
  const defaultUmsatz = (netMonthlyCents / 100).toFixed(2);
  const [inp, setInp] = useState<Inputs>({
    umsatz: defaultUmsatz,
    loehne: '',
    kosten: '',
    steuerEinzel: '35',
    steuerGmbh: '30',
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Inputs>;
        setInp((cur) => ({ ...cur, ...saved, umsatz: saved.umsatz ?? cur.umsatz }));
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(inp));
    } catch {
      /* ignore */
    }
  }, [inp, loaded]);

  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInp((cur) => ({ ...cur, [k]: e.target.value }));

  const umsatz = num(inp.umsatz);
  const loehne = num(inp.loehne);
  const kosten = num(inp.kosten);
  const gewinn = umsatz - loehne - kosten;

  const calc = (ratePct: number) => {
    const steuer = gewinn > 0 ? (gewinn * ratePct) / 100 : 0;
    return { steuer, uebrig: gewinn - steuer };
  };
  const einzel = calc(num(inp.steuerEinzel));
  const gmbh = calc(num(inp.steuerGmbh));

  const field = (
    id: keyof Inputs,
    label: string,
    opts?: { suffix?: string; hint?: string },
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={inp[id]}
          onChange={set(id)}
          className="pr-9 text-right tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {opts?.suffix ?? '€'}
        </span>
      </div>
      {opts?.hint && <p className="text-[11px] text-muted-foreground">{opts.hint}</p>}
    </div>
  );

  const Scenario = ({
    title,
    ratePct,
    result,
    hint,
  }: {
    title: string;
    ratePct: number;
    result: { steuer: number; uebrig: number };
    hint: string;
  }) => (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Steuern (~{ratePct}%)</dt>
          <dd className="tabular-nums">− {euro(result.steuer)}</dd>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <dt>Bleibt übrig / Monat</dt>
          <dd className={cn('tabular-nums', result.uebrig < 0 && 'text-destructive')}>
            {euro(result.uebrig)}
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Überschlagsrechnung (grob)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Was bleibt monatlich übrig? Netto-Umsatz minus Löhne und Kosten, dann
          überschlägige Steuern. Grobe Schätzung – keine Steuerberatung. Eingaben
          werden nur in diesem Browser gespeichert.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {field('umsatz', 'Umsatz / Monat (netto)', {
            hint: 'Vorbelegt aus aktiven Abos – anpassbar.',
          })}
          {field('loehne', 'Löhne & Gehälter / Monat', {
            hint: 'Bei GmbH inkl. GF-Gehalt.',
          })}
          {field('kosten', 'Sonstige Fixkosten / Monat', {
            hint: 'Miete, Tools, Werbung …',
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">Gewinn vor Steuern / Monat</span>
          <span className={cn('text-base font-bold tabular-nums', gewinn < 0 && 'text-destructive')}>
            {euro(gewinn)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-3">
            {field('steuerEinzel', 'Steuersatz Einzelunternehmen', { suffix: '%' })}
            <Scenario
              title="Einzelunternehmen"
              ratePct={num(inp.steuerEinzel)}
              result={einzel}
              hint="Einkommensteuer + Gewerbesteuer (progressiv). Unternehmerlohn ist hier KEINE Betriebsausgabe – nicht bei Löhnen eintragen."
            />
          </div>
          <div className="space-y-3">
            {field('steuerGmbh', 'Steuersatz GmbH', { suffix: '%' })}
            <Scenario
              title="GmbH"
              ratePct={num(inp.steuerGmbh)}
              result={gmbh}
              hint="Körperschaft- + Gewerbesteuer + Soli ≈ 30 %. GF-Gehalt zählt zu den Löhnen (oben abgezogen)."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { createManualInvoiceAction } from '@/features/billing/invoice-actions';
import { formatEuroCents } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface ItemRow {
  description: string;
  quantity: string;
  unitPrice: string; // Euro, als Text (deutsche oder englische Dezimaltrennung)
}

/** "12,50" / "12.5" → Cent (ganzzahlig). Ungültig → 0. */
function euroToCents(input: string): number {
  const n = Number(input.replace(/\./g, '').replace(',', '.'));
  // Erst deutsche Notation (1.234,56) versuchen; sonst direkte Zahl.
  const direct = Number(input.replace(',', '.'));
  const val = Number.isFinite(n) && input.includes(',') ? n : direct;
  return Number.isFinite(val) ? Math.round(val * 100) : 0;
}

function emptyRow(): ItemRow {
  return { description: '', quantity: '1', unitPrice: '' };
}

/**
 * Manuelle Rechnung mit freien Positionen. Legt einen Entwurf an; danach greift
 * der normale Ablauf (finalisieren → PDF → senden → bezahlt). Entweder mit
 * festem Kunden (Kundenprofil) oder mit Kundenauswahl (Finanzen-Übersicht).
 */
export interface BillingEntityOption {
  id: string;
  name: string;
  defaultTaxRate: number;
  smallBusiness: boolean;
}

export function ManualInvoiceForm({
  clientCompanyId,
  clients,
  entities = [],
  defaultTaxRate = 19,
}: {
  clientCompanyId?: string;
  clients?: { id: string; name: string }[];
  /** Rechnungssteller zur Auswahl (bestimmt Absender + Nummernkreis). */
  entities?: BillingEntityOption[];
  defaultTaxRate?: number;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clientCompanyId ?? clients?.[0]?.id ?? '');
  const [entityId, setEntityId] = useState(entities[0]?.id ?? '');
  const selectedEntity = entities.find((e) => e.id === entityId) ?? null;
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [taxRate, setTaxRate] = useState(
    String(entities[0]?.defaultTaxRate ?? defaultTaxRate),
  );

  function onEntityChange(id: string) {
    setEntityId(id);
    const ent = entities.find((e) => e.id === id);
    if (ent) setTaxRate(String(ent.smallBusiness ? 0 : ent.defaultTaxRate));
  }
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const totals = useMemo(() => {
    const net = items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * euroToCents(it.unitPrice),
      0,
    );
    const rate = Number(taxRate.replace(',', '.')) || 0;
    const tax = Math.round((net * rate) / 100);
    return { net, tax, gross: net + tax };
  }, [items, taxRate]);

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function submit() {
    setError(null);
    setOk(null);
    const cid = clientCompanyId ?? clientId;
    if (!cid) {
      setError('Bitte einen Kunden wählen.');
      return;
    }
    const payloadItems = items
      .map((it) => ({
        description: it.description.trim(),
        quantity: Math.max(1, Math.round(Number(it.quantity) || 0)),
        unitNetCents: euroToCents(it.unitPrice),
      }))
      .filter((it) => it.description.length > 0);
    if (payloadItems.length === 0) {
      setError('Bitte mindestens eine Position mit Beschreibung angeben.');
      return;
    }
    start(async () => {
      const res = await createManualInvoiceAction({
        clientCompanyId: cid,
        items: payloadItems,
        taxRate: Number(taxRate.replace(',', '.')) || 0,
        billingEntityId: entityId || null,
        dueDate: dueDate || null,
      });
      if (res.status === 'error') {
        setError(res.message);
      } else {
        setOk('Rechnungsentwurf erstellt. Du findest ihn unten in der Liste (prüfen → finalisieren → senden).');
        setItems([emptyRow()]);
        setDueDate('');
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Rechnung erstellen
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Neue Rechnung (manuell)</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Schließen
        </button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {ok && <Alert>{ok}</Alert>}

      <div className="grid gap-2 sm:grid-cols-2">
        {clients && !clientCompanyId && (
          <div className="space-y-1">
            <Label className="text-xs">Kunde</Label>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9">
              <option value="">– Kunde wählen –</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {entities.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Rechnungssteller</Label>
            <Select value={entityId} onChange={(e) => onEntityChange(e.target.value)} className="h-9">
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {entities.length === 0 && !clientCompanyId && (
        <p className="text-xs text-muted-foreground">
          Der Rechnungssteller wird automatisch aus der Kundenzuordnung bzw. dem
          Standard gewählt.
        </p>
      )}

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_4rem_6rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
          <span>Beschreibung</span>
          <span>Menge</span>
          <span>Einzel €</span>
          <span />
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_6rem_2rem] items-center gap-2">
            <Input
              value={it.description}
              onChange={(e) => setItem(i, { description: e.target.value })}
              placeholder="z. B. Betreuung Oktober"
              className="h-9"
            />
            <Input
              type="number"
              min={1}
              value={it.quantity}
              onChange={(e) => setItem(i, { quantity: e.target.value })}
              className="h-9"
            />
            <Input
              inputMode="decimal"
              value={it.unitPrice}
              onChange={(e) => setItem(i, { unitPrice: e.target.value })}
              placeholder="0,00"
              className="h-9"
            />
            <button
              type="button"
              onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))}
              disabled={items.length <= 1}
              title="Position entfernen"
              className="flex h-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setItems((prev) => [...prev, emptyRow()])}
        >
          <Plus className="mr-1 h-4 w-4" /> Position hinzufügen
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">USt-Satz (%)</Label>
          <Input
            inputMode="decimal"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fällig am (optional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
        </div>
      </div>

      <div className="rounded-md bg-muted/40 p-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Netto</span>
          <span className="tabular-nums">{formatEuroCents(totals.net)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">USt</span>
          <span className="tabular-nums">{formatEuroCents(totals.tax)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Brutto</span>
          <span className="tabular-nums">{formatEuroCents(totals.gross)}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selectedEntity?.smallBusiness
            ? 'Kleinunternehmer: wird ohne USt abgerechnet.'
            : 'Bei Kleinunternehmer-Rechnungssteller wird automatisch ohne USt abgerechnet.'}{' '}
          Die laufende Rechnungsnummer wird beim Finalisieren aus dem
          Nummernkreis des Rechnungsstellers vergeben (lückenlos).
        </p>
      </div>

      <Button type="button" size="sm" onClick={submit} disabled={pending}>
        {pending ? 'Wird erstellt …' : 'Rechnungsentwurf erstellen'}
      </Button>
    </div>
  );
}

import { listAccountingCompanies } from '@/features/accounting/queries';
import {
  listReceipts,
  receiptCounts,
  listImportLogs,
} from '@/features/accounting/receipt-queries';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { ReceiptImportButton } from '@/features/accounting/components/receipt-import-button';
import { ReceiptExtractButton } from '@/features/accounting/components/receipt-extract-button';
import { ReceiptDropzone } from '@/features/accounting/components/receipt-dropzone';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import {
  KindFilter,
  type ArtFilter,
} from '@/features/accounting/components/kind-filter';
import { ReceiptKindSelect } from '@/features/accounting/components/receipt-kind-select';
import { ReceiptFieldsEdit } from '@/features/accounting/components/receipt-fields-edit';
import { kategorieLabel } from '@/features/accounting/categories';

function quelleLabel(source: string, konfidenz: number | null): string {
  if (konfidenz != null) return 'KI';
  if (source === 'upload') return 'Upload';
  return 'OneDrive';
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString('de-DE');
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  zugeordnet: 'Zugeordnet',
  ignoriert: 'Ignoriert',
};

/**
 * Belege tab: import receipts from a company's linked OneDrive folders and list
 * what is already registered. Extraction (KI/OCR) follows in a later phase; for
 * now this pulls historical documents into the system, folder by folder.
 */
export async function ReceiptsPanel({
  orgId,
  activeFirma,
  year,
  month,
  art,
  fixedKind,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
  month: number;
  art: ArtFilter;
  /** Sperrt den Tab auf eine Belegart (Ausgangs-/Eingangsrechnungen). */
  fixedKind?: 'einnahme' | 'ausgabe';
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title="Noch keine Firma"
        description="Lege zuerst eine Firma an und verknüpfe ihre OneDrive-Ordner im Tab „Firmen“."
        action={{ href: '/app/finance?tab=firmen', label: 'Zu den Firmen' }}
      />
    );
  }

  const active =
    companies.find((c) => c.entity.id === activeFirma) ?? companies[0];
  if (!active) return null;

  const options: CompanyOption[] = companies.map((c) => ({
    id: c.entity.id,
    label: c.entity.name,
    isDefault: c.entity.is_default,
  }));

  const kindFilter =
    fixedKind ??
    (art === 'einnahmen' ? 'einnahme' : art === 'ausgaben' ? 'ausgabe' : undefined);
  const [receipts, counts, logs] = await Promise.all([
    listReceipts(active.entity.id, kindFilter, { year, month }),
    receiptCounts(active.entity.id),
    listImportLogs(active.entity.id),
  ]);
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
  const firmaBase = `${basePath}&firma=${active.entity.id}`;

  const einLinked = Boolean(active.profile?.onedrive_einnahmen_folder_id);
  const ausLinked = Boolean(active.profile?.onedrive_ausgaben_folder_id);
  const lastLog = logs[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanySwitcher
            companies={options}
            activeId={active.entity.id}
            basePath={basePath}
          />
          <MonthSwitcher
            year={year}
            month={month}
            years={years}
            basePath={firmaBase}
          />
          {!fixedKind && <KindFilter value={art} basePath={firmaBase} />}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {(!fixedKind || fixedKind === 'einnahme') && (
            <span>
              <span className="font-medium text-foreground">
                {counts.einnahme}
              </span>{' '}
              Ausgangsrechnungen
            </span>
          )}
          {(!fixedKind || fixedKind === 'ausgabe') && (
            <span>
              <span className="font-medium text-foreground">
                {counts.ausgabe}
              </span>{' '}
              Eingangsrechnungen
            </span>
          )}
        </div>
      </div>

      <div
        className={
          fixedKind ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'
        }
      >
        {(!fixedKind || fixedKind === 'einnahme') && (
          <div className="rounded-lg border p-4">
            <ReceiptImportButton
              billingEntityId={active.entity.id}
              kind="einnahmen"
              linked={einLinked}
            />
          </div>
        )}
        {(!fixedKind || fixedKind === 'ausgabe') && (
          <div className="rounded-lg border p-4">
            <ReceiptImportButton
              billingEntityId={active.entity.id}
              kind="ausgaben"
              linked={ausLinked}
            />
          </div>
        )}
      </div>

      <ReceiptDropzone billingEntityId={active.entity.id} />

      {(counts.einnahme > 0 || counts.ausgabe > 0) && (
        <ReceiptExtractButton mode="all" id={active.entity.id} />
      )}

      {lastLog && (
        <p className="text-xs text-muted-foreground">
          Letzter Import: {formatDate(lastLog.created_at)} ·{' '}
          {lastLog.kind === 'einnahme' ? 'Einnahmen' : 'Ausgaben'} ·{' '}
          {lastLog.imported_count} neu, {lastLog.skipped_count} vorhanden
          {lastLog.error_count > 0 ? `, ${lastLog.error_count} Fehler` : ''}
        </p>
      )}

      {receipts.length === 0 ? (
        <EmptyState
          icon="📥"
          title="Noch keine Belege importiert"
          description="Verbinde die OneDrive-Ordner im Tab „Firmen“ und ziehe deine Belege oben herein."
        />
      ) : (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <h3 className="text-sm font-semibold">Belegarchiv</h3>
            <span className="text-xs text-muted-foreground">
              {receipts.length} Dateien
              {receipts.filter((r) => r.extract_failed_at).length > 0 && (
                <>
                  {' · '}
                  <span className="text-rose-600 dark:text-rose-400">
                    {receipts.filter((r) => r.extract_failed_at).length} mit
                    Lesefehler
                  </span>
                  {' (nochmal „Belege mit KI auslesen“ wiederholt sie)'}
                </>
              )}{' '}
              · Aufbewahrung 10 Jahre (GoBD)
            </span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Art</th>
                <th className="px-3 py-2 font-medium">Datei</th>
                <th className="px-3 py-2 font-medium">Händler</th>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 text-right font-medium">Brutto</th>
                <th className="px-3 py-2 font-medium">Kategorie</th>
                <th className="px-3 py-2 font-medium">Quelle</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">KI</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <ReceiptKindSelect
                      receiptId={r.id}
                      value={r.kind === 'einnahme' ? 'einnahme' : 'ausgabe'}
                    />
                  </td>
                  <td className="max-w-[18rem] truncate px-3 py-2" title={r.file_name}>
                    {r.file_name}
                  </td>
                  <ReceiptFieldsEdit
                    receiptId={r.id}
                    haendler={r.haendler}
                    belegDatum={r.beleg_datum}
                    bruttoCents={r.brutto_cents}
                  />
                  <td className="px-3 py-2">{kategorieLabel(r.kategorie_id)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {quelleLabel(r.source, r.konfidenz)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.extract_failed_at ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                        ⚠️ Lesefehler
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ReceiptExtractButton mode="one" id={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

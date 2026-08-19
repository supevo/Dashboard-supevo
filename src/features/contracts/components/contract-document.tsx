import { formatEuroCents } from '@/lib/money';
import type { ContractData } from '@/features/contracts/queries';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #vertrag, #vertrag * { visibility: visible !important; }
  #vertrag { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .no-print { display: none !important; }
  @page { margin: 18mm; }
}
`;

/**
 * Druckbarer Dienstleistungsvertrag. Rendert Vertragspartner, Positionen aus den
 * Modulen, Konditionstext und Unterschriftsfelder. Über den Browser-Druckdialog
 * als PDF speicherbar (Print-CSS isoliert #vertrag).
 */
export function ContractDocument({ data }: { data: ContractData }) {
  const vatNote = data.smallBusiness
    ? 'Kleinunternehmer gemäß § 19 UStG – es wird keine Umsatzsteuer ausgewiesen.'
    : `Alle Beträge netto zzgl. gesetzlicher Umsatzsteuer (${data.taxRatePct} %).`;

  return (
    <div id="vertrag" className="mx-auto max-w-[820px] bg-white p-8 text-sm text-black shadow-sm dark:bg-white">
      <style>{PRINT_CSS}</style>

      <div className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          {data.logoDark && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logoDark} alt="" className="mb-3 h-10 w-auto" />
          )}
          <h1 className="text-2xl font-bold">Dienstleistungsvertrag</h1>
          <p className="mt-1 text-xs text-gray-500">
            Datum: {data.date}
            {data.reference ? ` · ${data.reference}` : ''}
          </p>
        </div>
        <div className="text-right text-xs leading-relaxed">
          <div className="font-semibold">{data.provider.name}</div>
          {data.provider.addressLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          {data.provider.email && <div>{data.provider.email}</div>}
          {data.provider.phone && <div>{data.provider.phone}</div>}
        </div>
      </div>

      {/* Vertragspartner */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Auftragnehmer
          </div>
          <div className="mt-1 leading-relaxed">
            <div className="font-medium">{data.provider.name}</div>
            {data.provider.addressLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            {data.provider.vatId && <div>USt-IdNr.: {data.provider.vatId}</div>}
            {!data.provider.vatId && data.provider.taxNumber && (
              <div>Steuernr.: {data.provider.taxNumber}</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Auftraggeber
          </div>
          <div className="mt-1 leading-relaxed">
            <div className="font-medium">{data.customer.name}</div>
            {data.customer.contactName && <div>z. Hd. {data.customer.contactName}</div>}
            {data.customer.email && <div>{data.customer.email}</div>}
            <div className="mt-1 text-gray-500">Anschrift: ______________________</div>
          </div>
        </div>
      </div>

      {/* Positionen */}
      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Leistungen / Positionsübersicht
        </div>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-1.5">Leistung</th>
              <th className="py-1.5 text-right">monatlich (netto)</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 && (
              <tr>
                <td colSpan={2} className="py-3 text-gray-500">
                  Keine Module ausgewählt.
                </td>
              </tr>
            )}
            {data.lines.map((l, i) => (
              <tr key={i} className="border-b align-top">
                <td className="py-1.5">
                  <div className="font-medium">{l.label}</div>
                  {l.detail && <div className="text-xs text-gray-500">{l.detail}</div>}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {formatEuroCents(l.monthlyCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {data.discountCents > 0 && (
              <tr>
                <td className="py-1.5 text-right text-gray-600">Gutschein</td>
                <td className="py-1.5 text-right whitespace-nowrap text-gray-600">
                  −{formatEuroCents(data.discountCents)}
                </td>
              </tr>
            )}
            <tr className="border-t-2">
              <td className="py-2 text-right font-semibold">Monatlich netto</td>
              <td className="py-2 text-right font-bold whitespace-nowrap">
                {formatEuroCents(data.monthlyNetCents)}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-gray-500">{vatNote}</p>
        {data.budgetCents > 0 && (
          <p className="text-xs text-gray-500">
            Zzgl. Werbebudget {formatEuroCents(data.budgetCents)}/Monat – wird separat
            abgerechnet und ist nicht Teil der Agenturvergütung.
          </p>
        )}
      </div>

      {/* Konditionen */}
      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Vertragsbedingungen
        </div>
        <div className="mt-2 whitespace-pre-line text-xs leading-relaxed">
          {data.terms}
        </div>
      </div>

      {/* Unterschriften */}
      <div className="mt-12 grid grid-cols-2 gap-10 text-xs">
        <div>
          <div className="border-t border-black pt-1">Ort, Datum – Auftraggeber</div>
          <div className="mt-8 border-t border-black pt-1">Unterschrift Auftraggeber</div>
        </div>
        <div>
          <div className="border-t border-black pt-1">Ort, Datum – Auftragnehmer</div>
          <div className="mt-8 border-t border-black pt-1">Unterschrift Auftragnehmer</div>
        </div>
      </div>

      {data.provider.iban && (
        <p className="mt-8 border-t pt-2 text-[10px] text-gray-400">
          Bankverbindung: {data.provider.bankName ? `${data.provider.bankName}, ` : ''}
          IBAN {data.provider.iban}
          {data.provider.bic ? ` · BIC ${data.provider.bic}` : ''}
        </p>
      )}
    </div>
  );
}

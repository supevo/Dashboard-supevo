import 'server-only';

/**
 * Minimal SEPA Core Direct Debit (pain.008.001.02) generator.
 *
 * Produces an XML file suitable for import into German online-banking / banking
 * software to collect membership fees. Uses sequence type RCUR (recurring),
 * which fits ongoing memberships. Amounts are integer cents.
 */

export interface SepaCreditor {
  name: string;
  iban: string;
  bic?: string | null;
  creditorId: string; // Gläubiger-Identifikationsnummer
}

export interface SepaDebit {
  endToEndId: string; // e.g. invoice number
  amountCents: number;
  debtorName: string;
  debtorIban: string;
  debtorBic?: string | null;
  mandateId: string;
  mandateDate: string; // YYYY-MM-DD
  remittanceInfo: string; // shown on the debtor's statement
}

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Sanitizes free text to the SEPA-allowed Latin character set. */
function sepaText(s: string, max = 70): string {
  return esc(
    (s ?? '')
      .replace(/[^A-Za-z0-9/\-?:().,'+ äöüÄÖÜß&]/g, ' ')
      .trim()
      .slice(0, max),
  );
}

export function generatePain008(params: {
  creditor: SepaCreditor;
  debits: SepaDebit[];
  requestedCollectionDate: string; // YYYY-MM-DD
  messageId?: string;
}): string {
  const { creditor, debits, requestedCollectionDate } = params;
  const now = new Date();
  const msgId =
    params.messageId ?? `SUPEVO-${now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
  const creDtTm = now.toISOString().slice(0, 19);
  const nbOfTxs = debits.length;
  const ctrlSum = euros(debits.reduce((s, d) => s + d.amountCents, 0));

  const txs = debits
    .map(
      (d) => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>${sepaText(d.endToEndId, 35)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${euros(d.amountCents)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${sepaText(d.mandateId, 35)}</MndtId>
            <DtOfSgntr>${d.mandateDate}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId>${
          d.debtorBic
            ? `<BIC>${esc(d.debtorBic)}</BIC>`
            : '<Othr><Id>NOTPROVIDED</Id></Othr>'
        }</FinInstnId></DbtrAgt>
        <Dbtr><Nm>${sepaText(d.debtorName)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${esc(d.debtorIban.replace(/\s/g, ''))}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${sepaText(d.remittanceInfo, 140)}</Ustrd></RmtInf>
      </DrctDbtTxInf>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty><Nm>${sepaText(creditor.name)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-1</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${requestedCollectionDate}</ReqdColltnDt>
      <Cdtr><Nm>${sepaText(creditor.name)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(creditor.iban.replace(/\s/g, ''))}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId>${
        creditor.bic
          ? `<BIC>${esc(creditor.bic)}</BIC>`
          : '<Othr><Id>NOTPROVIDED</Id></Othr>'
      }</FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr>
        <Id>${esc(creditor.creditorId)}</Id>
        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
      </Othr></PrvtId></Id></CdtrSchmeId>${txs}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}

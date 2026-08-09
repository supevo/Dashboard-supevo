import { describe, it, expect } from 'vitest';
import { germanAmountToCents, normalizeDate } from '../types';
import { parseBankCsv } from '../csv';
import { parseMt940 } from '../mt940';
import { parseCamt053 } from '../camt';
import { detectFormat, parseBankStatement } from '../parse';

describe('germanAmountToCents', () => {
  it('parses German thousands/decimal', () => {
    expect(germanAmountToCents('1.234,56')).toBe(123456);
    expect(germanAmountToCents('-1.234,56')).toBe(-123456);
    expect(germanAmountToCents('1234,56-')).toBe(-123456);
    expect(germanAmountToCents('89,90')).toBe(8990);
    expect(germanAmountToCents('1234.56')).toBe(123456);
    expect(germanAmountToCents('')).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('handles common shapes', () => {
    expect(normalizeDate('2024-03-05')).toBe('2024-03-05');
    expect(normalizeDate('05.03.2024')).toBe('2024-03-05');
    expect(normalizeDate('5.3.24')).toBe('2024-03-05');
    expect(normalizeDate('240305')).toBe('2024-03-05');
  });
});

describe('parseBankCsv', () => {
  it('parses a single Betrag column with meta lines before the header', () => {
    const csv = [
      'Kontoauszug;;;',
      'IBAN;DE12...;;',
      'Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag',
      '05.03.2024;ACME GmbH;Rechnung 100;-119,00',
      '06.03.2024;Kunde AG;Zahlung RE-5;1.190,00',
    ].join('\n');
    const res = parseBankCsv(csv);
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toMatchObject({
      datum: '2024-03-05',
      gegen: 'ACME GmbH',
      zweck: 'Rechnung 100',
      betragCents: -11900,
    });
    expect(res.transactions[1]?.betragCents).toBe(119000);
  });

  it('parses separate Soll/Haben columns', () => {
    const csv = [
      'Datum;Name;Verwendungszweck;Soll;Haben',
      '05.03.2024;ACME;Miete;800,00;',
      '06.03.2024;Kunde;Zahlung;;1.190,00',
    ].join('\n');
    const res = parseBankCsv(csv);
    expect(res.transactions[0]?.betragCents).toBe(-80000);
    expect(res.transactions[1]?.betragCents).toBe(119000);
  });
});

describe('parseMt940', () => {
  it('parses :61: and :86: with structured subfields', () => {
    const sta = [
      ':20:STARTUMS',
      ':25:DE12345678901234567890',
      ':60F:C240305EUR1000,00',
      ':61:2403050305D119,00NTRFNONREF',
      ':86:177?00UEBERWEISUNG?32ACME GmbH?20Rechnung 100',
      ':61:2403060306C1190,00NTRFNONREF',
      ':86:166?32Kunde AG?20Zahlung RE-5',
      ':62F:C240306EUR2071,00',
    ].join('\n');
    const res = parseMt940(sta);
    expect(res.accountIban).toBe('DE12345678901234567890');
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toMatchObject({
      datum: '2024-03-05',
      gegen: 'ACME GmbH',
      betragCents: -11900,
    });
    expect(res.transactions[1]?.betragCents).toBe(119000);
    expect(res.transactions[1]?.gegen).toBe('Kunde AG');
  });
});

describe('parseCamt053', () => {
  const xml = `<?xml version="1.0"?>
  <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
    <BkToCstmrStmt><Stmt>
      <Acct><Id><IBAN>DE99123456780000000001</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">119.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2024-03-05</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Cdtr><Nm>ACME GmbH</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>Rechnung 100</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">1190.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2024-03-06</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Kunde AG</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>Zahlung RE-5</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt></BkToCstmrStmt>
  </Document>`;

  it('reads amount, sign, date, counterparty and purpose', () => {
    const res = parseCamt053(xml);
    expect(res.accountIban).toBe('DE99123456780000000001');
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toMatchObject({
      datum: '2024-03-05',
      gegen: 'ACME GmbH',
      zweck: 'Rechnung 100',
      betragCents: -11900,
    });
    expect(res.transactions[1]).toMatchObject({
      gegen: 'Kunde AG',
      betragCents: 119000,
    });
  });

  it('is picked by the format detector and dispatcher', () => {
    expect(detectFormat(xml)).toBe('camt053');
    expect(parseBankStatement(xml).transactions).toHaveLength(2);
  });
});

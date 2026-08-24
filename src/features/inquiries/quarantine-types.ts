export interface QuarantineItem {
  id: string;
  reason: string;
  fromAddress: string | null;
  toAddresses: string[];
  subject: string | null;
  body: string | null;
  createdAt: string;
}

const REASON_LABEL: Record<string, string> = {
  no_token: 'Kein passender Kunde (unbekannte/deaktivierte Adresse)',
  multiple_tokens: 'Mehrdeutig (mehrere Kunden in einer Mail)',
};

export function quarantineReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

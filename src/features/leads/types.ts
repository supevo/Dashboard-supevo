export type LeadStatus = 'new' | 'contacted' | 'offer' | 'won' | 'lost';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'offer',
  'won',
  'lost',
];

export interface Lead {
  id: string;
  contactName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  note: string | null;
  industry: string | null;
  goals: string | null;
  targetGroup: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  estimatedValueCents: number | null;
  status: LeadStatus;
  /** Set once the lead has been converted into a client. */
  convertedClientCompanyId?: string | null;
  createdAt: string;
}

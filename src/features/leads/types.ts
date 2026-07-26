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
  estimatedValueCents: number | null;
  status: LeadStatus;
  createdAt: string;
}

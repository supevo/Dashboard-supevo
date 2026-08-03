import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface AppointmentSlot {
  date: string;
  time: string | null;
}

export interface AppointmentRequest {
  id: string;
  topic: string;
  note: string | null;
  slots: AppointmentSlot[];
  status: 'requested' | 'confirmed' | 'declined';
  confirmedDate: string | null;
  confirmedTime: string | null;
  createdAt: string;
}

export interface PendingAppointment extends AppointmentRequest {
  companyName: string;
  requesterName: string;
}

function toSlots(r: {
  opt1_date: string;
  opt1_time: string | null;
  opt2_date: string | null;
  opt2_time: string | null;
  opt3_date: string | null;
  opt3_time: string | null;
}): AppointmentSlot[] {
  const slots: AppointmentSlot[] = [{ date: r.opt1_date, time: r.opt1_time }];
  if (r.opt2_date) slots.push({ date: r.opt2_date, time: r.opt2_time });
  if (r.opt3_date) slots.push({ date: r.opt3_date, time: r.opt3_time });
  return slots;
}

function normStatus(s: string): AppointmentRequest['status'] {
  return s === 'confirmed' || s === 'declined' ? s : 'requested';
}

/** The current client's own appointment requests (RLS-scoped), newest first. */
export async function listMyAppointments(): Promise<AppointmentRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('appointment_requests')
    .select(
      'id, topic, note, opt1_date, opt1_time, opt2_date, opt2_time, opt3_date, opt3_time, status, confirmed_date, confirmed_time, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: r.id,
    topic: r.topic,
    note: r.note,
    slots: toSlots(r),
    status: normStatus(r.status),
    confirmedDate: r.confirmed_date,
    confirmedTime: r.confirmed_time,
    createdAt: r.created_at,
  }));
}

/** Pending appointment requests for the agency inbox (service client, org-wide). */
export async function listPendingAppointments(
  orgId: string,
): Promise<PendingAppointment[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('appointment_requests')
    .select(
      'id, topic, note, opt1_date, opt1_time, opt2_date, opt2_time, opt3_date, opt3_time, status, confirmed_date, confirmed_time, created_at, client_company_id, created_by',
    )
    .eq('organization_id', orgId)
    .eq('status', 'requested')
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const companyIds = [...new Set(rows.map((r) => r.client_company_id))];
  const userIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))];
  const [{ data: companies }, { data: profiles }] = await Promise.all([
    service.from('client_companies').select('id, name').in('id', companyIds),
    userIds.length
      ? service.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name] as const));
  const requesterName = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );

  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    note: r.note,
    slots: toSlots(r),
    status: normStatus(r.status),
    confirmedDate: r.confirmed_date,
    confirmedTime: r.confirmed_time,
    createdAt: r.created_at,
    companyName: companyName.get(r.client_company_id) ?? '—',
    requesterName: r.created_by ? (requesterName.get(r.created_by) ?? '—') : '—',
  }));
}

import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PrintExpense {
  id: string;
  clientCompanyId: string | null;
  clientName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  uploadedByName: string | null;
  fileName: string;
  amountCents: number | null;
  supplier: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Lists the org's print-product expenses (uploaded supplier invoices) for the
 * internal „Ausgaben" area. RLS restricts reads to org admins / super admins.
 */
export async function listPrintExpenses(orgId: string): Promise<PrintExpense[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('print_expenses')
    .select(
      'id, client_company_id, task_id, uploaded_by, file_name, amount_cents, supplier, notes, created_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const clientIds = [
    ...new Set(rows.map((r) => r.client_company_id).filter((v): v is string => !!v)),
  ];
  const taskIds = [
    ...new Set(rows.map((r) => r.task_id).filter((v): v is string => !!v)),
  ];
  const userIds = [
    ...new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => !!v)),
  ];

  const [clients, tasks, users] = await Promise.all([
    clientIds.length
      ? supabase.from('client_companies').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    taskIds.length
      ? supabase.from('tasks').select('id, title').in('id', taskIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    userIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const clientName = new Map((clients.data ?? []).map((c) => [c.id, c.name]));
  const taskTitle = new Map((tasks.data ?? []).map((t) => [t.id, t.title]));
  const userName = new Map(
    (users.data ?? []).map((u) => [u.id, u.full_name ?? null]),
  );

  return rows.map((r) => ({
    id: r.id,
    clientCompanyId: r.client_company_id,
    clientName: r.client_company_id ? clientName.get(r.client_company_id) ?? null : null,
    taskId: r.task_id,
    taskTitle: r.task_id ? taskTitle.get(r.task_id) ?? null : null,
    uploadedByName: r.uploaded_by ? userName.get(r.uploaded_by) ?? null : null,
    fileName: r.file_name,
    amountCents: r.amount_cents,
    supplier: r.supplier,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/** Sum of all recorded expense amounts (in cents), ignoring rows without one. */
export function sumExpenseCents(expenses: PrintExpense[]): number {
  return expenses.reduce((acc, e) => acc + (e.amountCents ?? 0), 0);
}

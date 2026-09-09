import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface PhilosophyQuote {
  id: string;
  text: string;
  active: boolean;
}

/** Aktive Philosophie-Texte der Org (für das Banner in der Übersicht). */
export async function listActivePhilosophyQuotes(
  orgId: string,
): Promise<string[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('philosophy_quotes')
    .select('text, active, position, created_at')
    .eq('organization_id', orgId)
    .eq('active', true)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return ((data ?? []) as unknown as { text: string }[]).map((q) => q.text);
}

/** Alle Philosophie-Texte der Org (für den Admin-Editor in den Einstellungen). */
export async function listAllPhilosophyQuotes(
  orgId: string,
): Promise<PhilosophyQuote[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('philosophy_quotes')
    .select('id, text, active, position, created_at')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return ((data ?? []) as unknown as {
    id: string;
    text: string;
    active: boolean;
  }[]).map((q) => ({ id: q.id, text: q.text, active: q.active }));
}

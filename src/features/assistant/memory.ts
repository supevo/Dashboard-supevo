import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface AssistantMemory {
  id: string;
  content: string;
  createdAt: string;
}

/** Zeichen-Budget des Gedächtnis-Blocks im System-Prompt (Kostenschutz). */
const MEMORY_CHAR_BUDGET = 4000;

/** Lädt die Gedächtnis-Einträge einer Organisation (neueste zuerst). */
export async function listAssistantMemory(
  orgId: string,
): Promise<AssistantMemory[]> {
  // 'assistant_memory' (Migration 0179) ist noch nicht in den generierten
  // DB-Typen → Ergebnis-Zeilen casten.
  const { data } = await createSupabaseServiceClient()
    .from('assistant_memory')
    .select('id, content, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as {
    id: string;
    content: string;
    created_at: string;
  }[];
  return rows.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.created_at,
  }));
}

/**
 * Baut den Gedächtnis-Block für den System-Prompt: die neuesten Einträge bis
 * zum Zeichen-Budget. Leerer String, wenn nichts hinterlegt ist.
 */
export async function assistantMemoryPromptBlock(orgId: string): Promise<string> {
  const items = await listAssistantMemory(orgId);
  if (items.length === 0) return '';
  const lines: string[] = [];
  let used = 0;
  for (const m of items) {
    const line = `- ${m.content.trim()}`;
    if (used + line.length > MEMORY_CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/** Speichert einen Gedächtnis-Eintrag (org-scoped). Für das „merk dir"-Werkzeug. */
export async function addAssistantMemory(
  orgId: string,
  userId: string,
  content: string,
): Promise<boolean> {
  const trimmed = content.trim().slice(0, 2000);
  if (!trimmed) return false;
  const { error } = await createSupabaseServiceClient()
    .from('assistant_memory')
    .insert({ organization_id: orgId, created_by: userId, content: trimmed } as never);
  return !error;
}

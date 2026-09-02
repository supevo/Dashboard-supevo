import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

/** Embedding-Modell (1536 Dim.) – muss zur Vektor-Spalte in 0180 passen. */
const EMBED_MODEL = 'text-embedding-3-small';
const CHUNK_CHARS = 1000;
const CHUNK_OVERLAP = 150;

export interface KnowledgeDoc {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

/** Erzeugt Embeddings für mehrere Texte (OpenAI). Leer, wenn kein Key gesetzt. */
async function embed(texts: string[]): Promise<number[][]> {
  const key = openaiKey();
  if (!key || texts.length === 0) return [];
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: key });
  const res = await client.embeddings.create({ model: EMBED_MODEL, input: texts });
  return res.data.map((d) => d.embedding as number[]);
}

/** Zerlegt Text in überlappende Abschnitte (~1000 Zeichen). */
function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > CHUNK_CHARS && cur) {
      chunks.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - CHUNK_OVERLAP)) + '\n\n' + p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  // Sehr lange Absätze hart nachschneiden.
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= CHUNK_CHARS * 1.5) out.push(c);
    else for (let i = 0; i < c.length; i += CHUNK_CHARS) out.push(c.slice(i, i + CHUNK_CHARS));
  }
  return out;
}

/** True, wenn RAG nutzbar ist (OpenAI-Key vorhanden). */
export function isKnowledgeEnabled(): boolean {
  return !!openaiKey();
}

/** Speichert ein Dokument + Embeddings der Abschnitte. Gibt die Anzahl zurück. */
export async function ingestKnowledge(
  orgId: string,
  userId: string,
  title: string,
  content: string,
): Promise<{ ok: boolean; chunks: number; error?: string }> {
  const chunks = chunkText(content);
  if (chunks.length === 0) return { ok: false, chunks: 0, error: 'Kein Inhalt.' };

  let vectors: number[][] = [];
  try {
    vectors = await embed(chunks);
  } catch (e) {
    logger.error('knowledge.embed_failed', { error: (e as Error).message });
    return { ok: false, chunks: 0, error: 'Embedding fehlgeschlagen.' };
  }
  if (vectors.length !== chunks.length) {
    return { ok: false, chunks: 0, error: 'KI/Embeddings nicht verfügbar.' };
  }

  const service = createSupabaseServiceClient();
  const { data: doc, error: docErr } = await service
    .from('assistant_knowledge_docs')
    .insert({ organization_id: orgId, title: title.trim().slice(0, 200), created_by: userId } as never)
    .select('id')
    .single();
  if (docErr || !doc) {
    return { ok: false, chunks: 0, error: 'Dokument konnte nicht angelegt werden.' };
  }

  const rows = chunks.map((content, i) => ({
    document_id: (doc as { id: string }).id,
    organization_id: orgId,
    content,
    embedding: JSON.stringify(vectors[i]),
  }));
  const { error: chunkErr } = await service
    .from('assistant_knowledge_chunks')
    .insert(rows as never);
  if (chunkErr) {
    logger.error('knowledge.chunks_failed', { error: chunkErr.message });
    return { ok: false, chunks: 0, error: 'Abschnitte konnten nicht gespeichert werden.' };
  }
  return { ok: true, chunks: chunks.length };
}

/** Semantische Suche in der Wissensbasis – liefert die relevantesten Abschnitte. */
export async function searchKnowledge(
  orgId: string,
  query: string,
  k = 5,
): Promise<string[]> {
  if (!query.trim()) return [];
  let vectors: number[][] = [];
  try {
    vectors = await embed([query]);
  } catch {
    return [];
  }
  if (vectors.length === 0) return [];

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('match_assistant_knowledge' as never, {
    p_org: orgId,
    query_embedding: JSON.stringify(vectors[0]),
    match_count: k,
  } as never);
  if (error) {
    logger.error('knowledge.search_failed', { error: (error as { message?: string }).message });
    return [];
  }
  return ((data ?? []) as unknown as { content: string }[]).map((r) => r.content);
}

/** Listet die Wissens-Dokumente einer Org (mit Abschnittsanzahl). */
export async function listKnowledgeDocs(orgId: string): Promise<KnowledgeDoc[]> {
  const service = createSupabaseServiceClient();
  const { data: docs } = await service
    .from('assistant_knowledge_docs')
    .select('id, title, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (docs ?? []) as { id: string; title: string; created_at: string }[];
  if (rows.length === 0) return [];

  const counts = new Map<string, number>();
  const { data: chunks } = await service
    .from('assistant_knowledge_chunks')
    .select('document_id')
    .in('document_id', rows.map((d) => d.id));
  for (const c of (chunks ?? []) as { document_id: string }[]) {
    counts.set(c.document_id, (counts.get(c.document_id) ?? 0) + 1);
  }
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    chunkCount: counts.get(d.id) ?? 0,
    createdAt: d.created_at,
  }));
}

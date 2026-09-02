-- =============================================================================
-- Migration 0180 – KI-Assistent: Wissensbasis (RAG) mit Vektor-Suche
--
-- Eingefügte Dokumente (SOPs, Preislisten, FAQs …) werden in Abschnitte (chunks)
-- zerlegt und als Embeddings (OpenAI text-embedding-3-small, 1536 Dim.) abgelegt.
-- Der Assistent durchsucht sie per Werkzeug semantisch und antwortet fundiert.
-- Pflege nur Super-Admin; Nutzung org-weit über den Service-Client.
-- =============================================================================

create extension if not exists vector;

create table if not exists public.assistant_knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists assistant_knowledge_docs_org_idx
  on public.assistant_knowledge_docs (organization_id, created_at desc);

create table if not exists public.assistant_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.assistant_knowledge_docs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists assistant_knowledge_chunks_doc_idx
  on public.assistant_knowledge_chunks (document_id);
create index if not exists assistant_knowledge_chunks_org_idx
  on public.assistant_knowledge_chunks (organization_id);
-- HNSW-Index für schnelle Cosine-Ähnlichkeitssuche.
create index if not exists assistant_knowledge_chunks_embedding_idx
  on public.assistant_knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.assistant_knowledge_docs enable row level security;
alter table public.assistant_knowledge_chunks enable row level security;

-- Lesen: Agentur-Mitarbeiter der Org (der Assistent nutzt ohnehin den Service-
-- Client). Schreiben/Löschen: nur Super-Admin.
create policy assistant_knowledge_docs_select on public.assistant_knowledge_docs
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy assistant_knowledge_docs_write on public.assistant_knowledge_docs
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy assistant_knowledge_chunks_select on public.assistant_knowledge_chunks
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy assistant_knowledge_chunks_write on public.assistant_knowledge_chunks
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Semantische Suche: nimmt das Query-Embedding als JSON-Text (['[0.1,...]']),
-- castet es auf vector und liefert die ähnlichsten Abschnitte der Organisation.
create or replace function public.match_assistant_knowledge(
  p_org uuid,
  query_embedding text,
  match_count int
)
returns table (content text, document_id uuid, distance double precision)
language sql
stable
as $$
  select c.content, c.document_id,
         (c.embedding <=> query_embedding::vector) as distance
  from public.assistant_knowledge_chunks c
  where c.organization_id = p_org
    and c.embedding is not null
  order by c.embedding <=> query_embedding::vector
  limit match_count
$$;

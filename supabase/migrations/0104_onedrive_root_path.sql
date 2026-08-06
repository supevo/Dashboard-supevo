-- =============================================================================
-- Migration 0104 – OneDrive: Basisordner (Zugriffsgrenze)
--
-- Begrenzt den Zugriff der App auf einen Basisordner (z. B. "ONE STEP/Kunden").
-- Das Team kann nur innerhalb dieses Ordners navigieren, nicht im übrigen
-- privaten OneDrive. Leer = keine Begrenzung.
-- =============================================================================

alter table public.onedrive_connections
  add column if not exists root_path text;

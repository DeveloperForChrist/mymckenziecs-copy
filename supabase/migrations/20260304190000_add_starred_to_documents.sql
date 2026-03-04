-- Persist per-user document starring across sessions/devices.
ALTER TABLE IF EXISTS public.documents
ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;


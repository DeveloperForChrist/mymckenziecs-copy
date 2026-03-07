CREATE TABLE IF NOT EXISTS public.chat_uploads (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_uploads_owner_expires
  ON public.chat_uploads (owner_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_uploads_expires
  ON public.chat_uploads (expires_at DESC);

ALTER TABLE public.chat_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chat uploads" ON public.chat_uploads;
CREATE POLICY "Users can view own chat uploads"
  ON public.chat_uploads
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own chat uploads" ON public.chat_uploads;
CREATE POLICY "Users can insert own chat uploads"
  ON public.chat_uploads
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own chat uploads" ON public.chat_uploads;
CREATE POLICY "Users can delete own chat uploads"
  ON public.chat_uploads
  FOR DELETE
  USING (auth.uid() = owner_id);

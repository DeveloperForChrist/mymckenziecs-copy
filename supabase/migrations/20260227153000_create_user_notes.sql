CREATE TABLE IF NOT EXISTS public.user_notes (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  notes_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_page_id TEXT,
  selected_case_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_updated_at
  ON public.user_notes (updated_at DESC);


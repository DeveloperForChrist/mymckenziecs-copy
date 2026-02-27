CREATE TABLE IF NOT EXISTS public.user_case_law_history (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  search_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewed_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_case_law_history_updated_at
  ON public.user_case_law_history (updated_at DESC);


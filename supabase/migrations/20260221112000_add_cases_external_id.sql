-- Add legacy/reference case number support used by case-profile APIs.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_external_id
  ON public.cases (user_id, external_id);

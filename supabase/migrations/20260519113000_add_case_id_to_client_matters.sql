-- Link business client matters to per-user cases for document grouping.

ALTER TABLE public.client_matters
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_matters_business_case_unique
  ON public.client_matters (business_id, case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_matters_business_case
  ON public.client_matters (business_id, case_id)
  WHERE case_id IS NOT NULL;


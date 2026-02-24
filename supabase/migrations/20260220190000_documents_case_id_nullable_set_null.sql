-- Allow documents to exist outside a case profile.
-- This lets case-profile deletion move documents to "All files" (case_id = NULL)
-- instead of deleting them via cascade.

ALTER TABLE public.documents
ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_case_id_fkey;

ALTER TABLE public.documents
ADD CONSTRAINT documents_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases(id)
  ON DELETE SET NULL;

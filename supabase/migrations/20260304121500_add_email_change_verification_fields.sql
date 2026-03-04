ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pending_email TEXT,
  ADD COLUMN IF NOT EXISTS email_change_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_change_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_change_token_hash
  ON public.users (email_change_token_hash);

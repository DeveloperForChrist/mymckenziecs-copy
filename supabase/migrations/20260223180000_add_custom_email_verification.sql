ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_verification_token_hash
  ON public.users (verification_token_hash);

UPDATE public.users AS u
SET email_verified_at = COALESCE(u.email_verified_at, au.email_confirmed_at)
FROM auth.users AS au
WHERE u.id = au.id
  AND u.email_verified_at IS NULL
  AND au.email_confirmed_at IS NOT NULL;

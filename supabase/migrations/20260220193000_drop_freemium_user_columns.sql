ALTER TABLE public.users
  DROP COLUMN IF EXISTS freemium_since,
  DROP COLUMN IF EXISTS freemium_message_count,
  DROP COLUMN IF EXISTS freemium_message_window_start;

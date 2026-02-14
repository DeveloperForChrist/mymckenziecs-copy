ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

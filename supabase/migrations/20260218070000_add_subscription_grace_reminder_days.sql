ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_reminder_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.subscriptions
SET grace_reminder_days_sent = '[]'::jsonb
WHERE grace_reminder_days_sent IS NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.subscriptions
SET trial_reminder_days_sent = '[]'::jsonb
WHERE trial_reminder_days_sent IS NULL;

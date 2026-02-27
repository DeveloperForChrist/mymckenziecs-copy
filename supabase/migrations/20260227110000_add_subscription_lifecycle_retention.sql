ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS lifecycle_lapsed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_archive_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_archive_notice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_delete_notice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_archive_warning_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_delete_warning_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_reminder_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.subscriptions
SET lifecycle_reminder_days_sent = '[]'::jsonb
WHERE lifecycle_reminder_days_sent IS NULL;

UPDATE public.subscriptions
SET lifecycle_archive_warning_days_sent = '[]'::jsonb
WHERE lifecycle_archive_warning_days_sent IS NULL;

UPDATE public.subscriptions
SET lifecycle_delete_warning_days_sent = '[]'::jsonb
WHERE lifecycle_delete_warning_days_sent IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_lifecycle_status
  ON public.subscriptions (status, lifecycle_lapsed_at, updated_at DESC);

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS billing_recovery_opt_out BOOLEAN NOT NULL DEFAULT false;

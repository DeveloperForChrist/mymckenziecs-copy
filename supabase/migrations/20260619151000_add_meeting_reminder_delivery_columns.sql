alter table public.meetings
  add column if not exists client_reminder_sent_at timestamptz,
  add column if not exists professional_reminder_sent_at timestamptz;

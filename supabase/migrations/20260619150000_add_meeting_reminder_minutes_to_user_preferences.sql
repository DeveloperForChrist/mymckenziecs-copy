alter table public.user_preferences
  add column if not exists meeting_reminder_minutes integer not null default 1440;

update public.user_preferences
set meeting_reminder_minutes = 1440
where meeting_reminder_minutes is null;

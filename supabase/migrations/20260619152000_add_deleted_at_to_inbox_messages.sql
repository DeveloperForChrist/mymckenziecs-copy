alter table public.inbox_messages
  add column if not exists deleted_at timestamptz;

create index if not exists inbox_messages_recipient_deleted_idx
  on public.inbox_messages (recipient_email, deleted_at, created_at desc);

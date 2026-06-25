create table if not exists public.business_inbox_drafts (
  user_id uuid primary key references public.users(id) on delete cascade,
  recipient_email text not null default '',
  subject text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.business_inbox_drafts enable row level security;

drop policy if exists business_inbox_drafts_all_own on public.business_inbox_drafts;
create policy business_inbox_drafts_all_own
  on public.business_inbox_drafts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

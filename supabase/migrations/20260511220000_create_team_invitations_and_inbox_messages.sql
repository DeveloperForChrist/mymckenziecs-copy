-- Team invitations: sent from TeamPage, read in InboxPage Invitations folder
create table if not exists team_invitations (
  id          uuid        default gen_random_uuid() primary key,
  inviter_id  uuid        references auth.users(id) on delete cascade,
  inviter_email text,
  invited_email text      not null,
  role        text        not null default 'viewer',
  status      text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz default now()
);

alter table team_invitations enable row level security;

-- Inviting user can manage their own invitations
create policy "team_invitations: owner full access"
  on team_invitations for all
  using  (auth.uid() = inviter_id)
  with check (auth.uid() = inviter_id);

-- Invited user can view invitations addressed to them
create policy "team_invitations: invitee select"
  on team_invitations for select
  using (invited_email = auth.email());

-- Invited user can update status (accept / decline)
create policy "team_invitations: invitee update"
  on team_invitations for update
  using (invited_email = auth.email());

-- Service role bypass (used by server-side API routes if needed)
create policy "team_invitations: service role"
  on team_invitations for all
  using (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────────────────────

-- Inbox messages: peer emails + invitation notifications
create table if not exists inbox_messages (
  id              uuid        default gen_random_uuid() primary key,
  sender_id       uuid        references auth.users(id) on delete set null,
  sender_email    text,
  sender_name     text,
  recipient_email text        not null,
  subject         text        not null,
  content         text        default '',
  type            text        not null default 'email'
                              check (type in ('email', 'invitation')),
  is_read         boolean     not null default false,
  is_starred      boolean     not null default false,
  metadata        jsonb,
  created_at      timestamptz default now()
);

alter table inbox_messages enable row level security;

-- Recipient can view messages sent to them
create policy "inbox_messages: recipient select"
  on inbox_messages for select
  using (recipient_email = auth.email());

-- Authenticated users can send messages (insert)
create policy "inbox_messages: sender insert"
  on inbox_messages for insert
  with check (sender_id = auth.uid());

-- Recipient can update their own messages (mark read, star)
create policy "inbox_messages: recipient update"
  on inbox_messages for update
  using (recipient_email = auth.email());

-- Service role bypass
create policy "inbox_messages: service role"
  on inbox_messages for all
  using (auth.role() = 'service_role');

-- Indexes for common query patterns
create index if not exists inbox_messages_recipient_idx on inbox_messages (recipient_email);
create index if not exists inbox_messages_sender_idx    on inbox_messages (sender_id);
create index if not exists team_invitations_inviter_idx on team_invitations (inviter_id);
create index if not exists team_invitations_invited_idx on team_invitations (invited_email);

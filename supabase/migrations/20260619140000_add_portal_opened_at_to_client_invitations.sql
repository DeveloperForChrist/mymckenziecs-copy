alter table public.client_invitations
  add column if not exists portal_opened_at timestamptz;

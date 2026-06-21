-- Align legacy inbox message type constraints with the current portal flows.
-- Older migration history allowed only ('email', 'invitation'), but current
-- code also stores 'client_invite' rows for client portal invitations.

alter table public.inbox_messages
  drop constraint if exists inbox_messages_type_check;

alter table public.inbox_messages
  add constraint inbox_messages_type_check
  check (
    type = any (
      array[
        'email'::text,
        'invitation'::text,
        'client_invite'::text
      ]
    )
  );

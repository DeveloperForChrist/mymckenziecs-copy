-- Team invitations (used by TeamPage + InboxPage Invitations folder)
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id UUID REFERENCES auth.users(id),
  inviter_email TEXT,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage invitations" ON public.team_invitations;
CREATE POLICY "Owners manage invitations"
  ON public.team_invitations
  FOR ALL
  USING (auth.uid() = inviter_id);

DROP POLICY IF EXISTS "Invitees view their invitations" ON public.team_invitations;
CREATE POLICY "Invitees view their invitations"
  ON public.team_invitations
  FOR SELECT
  USING (invited_email = auth.email());

DROP POLICY IF EXISTS "Invitees update their invitations" ON public.team_invitations;
CREATE POLICY "Invitees update their invitations"
  ON public.team_invitations
  FOR UPDATE
  USING (invited_email = auth.email());

DROP POLICY IF EXISTS "Service role can manage team invitations" ON public.team_invitations;
CREATE POLICY "Service role can manage team invitations"
  ON public.team_invitations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Inbox messages (used by InboxPage compose + invitation notifications)
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id),
  sender_email TEXT,
  sender_name TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT DEFAULT '',
  type TEXT DEFAULT 'email',
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbox_messages_recipient_email_idx
  ON public.inbox_messages (recipient_email, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_messages_sender_id_idx
  ON public.inbox_messages (sender_id);

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients view their messages" ON public.inbox_messages;
CREATE POLICY "Recipients view their messages"
  ON public.inbox_messages
  FOR SELECT
  USING (recipient_email = auth.email());

DROP POLICY IF EXISTS "Users send messages" ON public.inbox_messages;
CREATE POLICY "Users send messages"
  ON public.inbox_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Recipients update their messages" ON public.inbox_messages;
CREATE POLICY "Recipients update their messages"
  ON public.inbox_messages
  FOR UPDATE
  USING (recipient_email = auth.email());

DROP POLICY IF EXISTS "Service role can manage inbox messages" ON public.inbox_messages;
CREATE POLICY "Service role can manage inbox messages"
  ON public.inbox_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

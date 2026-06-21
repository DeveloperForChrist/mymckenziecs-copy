-- Support matter-aware portal messaging, active client lookups,
-- and case-scoped document selection in the business inbox.

BEGIN;

-- Normalize legacy email casing so exact-match portal lookups remain reliable.
UPDATE public.client_business_links
SET client_email = lower(trim(client_email))
WHERE client_email IS NOT NULL
  AND client_email <> lower(trim(client_email));

UPDATE public.client_matters
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

UPDATE public.client_invitations
SET invited_email = lower(trim(invited_email))
WHERE invited_email IS NOT NULL
  AND invited_email <> lower(trim(invited_email));

UPDATE public.team_invitations
SET invited_email = lower(trim(invited_email))
WHERE invited_email IS NOT NULL
  AND invited_email <> lower(trim(invited_email));

UPDATE public.team_invitations
SET inviter_email = lower(trim(inviter_email))
WHERE inviter_email IS NOT NULL
  AND inviter_email <> lower(trim(inviter_email));

UPDATE public.inbox_messages
SET recipient_email = lower(trim(recipient_email))
WHERE recipient_email IS NOT NULL
  AND recipient_email <> lower(trim(recipient_email));

UPDATE public.inbox_messages
SET sender_email = lower(trim(sender_email))
WHERE sender_email IS NOT NULL
  AND sender_email <> lower(trim(sender_email));

-- Faster active client lookup for the Inbox compose picker.
CREATE INDEX IF NOT EXISTS idx_client_business_links_business_status_email
  ON public.client_business_links (business_id, status, client_email)
  WHERE client_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_business_links_business_status_updated
  ON public.client_business_links (business_id, status, updated_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_business_links_client_status
  ON public.client_business_links (client_id, status);

-- Faster matter selection after a client is chosen in Inbox compose.
CREATE INDEX IF NOT EXISTS idx_client_matters_business_email_activity
  ON public.client_matters (business_id, email, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_matters_business_email_case
  ON public.client_matters (business_id, email, case_id)
  WHERE case_id IS NOT NULL;

-- Faster case-scoped document loading for matter-aware attachments.
CREATE INDEX IF NOT EXISTS idx_documents_case_created_live
  ON public.documents (case_id, created_at DESC)
  WHERE deleted_at IS NULL
    AND case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by_case_created_live
  ON public.documents (uploaded_by, case_id, created_at DESC)
  WHERE deleted_at IS NULL
    AND case_id IS NOT NULL;

-- Faster sent-message lookups in the business inbox.
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender_email_created
  ON public.inbox_messages (sender_email, created_at DESC)
  WHERE sender_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender_id_created
  ON public.inbox_messages (sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;

COMMIT;

-- Additional indexes for high-volume plan checks and chat ownership lookups.

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active_status_updated_at_desc
  ON public.subscriptions (user_id, updated_at DESC)
  WHERE status IN ('active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_updated_at_desc
  ON public.subscriptions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_memory_user_conversation_updated_at_desc
  ON public.chat_memory (user_id, conversation_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_action_items_user_conversation_created_at_desc
  ON public.chat_action_items (user_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_case_timestamp_desc
  ON public.messages (conversation_id, case_id, "timestamp" DESC);

-- Support cursor-based chat history paging and stable thread ordering at higher scale.

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp_id_desc
  ON public.messages (conversation_id, "timestamp" DESC, id DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_case_timestamp_id_desc
  ON public.messages (case_id, "timestamp" DESC, id DESC)
  WHERE case_id IS NOT NULL;

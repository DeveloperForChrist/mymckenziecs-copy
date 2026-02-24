-- Preserve chatbot conversations when case profiles are deleted.
-- Convert chat-related case foreign keys from ON DELETE CASCADE to ON DELETE SET NULL.

ALTER TABLE public.messages
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.chat_memory
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.chat_action_items
  ALTER COLUMN case_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_case_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT messages_case_id_fkey;
  END IF;
END
$$;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_memory_case_id_fkey'
      AND conrelid = 'public.chat_memory'::regclass
  ) THEN
    ALTER TABLE public.chat_memory DROP CONSTRAINT chat_memory_case_id_fkey;
  END IF;
END
$$;

ALTER TABLE public.chat_memory
  ADD CONSTRAINT chat_memory_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_action_items_case_id_fkey'
      AND conrelid = 'public.chat_action_items'::regclass
  ) THEN
    ALTER TABLE public.chat_action_items DROP CONSTRAINT chat_action_items_case_id_fkey;
  END IF;
END
$$;

ALTER TABLE public.chat_action_items
  ADD CONSTRAINT chat_action_items_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases(id)
  ON DELETE SET NULL;

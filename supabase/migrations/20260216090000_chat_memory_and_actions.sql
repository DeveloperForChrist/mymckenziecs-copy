-- Durable chat memory + extracted action items for conversational continuity.

CREATE TABLE IF NOT EXISTS public.chat_memory (
  memory_key TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id UUID,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  conversation_id UUID,
  memory_summary TEXT,
  key_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_key TEXT REFERENCES chat_memory(memory_key) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id UUID,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  conversation_id UUID,
  title TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  source_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_user_case ON public.chat_memory(user_id, case_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_action_items_user_case ON public.chat_action_items(user_id, case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_action_items_status ON public.chat_action_items(status, created_at DESC);

ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_action_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_memory'
      AND policyname = 'chat_memory_service_role_all'
  ) THEN
    CREATE POLICY chat_memory_service_role_all
      ON public.chat_memory
      FOR ALL
      TO public
      USING (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      WITH CHECK (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_action_items'
      AND policyname = 'chat_action_items_service_role_all'
  ) THEN
    CREATE POLICY chat_action_items_service_role_all
      ON public.chat_action_items
      FOR ALL
      TO public
      USING (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      WITH CHECK (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.touch_chat_memory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_memory_touch_updated_at ON public.chat_memory;
CREATE TRIGGER trg_chat_memory_touch_updated_at
BEFORE UPDATE ON public.chat_memory
FOR EACH ROW
EXECUTE FUNCTION public.touch_chat_memory_updated_at();


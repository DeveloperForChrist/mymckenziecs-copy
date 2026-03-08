-- Fix mutable search_path on SECURITY DEFINER function used by chat memory writes.

CREATE OR REPLACE FUNCTION public.increment_chat_memory_turn_count(
  p_memory_key TEXT,
  p_user_id UUID,
  p_guest_id UUID,
  p_case_id UUID,
  p_conversation_id UUID,
  p_last_intent TEXT,
  p_memory_summary TEXT DEFAULT NULL,
  p_key_facts JSONB DEFAULT '[]'::jsonb,
  p_open_questions JSONB DEFAULT '[]'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_count INTEGER;
BEGIN
  INSERT INTO public.chat_memory (
    memory_key,
    user_id,
    guest_id,
    case_id,
    conversation_id,
    memory_summary,
    key_facts,
    open_questions,
    last_intent,
    user_turn_count
  )
  VALUES (
    p_memory_key,
    p_user_id,
    p_guest_id,
    p_case_id,
    p_conversation_id,
    p_memory_summary,
    COALESCE(p_key_facts, '[]'::jsonb),
    COALESCE(p_open_questions, '[]'::jsonb),
    p_last_intent,
    1
  )
  ON CONFLICT (memory_key)
  DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, public.chat_memory.user_id),
    guest_id = COALESCE(EXCLUDED.guest_id, public.chat_memory.guest_id),
    case_id = COALESCE(EXCLUDED.case_id, public.chat_memory.case_id),
    conversation_id = COALESCE(EXCLUDED.conversation_id, public.chat_memory.conversation_id),
    memory_summary = COALESCE(EXCLUDED.memory_summary, public.chat_memory.memory_summary),
    key_facts = CASE
      WHEN jsonb_typeof(EXCLUDED.key_facts) = 'array' AND jsonb_array_length(EXCLUDED.key_facts) > 0
        THEN EXCLUDED.key_facts
      ELSE public.chat_memory.key_facts
    END,
    open_questions = CASE
      WHEN jsonb_typeof(EXCLUDED.open_questions) = 'array' AND jsonb_array_length(EXCLUDED.open_questions) > 0
        THEN EXCLUDED.open_questions
      ELSE public.chat_memory.open_questions
    END,
    last_intent = COALESCE(EXCLUDED.last_intent, public.chat_memory.last_intent),
    user_turn_count = public.chat_memory.user_turn_count + 1
  RETURNING user_turn_count INTO v_next_count;

  RETURN v_next_count;
END;
$$;

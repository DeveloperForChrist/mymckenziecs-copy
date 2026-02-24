-- Replace role-claim based policies with explicit service_role policies.
-- This avoids depending on JWT role-claim checks in policy expressions.

-- guest_message_usage
DROP POLICY IF EXISTS guest_message_usage_service_role_all ON public.guest_message_usage;
CREATE POLICY guest_message_usage_service_role_all
  ON public.guest_message_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- chat_memory
DROP POLICY IF EXISTS chat_memory_service_role_all ON public.chat_memory;
CREATE POLICY chat_memory_service_role_all
  ON public.chat_memory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- chat_action_items
DROP POLICY IF EXISTS chat_action_items_service_role_all ON public.chat_action_items;
CREATE POLICY chat_action_items_service_role_all
  ON public.chat_action_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Migration: Allow NULL case_id for guest/anonymous users
-- Purpose: Guest users should be able to chat without a case ID

-- Make case_id nullable to support guest conversations
ALTER TABLE messages
ALTER COLUMN case_id DROP NOT NULL;

-- Update foreign key to properly handle cascade when case_id is NULL
ALTER TABLE messages
DROP CONSTRAINT messages_case_id_fkey,
ADD CONSTRAINT messages_case_id_fkey 
  FOREIGN KEY (case_id) 
  REFERENCES cases(id) 
  ON DELETE CASCADE;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS checklist_documents JSONB,
  ADD COLUMN IF NOT EXISTS checklist_procedural JSONB,
  ADD COLUMN IF NOT EXISTS checklist_actions JSONB,
  ADD COLUMN IF NOT EXISTS checklist_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checklist_auto_generated_at TIMESTAMPTZ;

-- Migration: Add document_analyses table
-- Run this in Supabase SQL Editor to add document analysis functionality

-- Create document_analyses table
CREATE TABLE IF NOT EXISTS document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id ON document_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_analyzed_at ON document_analyses(analyzed_at DESC);

-- Add storage_path column to documents if it doesn't exist
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add comment
COMMENT ON TABLE document_analyses IS 'Stores AI-generated analyses of uploaded documents';

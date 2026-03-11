-- Migration: Enable pgvector and create case_law table
-- Run this in Supabase SQL Editor first

-- Keep pgvector out of the public schema to satisfy Supabase advisor 0014.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector'
      AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'vector'
  ) THEN
    CREATE EXTENSION vector WITH SCHEMA extensions;
  END IF;
END
$$;

-- Create case_law table with vector support
CREATE TABLE IF NOT EXISTS case_law (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  extracts TEXT,
  case_type TEXT DEFAULT 'general',
  year INTEGER,
  court TEXT,
  outcome TEXT,
  embedding extensions.vector(1536),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_case_law_embedding ON case_law USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_case_law_citation ON case_law(citation);
CREATE INDEX IF NOT EXISTS idx_case_law_title ON case_law USING GIN(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_case_law_summary ON case_law USING GIN(to_tsvector('english', summary));

-- Create search history table
CREATE TABLE IF NOT EXISTS case_law_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results_count INTEGER,
  top_result_id UUID REFERENCES case_law(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_law_searches_user ON case_law_searches(user_id, created_at DESC);

-- Add comment
COMMENT ON TABLE case_law IS 'UK case law database with vector embeddings for similarity search';
COMMENT ON COLUMN case_law.embedding IS 'OpenAI embedding (1536 dimensions) for semantic similarity search';

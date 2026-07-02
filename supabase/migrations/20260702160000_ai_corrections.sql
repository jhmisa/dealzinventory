-- AI training memory: curated corrections the messaging AI retrieves semantically and applies to
-- similar future questions. 384-dim embeddings from Supabase's built-in gte-small model.
-- See docs/superpowers/plans/2026-07-02-ai-training-memory-backend.md
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_corrections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_message        text NOT NULL,
  wrong_reply             text,
  correct_reply           text NOT NULL,
  note                    text,
  specialist_slug         text,
  sub_intent_slug         text,
  status                  text NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | PROMOTED | REJECTED
  embedding               vector(384),
  source_conversation_id  uuid,
  source_message_id       uuid,
  promoted_knowledge_id   uuid REFERENCES knowledge_base(id) ON DELETE SET NULL,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_corrections_status ON ai_corrections(status, specialist_slug);
CREATE INDEX idx_ai_corrections_embedding ON ai_corrections USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER trg_ai_corrections_updated
  BEFORE UPDATE ON ai_corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON ai_corrections FOR ALL USING (auth.role() = 'authenticated');
GRANT ALL ON public.ai_corrections TO anon, authenticated, service_role;

-- Semantic match over APPROVED/PROMOTED corrections, optionally scoped to a specialist.
CREATE OR REPLACE FUNCTION match_ai_corrections(
  query_embedding vector(384),
  filter_specialist text DEFAULT NULL,
  match_count int DEFAULT 3,
  min_similarity float DEFAULT 0.55
)
RETURNS TABLE (
  id uuid,
  customer_message text,
  correct_reply text,
  note text,
  specialist_slug text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.customer_message, c.correct_reply, c.note, c.specialist_slug,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM ai_corrections c
  WHERE c.status IN ('APPROVED', 'PROMOTED')
    AND c.embedding IS NOT NULL
    AND (filter_specialist IS NULL OR c.specialist_slug = filter_specialist)
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_ai_corrections(vector, text, int, float) TO anon, authenticated, service_role;

-- System Feedback Board (internal staff bug reports & feature requests)

-- Enums
CREATE TYPE system_feedback_type AS ENUM ('BUG', 'FEATURE_REQUEST');
CREATE TYPE system_feedback_status AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- Sequence for SF codes
CREATE SEQUENCE sf_code_seq START 1;

-- Generate SF code function
CREATE OR REPLACE FUNCTION generate_sf_code()
RETURNS text AS $$
BEGIN
  RETURN 'SF' || LPAD(nextval('sf_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Main table
CREATE TABLE system_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_code text UNIQUE NOT NULL DEFAULT generate_sf_code(),
  title text NOT NULL,
  description text,
  type system_feedback_type NOT NULL DEFAULT 'BUG',
  status system_feedback_status NOT NULL DEFAULT 'OPEN',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Media table
CREATE TABLE system_feedback_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES system_feedback(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_system_feedback_status ON system_feedback(status);
CREATE INDEX idx_system_feedback_created_by ON system_feedback(created_by);
CREATE INDEX idx_system_feedback_media_feedback_id ON system_feedback_media(feedback_id);

-- Updated_at trigger
CREATE TRIGGER set_system_feedback_updated_at
  BEFORE UPDATE ON system_feedback
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- RLS
ALTER TABLE system_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_feedback_media ENABLE ROW LEVEL SECURITY;

-- Staff can do everything
CREATE POLICY "Staff full access on system_feedback"
  ON system_feedback FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Staff full access on system_feedback_media"
  ON system_feedback_media FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('system-feedback-media', 'system-feedback-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: only authenticated users
CREATE POLICY "Staff can upload feedback media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'system-feedback-media');

CREATE POLICY "Staff can read feedback media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'system-feedback-media');

CREATE POLICY "Staff can delete feedback media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'system-feedback-media');

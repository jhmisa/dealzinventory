-- Add attachments column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Add attachments column to messaging_templates table
ALTER TABLE messaging_templates ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create messaging-attachments storage bucket (private, staff-only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('messaging-attachments', 'messaging-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to messaging-attachments
CREATE POLICY "Staff can upload messaging attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'messaging-attachments');

-- RLS: authenticated users can read messaging-attachments
CREATE POLICY "Staff can read messaging attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'messaging-attachments');

-- RLS: authenticated users can delete their own messaging-attachments
CREATE POLICY "Staff can delete messaging attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'messaging-attachments');

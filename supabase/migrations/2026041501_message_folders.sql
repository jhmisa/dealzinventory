-- Message folders for pipeline stages
CREATE TABLE message_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'folder',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add folder_id to conversations
ALTER TABLE conversations
  ADD COLUMN folder_id uuid REFERENCES message_folders(id) ON DELETE SET NULL;

-- Add avatar_url to conversations (customer/contact photo from Missive)
ALTER TABLE conversations
  ADD COLUMN contact_avatar_url text;

-- Add avatar_url to staff_profiles
ALTER TABLE staff_profiles
  ADD COLUMN avatar_url text;

-- Index for filtering conversations by folder
CREATE INDEX idx_conversations_folder ON conversations(folder_id);

-- RLS for message_folders (staff only, same pattern as other messaging tables)
ALTER TABLE message_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read message folders"
  ON message_folders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage message folders"
  ON message_folders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed default folders
INSERT INTO message_folders (name, icon, sort_order, is_system) VALUES
  ('Inbox', 'inbox', 0, true);

INSERT INTO message_folders (name, icon, sort_order, is_system) VALUES
  ('Inquiry', 'message-square', 1, false),
  ('Prospects', 'target', 2, false),
  ('Order', 'shopping-cart', 3, false),
  ('Aftersales', 'package', 4, false),
  ('Concern', 'alert-triangle', 5, false),
  ('Technical', 'wrench', 6, false);

-- Set all existing conversations to Inbox
UPDATE conversations SET folder_id = (
  SELECT id FROM message_folders WHERE name = 'Inbox' LIMIT 1
);

-- Add realtime for message_folders
ALTER PUBLICATION supabase_realtime ADD TABLE message_folders;

-- Updated_at trigger for message_folders
CREATE TRIGGER set_message_folders_updated_at
  BEFORE UPDATE ON message_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

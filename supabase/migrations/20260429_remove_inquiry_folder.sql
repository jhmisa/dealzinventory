-- Move any conversations in the Inquiry folder to Inbox, then delete Inquiry
DO $$
DECLARE
  v_inbox_id uuid;
  v_inquiry_id uuid;
BEGIN
  SELECT id INTO v_inbox_id FROM message_folders WHERE name = 'Inbox' LIMIT 1;
  SELECT id INTO v_inquiry_id FROM message_folders WHERE name = 'Inquiry' LIMIT 1;

  IF v_inquiry_id IS NOT NULL AND v_inbox_id IS NOT NULL THEN
    UPDATE conversations SET folder_id = v_inbox_id WHERE folder_id = v_inquiry_id;
    DELETE FROM message_folders WHERE id = v_inquiry_id;
  END IF;
END $$;

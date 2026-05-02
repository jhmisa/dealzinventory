-- Fix unarchive trigger: preserve existing folder_id instead of defaulting to Inbox.
-- Previously, when a conversation was unarchived (e.g. customer sends a new message),
-- the trigger would reset folder_id to Inbox even if the conversation already had a
-- folder assigned (e.g. Prospects). Now it only defaults to Inbox if folder_id is NULL.
CREATE OR REPLACE FUNCTION unarchive_to_inbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_archived = true AND NEW.is_archived = false THEN
    -- Only default to Inbox if the conversation has no folder assigned
    IF NEW.folder_id IS NOT DISTINCT FROM OLD.folder_id AND NEW.folder_id IS NULL THEN
      NEW.folder_id := (SELECT id FROM message_folders WHERE name = 'Inbox' LIMIT 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

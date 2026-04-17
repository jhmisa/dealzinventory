-- Update unarchive_to_inbox trigger so that an explicit folder_id chosen by
-- the caller in the same UPDATE is respected. Previously the trigger always
-- overrode folder_id with Inbox whenever is_archived flipped true -> false,
-- which broke "move from Archive to <other folder>" flows.
CREATE OR REPLACE FUNCTION unarchive_to_inbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_archived = true AND NEW.is_archived = false THEN
    -- Only default to Inbox if the caller didn't explicitly choose a folder
    IF NEW.folder_id IS NOT DISTINCT FROM OLD.folder_id THEN
      NEW.folder_id := (SELECT id FROM message_folders WHERE name = 'Inbox' LIMIT 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

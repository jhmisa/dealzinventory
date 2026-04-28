-- ============================================================
-- Migrate existing return_requests → tickets (type=RETURN)
-- ============================================================

-- 1. Add migrated_ticket_id column to return_requests for redirect lookups
ALTER TABLE return_requests ADD COLUMN migrated_ticket_id uuid REFERENCES tickets(id);

-- 2. Migrate return_requests → tickets
DO $$
DECLARE
  ret RECORD;
  return_type_id uuid;
  new_ticket_id uuid;
  new_ticket_code text;
  mapped_status ticket_status;
  mapped_priority ticket_priority;
  return_items jsonb;
BEGIN
  -- Get the RETURN ticket type id
  SELECT id INTO return_type_id FROM ticket_types WHERE name = 'RETURN';

  FOR ret IN SELECT * FROM return_requests ORDER BY created_at ASC
  LOOP
    -- Generate ticket code
    SELECT generate_code('TK', 'tk_code_seq') INTO new_ticket_code;

    -- Map return status → ticket status
    CASE ret.return_status
      WHEN 'SUBMITTED' THEN mapped_status := 'OPEN';
      WHEN 'APPROVED' THEN mapped_status := 'IN_PROGRESS';
      WHEN 'SHIPPED_BACK' THEN mapped_status := 'IN_PROGRESS';
      WHEN 'RECEIVED' THEN mapped_status := 'IN_PROGRESS';
      WHEN 'INSPECTING' THEN mapped_status := 'IN_PROGRESS';
      WHEN 'RESOLVED' THEN mapped_status := 'RESOLVED';
      WHEN 'REJECTED' THEN mapped_status := 'RESOLVED';
      WHEN 'CANCELLED' THEN mapped_status := 'CANCELLED';
      ELSE mapped_status := 'OPEN';
    END CASE;

    mapped_priority := 'NORMAL';

    -- Build return_data JSONB from return_request_items
    SELECT jsonb_build_object(
      'reason_category', ret.reason_category,
      'resolution_type', ret.resolution,
      'refund_amount', ret.refund_amount,
      'original_return_status', ret.return_status,
      'items', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'order_item_id', ri.order_item_id,
          'item_id', ri.item_id,
          'reason_note', ri.reason_note
        ))
        FROM return_request_items ri
        WHERE ri.return_request_id = ret.id),
        '[]'::jsonb
      )
    ) INTO return_items;

    -- Insert ticket
    INSERT INTO tickets (
      id, ticket_code, ticket_type_id, ticket_status, priority,
      customer_id, order_id, subject, description,
      resolution_notes, created_by_role, return_data,
      created_at, updated_at, resolved_at
    ) VALUES (
      gen_random_uuid(), new_ticket_code, return_type_id, mapped_status, mapped_priority,
      ret.customer_id, ret.order_id,
      'Return: ' || COALESCE(ret.reason_category, 'Unknown'),
      COALESCE(ret.customer_description, ''),
      ret.resolution_notes, 'customer', return_items,
      ret.created_at, ret.updated_at,
      CASE WHEN mapped_status IN ('RESOLVED', 'CANCELLED') THEN COALESCE(ret.resolved_at, ret.updated_at) ELSE NULL END
    )
    RETURNING id INTO new_ticket_id;

    -- Update return_requests with migrated ticket id
    UPDATE return_requests SET migrated_ticket_id = new_ticket_id WHERE id = ret.id;

    -- Migrate staff notes as ticket_note
    IF ret.staff_notes IS NOT NULL AND ret.staff_notes != '' THEN
      INSERT INTO ticket_notes (ticket_id, content, note_type, created_at)
      VALUES (new_ticket_id, ret.staff_notes, 'note', ret.updated_at);
    END IF;
  END LOOP;
END $$;

-- 3. Migrate return_request_media → ticket_media (reference original URLs)
INSERT INTO ticket_media (ticket_id, file_url, media_type, sort_order, uploaded_at)
SELECT
  rr.migrated_ticket_id,
  rrm.file_url,
  rrm.media_type,
  COALESCE(rrm.sort_order, 0),
  rrm.uploaded_at
FROM return_request_media rrm
JOIN return_requests rr ON rr.id = rrm.return_request_id
WHERE rr.migrated_ticket_id IS NOT NULL;

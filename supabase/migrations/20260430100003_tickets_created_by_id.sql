-- Add created_by_id to track which staff/customer created the ticket
ALTER TABLE tickets ADD COLUMN created_by_id uuid;

-- Backfill: for staff-created tickets, try to set created_by_id from assigned_staff_id
UPDATE tickets SET created_by_id = assigned_staff_id WHERE created_by_role = 'staff' AND assigned_staff_id IS NOT NULL;

-- For customer-created tickets, set from customer's auth user if available
UPDATE tickets SET created_by_id = customer_id WHERE created_by_role = 'customer' AND customer_id IS NOT NULL;

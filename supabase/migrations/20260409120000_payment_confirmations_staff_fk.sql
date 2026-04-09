-- Fix: add FK from payment_confirmations.confirmed_by to staff_profiles(id)
-- so PostgREST can resolve the embedded `staff_profiles!confirmed_by(display_name)` join
-- used in getPaymentConfirmations(). Without this, the SELECT silently fails and
-- uploaded payment confirmations never appear in the UI (even though they are inserted).
--
-- staff_profiles.id is itself a 1:1 FK to auth.users(id), so every staff auth user
-- has a matching staff_profiles row — this additional FK is consistent with the
-- existing auth.users(id) FK.

ALTER TABLE payment_confirmations
  ADD CONSTRAINT payment_confirmations_confirmed_by_staff_fkey
  FOREIGN KEY (confirmed_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

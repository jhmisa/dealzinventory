-- Enable pgcrypto if not already enabled
create extension if not exists pgcrypto schema extensions;

-- Hash a PIN using bcrypt via pgcrypto
create or replace function _hash_pin(pin_text text)
returns text
language sql
security definer
as $$
  select extensions.crypt(pin_text, extensions.gen_salt('bf'));
$$;

-- Verify a PIN against a bcrypt hash
create or replace function _verify_pin(pin_text text, pin_hash text)
returns boolean
language sql
security definer
as $$
  select extensions.crypt(pin_text, pin_hash) = pin_hash;
$$;

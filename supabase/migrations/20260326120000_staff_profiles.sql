-- Migration: Staff Profiles
-- Creates staff_role enum and staff_profiles table for managing staff accounts and roles.

-- 1. Create staff_role enum
CREATE TYPE staff_role AS ENUM ('ADMIN', 'VA', 'IT', 'LIVE_SELLER');

-- 2. Create staff_profiles table
CREATE TABLE staff_profiles (
    id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email        text        NOT NULL,
    display_name text        NOT NULL,
    role         staff_role  NOT NULL DEFAULT 'VA',
    is_active    boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Unique constraint on email
ALTER TABLE staff_profiles
    ADD CONSTRAINT staff_profiles_email_key UNIQUE (email);

-- 4. Index on role for filtering
CREATE INDEX staff_profiles_role_idx ON staff_profiles (role);

-- 5. Trigger to keep updated_at current (uses existing update_updated_at() function)
CREATE TRIGGER set_staff_profiles_updated_at
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 6. Enable RLS
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view all staff profiles
CREATE POLICY "Staff profiles are viewable by all authenticated users"
    ON staff_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Users can insert their own profile (self-registration)
CREATE POLICY "Users can insert their own profile"
    ON staff_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile (e.g. display_name)
CREATE POLICY "Users can update their own display_name"
    ON staff_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Admins can update any profile (role changes, deactivation, etc.)
CREATE POLICY "Admins can update any profile"
    ON staff_profiles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM staff_profiles
            WHERE id = auth.uid()
              AND role = 'ADMIN'
        )
    );

-- Policy: Admins can insert any profile (creating accounts on behalf of staff)
CREATE POLICY "Admins can insert any profile"
    ON staff_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM staff_profiles
            WHERE id = auth.uid()
              AND role = 'ADMIN'
        )
    );

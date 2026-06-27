-- Phase 1 fix: make part_number a real UNIQUE constraint on iosys_catalog so it can be
-- an ON CONFLICT target for both raw SQL upserts and supabase-js .upsert({onConflict}).
-- A partial unique index (WHERE part_number IS NOT NULL) cannot be used without repeating
-- its predicate, which supabase-js can't express. Plain UNIQUE allows multiple NULLs
-- (Postgres treats NULLs as distinct) and enforces uniqueness on non-null part numbers.

DROP INDEX IF EXISTS public.uq_iosys_catalog_part_number;

ALTER TABLE public.iosys_catalog
  ADD CONSTRAINT iosys_catalog_part_number_key UNIQUE (part_number);

-- Drop the created_by FK constraint — system user and API tokens don't exist in auth.users
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS fk_je_created_by;

-- Allow getting all terms for the history dropdown
-- This function runs with SECURITY DEFINER => bypasses RLS
-- This allows any authenticated user to see the list of academic terms that exist in the system,
-- even if they don't have a checklist for that term yet.

CREATE OR REPLACE FUNCTION get_all_terms()
RETURNS TABLE (term_id TEXT) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT term_id FROM public.checklists ORDER BY term_id DESC;
$$;

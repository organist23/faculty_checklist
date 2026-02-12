-- ==========================================
-- SUPABASE SECURITY FINAL CLEANUP
-- Resolves: Search Path Warnings & Permissive RLS
-- ==========================================

-- 1. Fix Search Path for internal functions (Security Best Practice)
-- This tells the functions exactly where to look for tables, preventing hijacking.
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.get_all_terms() SET search_path = public;

-- 2. Fix Permissive Profile Policy (v4_insert_profiles_web)
-- The linter warned that anyone could insert any profile.
-- We restrict it so users can ONLY create a profile with their own Auth ID.
DROP POLICY IF EXISTS "v4_insert_profiles_web" ON public.faculty_profiles;
CREATE POLICY "v4_insert_profiles_web" 
ON public.faculty_profiles 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- 3. Double Check: Ensure RLS is actually enforced
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- NOTE: The "Leaked Password Protection" warning must be fixed in the 
-- Supabase Dashboard UI under: Authentication -> Settings -> Password Protection.

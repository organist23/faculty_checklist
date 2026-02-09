-- FIX RLS RECURSION using Security Definer Function

-- 1. Create a secure function to check admin status
-- SECURITY DEFINER means it runs with permissions of the creator (postgres/admin), bypassing RLS on the tables it queries.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Policies to use the function (No more recursion!)

-- SYSTEM SETTINGS
DROP POLICY IF EXISTS "Admin Update Access" ON public.system_settings;
CREATE POLICY "Admin Update Access" ON public.system_settings FOR UPDATE 
USING ( public.is_admin() );

-- FACULTY PROFILES
-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.faculty_profiles;

-- Create non-recursive policies
CREATE POLICY "Admins can insert profiles" ON public.faculty_profiles FOR INSERT 
WITH CHECK ( public.is_admin() );

CREATE POLICY "Admins can update profiles" ON public.faculty_profiles FOR UPDATE 
USING ( public.is_admin() );

CREATE POLICY "Admins can delete profiles" ON public.faculty_profiles FOR DELETE 
USING ( public.is_admin() );

-- CHECKLISTS
DROP POLICY IF EXISTS "Admins can do everything on checklists" ON public.checklists;
DROP POLICY IF EXISTS "Admins can see all checklists" ON public.checklists;
DROP POLICY IF EXISTS "Admins can approve checklists" ON public.checklists;

CREATE POLICY "Admins can do everything on checklists" ON public.checklists FOR ALL 
USING ( public.is_admin() );

-- STORAGE (If possible to update storage policies via SQL here, usually requires Supabase dashboard, but we can try)
-- Note: Storage policies are on storage.objects, which might not be accessible blindly. 
-- But usually 'public.is_admin()' works if the function is public.

-- Verify the function works
SELECT public.is_admin();

-- CRITICAL FIX FOR ADMIN PERMISSIONS & RLS RECURSION
-- Run this in the Supabase SQL Editor

-- 1. Create a secure function to check admin status
-- SECURITY DEFINER means it runs with permissions of the creator (postgres/admin), bypassing RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Policies to use the function (Fixes recursion and permission errors)

-- SYSTEM SETTINGS (Allows Admin to update semester)
DROP POLICY IF EXISTS "Admin Update Access" ON public.system_settings;
CREATE POLICY "Admin Update Access" ON public.system_settings FOR UPDATE 
USING ( public.is_admin() );

-- FACULTY PROFILES (Allows Admin to manage users)
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.faculty_profiles;
CREATE POLICY "Admins can insert profiles" ON public.faculty_profiles FOR INSERT WITH CHECK ( public.is_admin() );
CREATE POLICY "Admins can update profiles" ON public.faculty_profiles FOR UPDATE USING ( public.is_admin() );
CREATE POLICY "Admins can delete profiles" ON public.faculty_profiles FOR DELETE USING ( public.is_admin() );

-- CHECKLISTS (Allows Admin to manage checklists)
DROP POLICY IF EXISTS "Admins can do everything on checklists" ON public.checklists;
CREATE POLICY "Admins can do everything on checklists" ON public.checklists FOR ALL 
USING ( public.is_admin() );

-- 3. STORAGE PERMISSION FIX
-- We need to ensure Admins can delete old files for archiving
DROP POLICY IF EXISTS "Admins can delete any file" ON storage.objects;
CREATE POLICY "Admins can delete any file"
ON storage.objects FOR DELETE TO authenticated
USING ( public.is_admin() );

-- Enable RLS just in case
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

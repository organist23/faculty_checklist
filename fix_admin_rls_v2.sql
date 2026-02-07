-- RLS FIX: USE THE PROFILES TABLE FOR ROLE CHECK
-- This is more reliable than JWT metadata which might be missing.

-- 1. Enable RLS on checklists (just in case)
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- 2. Allow Admins to manage all checklists
-- This policy joins with faculty_profiles to check the role
DROP POLICY IF EXISTS "Admins can do everything on checklists" ON public.checklists;

CREATE POLICY "Admins can do everything on checklists" 
ON public.checklists 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE public.faculty_profiles.id = auth.uid()
    AND public.faculty_profiles.role = 'admin'
  )
);

-- 3. Allow Faculty to manage their own
DROP POLICY IF EXISTS "Faculty can view own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Faculty can update own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Faculty can insert own checklists" ON public.checklists;

CREATE POLICY "Faculty can view own checklists" 
ON public.checklists FOR SELECT 
USING ( auth.uid() = faculty_id );

CREATE POLICY "Faculty can update own checklists" 
ON public.checklists FOR UPDATE 
USING ( auth.uid() = faculty_id );

CREATE POLICY "Faculty can insert own checklists" 
ON public.checklists FOR INSERT 
WITH CHECK ( auth.uid() = faculty_id );

-- 4. STORAGE POLICY FIX (Must allow Admins to delete from Storage too!)
-- Run this in your Supabase Dashboard as well
-- (Assuming your bucket is named 'checklists')
DROP POLICY IF EXISTS "Admins can delete any file" ON storage.objects;
CREATE POLICY "Admins can delete any file"
ON storage.objects FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE public.faculty_profiles.id = auth.uid()
    AND public.faculty_profiles.role = 'admin'
  )
);

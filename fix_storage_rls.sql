-- ==========================================
-- FIX: Supabase Storage RLS Policies
-- Run this in the Supabase SQL Editor
-- ==========================================

-- 1. Enable RLS on storage.objects (just in case)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Clean up old policies to avoid conflicts
DROP POLICY IF EXISTS "Faculty Upload Own Folder" ON storage.objects;
DROP POLICY IF EXISTS "Faculty View Own Folder" ON storage.objects;
DROP POLICY IF EXISTS "Faculty Update Own Folder" ON storage.objects;
DROP POLICY IF EXISTS "Faculty Delete Own Folder" ON storage.objects;
DROP POLICY IF EXISTS "Admin View All" ON storage.objects;
DROP POLICY IF EXISTS "Global Access" ON storage.objects; -- Drop any previous desperate attempts

-- 3. INSERT (Upload): Allow user to upload ONLY to a folder matching their User ID
CREATE POLICY "Faculty Upload Own Folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'checklists' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. SELECT (View): Allow user to view ONLY their own folder
CREATE POLICY "Faculty View Own Folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklists' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. UPDATE: Allow user to update their own files
CREATE POLICY "Faculty Update Own Folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checklists' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. DELETE: Allow user to delete their own files
CREATE POLICY "Faculty Delete Own Folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'checklists' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 7. SELECT (View): Allow Admins to see EVERYTHING in the checklists bucket
--    (Assuming you have a 'faculty_profiles' table with a 'role' column)
CREATE POLICY "Admin View All"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklists' AND
  EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 1. EXTENSIONS

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. SYSTEM SETTINGS (Global Configuration)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    current_semester TEXT NOT NULL DEFAULT '1',
    current_academic_year TEXT NOT NULL DEFAULT '2025-2026',
    deadline TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default settings if not exists
INSERT INTO public.system_settings (current_semester, current_academic_year)
SELECT '1', '2025-2026'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- 3. FACULTY PROFILES (Metadata for auth.users)
CREATE TABLE IF NOT EXISTS public.faculty_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'faculty')),
    college TEXT DEFAULT 'CTED',
    department TEXT,
    default_subjects JSONB DEFAULT '[]', -- List of subject names
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. CHECKLISTS (Semester Snapshots)
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID REFERENCES public.faculty_profiles(id) ON DELETE CASCADE,
    term_id TEXT NOT NULL, -- Format: '2025-2026-SEM1'
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revision')),
    subjects JSONB DEFAULT '[]', -- Snapshot of subjects [{name, status, docs: [...]}]
    other_docs JSONB DEFAULT '[]', -- Snapshot of other docs [{name, status, docs: [...]}]
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    action_log JSONB DEFAULT '[]', -- [{action, by, at}] for transparency
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(faculty_id, term_id)
);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- System Settings Policies
CREATE POLICY "Public Read Access" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admin Update Access" ON public.system_settings FOR UPDATE USING (
  (SELECT role FROM public.faculty_profiles WHERE id = auth.uid()) = 'admin'
);

-- Faculty Profiles Policies
CREATE POLICY "Users can view all admin/colleague names" ON public.faculty_profiles FOR SELECT USING (true);
CREATE POLICY "Admins can manage profiles" ON public.faculty_profiles FOR ALL USING (
  (SELECT role FROM public.faculty_profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Users can update own profile" ON public.faculty_profiles FOR UPDATE USING (auth.uid() = id);

-- Checklists Policies
CREATE POLICY "Admins can see all checklists" ON public.checklists FOR SELECT USING (
  (SELECT role FROM public.faculty_profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Faculty can see/manage own checklists" ON public.checklists FOR ALL USING (auth.uid() = faculty_id);
CREATE POLICY "Admins can approve checklists" ON public.checklists FOR UPDATE USING (
  (SELECT role FROM public.faculty_profiles WHERE id = auth.uid()) = 'admin'
);

-- 6. STORAGE SETUP
-- Run this to create the bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('checklists', 'checklists', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Authenticated users can upload to their own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'checklists' AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Admins can see everything, users see their own"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'checklists' AND (
      (SELECT role FROM public.faculty_profiles WHERE id = auth.uid()) = 'admin' OR
      (storage.foldername(name))[2] = auth.uid()::text
    )
);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'checklists' AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 7. HELPERS
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.faculty_profiles (id, name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'name', new.email, COALESCE(new.raw_user_meta_data->>'role', 'faculty'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup (optional, if using Supabase Auth UI/Signup)
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

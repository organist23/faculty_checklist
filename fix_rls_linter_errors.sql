-- Enable RLS on tables identified by the Supabase linter
-- Tables: public.checklists, public.faculty_profiles, public.system_settings

-- 1. Enable RLS on checklists
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on faculty_profiles
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Verification query (can be run manually):
-- SELECT tablename, rls_enabled FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('checklists', 'faculty_profiles', 'system_settings');

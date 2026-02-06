-- 1. DROP RECURSIVE POLICIES
DROP POLICY IF EXISTS "Profiles are viewable by owner and admin" ON public.faculty_profiles;

-- 2. CREATE FIXED POLICIES (Using auth.jwt() to avoid recursion)
-- This allows anyone to read profiles (needed for login/context)
-- But only owners or admins can modify their metadata
CREATE POLICY "Public Profiles are readable" 
ON public.faculty_profiles FOR SELECT 
USING (true);

CREATE POLICY "Admins can update all profiles" 
ON public.faculty_profiles FOR UPDATE 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

CREATE POLICY "Faculty can update own basic metadata" 
ON public.faculty_profiles FOR UPDATE 
USING (
  auth.uid() = id
);

-- 3. ENSURE TRIGGER IS ACTIVE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    END IF;
END $$;

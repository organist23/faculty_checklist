-- 1. Allow Admins to ALL (Select, Insert, Update, Delete) on CHECKLISTS
DROP POLICY IF EXISTS "Admins can do everything on checklists" ON public.checklists;

CREATE POLICY "Admins can do everything on checklists" 
ON public.checklists 
FOR ALL 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 2. Allow Faculty to VIEW and UPDATE their OWN checklists
-- (Assuming they already have policies, but let's reinforce)
DROP POLICY IF EXISTS "Faculty can view own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Faculty can update own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Faculty can insert own checklists" ON public.checklists;

CREATE POLICY "Faculty can view own checklists" 
ON public.checklists FOR SELECT 
USING (
  auth.uid() = faculty_id
);

CREATE POLICY "Faculty can update own checklists" 
ON public.checklists FOR UPDATE 
USING (
  auth.uid() = faculty_id
);

CREATE POLICY "Faculty can insert own checklists" 
ON public.checklists FOR INSERT 
WITH CHECK (
  auth.uid() = faculty_id
);

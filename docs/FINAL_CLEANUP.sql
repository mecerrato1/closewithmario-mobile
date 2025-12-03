-- ============================================
-- FINAL CLEANUP: Remove last dangerous policy
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================

-- Remove the last dangerous policy that allows anon users to read leads
DROP POLICY IF EXISTS "anon_select_recent_form_leads" ON leads;

-- Verify ALL dangerous policies are gone
SELECT 
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN roles = '{authenticated}' THEN 'authenticated'
    WHEN roles = '{public}' THEN 'public'
    WHEN roles = '{anon}' THEN 'anon'
    WHEN roles = '{service_role}' THEN 'service_role'
    ELSE roles::text
  END as applies_to
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'meta_ads')
ORDER BY tablename, policyname;

-- This should now show ONLY the secure role-based policies:
-- For leads:
--   - Admins can read all leads
--   - Admins can update leads
--   - Admins can delete leads
--   - Loan officers can read their leads
--   - Loan officers can update their leads
--   - Realtors can read their leads
--   - Realtors can update their leads
--   - Public can submit leads
--
-- For meta_ads:
--   - Admins can read all meta_ads
--   - Admins can update meta_ads
--   - Admins can delete meta_ads
--   - Loan officers can read their meta_ads
--   - Loan officers can update their meta_ads
--   - Realtors can read their meta_ads
--   - Realtors can update their meta_ads
--   - Service role can insert meta_ads

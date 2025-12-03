-- List all RLS policies on leads and meta_ads tables
-- Run this in: Supabase Dashboard → SQL Editor

-- Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'meta_ads')
ORDER BY tablename;

-- List all policies on leads table
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN roles = '{authenticated}' THEN 'authenticated'
    WHEN roles = '{public}' THEN 'public'
    WHEN roles = '{service_role}' THEN 'service_role'
    ELSE roles::text
  END as applies_to
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'leads'
ORDER BY policyname;

-- List all policies on meta_ads table
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN roles = '{authenticated}' THEN 'authenticated'
    WHEN roles = '{public}' THEN 'public'
    WHEN roles = '{service_role}' THEN 'service_role'
    ELSE roles::text
  END as applies_to
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'meta_ads'
ORDER BY policyname;

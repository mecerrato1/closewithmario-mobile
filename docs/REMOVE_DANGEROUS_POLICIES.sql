-- ============================================
-- REMOVE DANGEROUS TESTING POLICIES
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================
-- These policies allow ALL authenticated users to read leads/meta_ads
-- They were likely created for testing and never removed
-- ============================================

-- Remove dangerous policies from meta_ads table
DROP POLICY IF EXISTS "Allow anon read for testing" ON meta_ads;
DROP POLICY IF EXISTS "Allow authenticated users to read" ON meta_ads;
DROP POLICY IF EXISTS "read for authenticated" ON meta_ads;
DROP POLICY IF EXISTS "Allow authenticated users to update meta_ads" ON meta_ads;
DROP POLICY IF EXISTS "Allow service role full access" ON meta_ads;
DROP POLICY IF EXISTS "admins can read meta_ads" ON meta_ads;

-- Remove dangerous policies from leads table (check if they exist there too)
DROP POLICY IF EXISTS "Allow anon read for testing" ON leads;
DROP POLICY IF EXISTS "Allow authenticated users to read" ON leads;
DROP POLICY IF EXISTS "read for authenticated" ON leads;
DROP POLICY IF EXISTS "Allow authenticated users to update leads" ON leads;
DROP POLICY IF EXISTS "Allow service role full access" ON leads;
DROP POLICY IF EXISTS "admins can read leads" ON leads;

-- Verify the dangerous policies are gone
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'meta_ads')
  AND (
    policyname ILIKE '%anon%' 
    OR policyname ILIKE '%testing%'
    OR policyname = 'Allow authenticated users to read'
    OR policyname = 'read for authenticated'
    OR policyname = 'Allow service role full access'
  )
ORDER BY tablename, policyname;

-- This should return NO ROWS if cleanup was successful

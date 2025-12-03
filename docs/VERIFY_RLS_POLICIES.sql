-- Verify that RLS policies were created correctly
-- Run this in: Supabase Dashboard → SQL Editor

-- Check if RLS is enabled on leads table
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('leads', 'meta_ads', 'lead_activities', 'meta_ad_activities');

-- List all policies on leads table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'leads'
ORDER BY policyname;

-- List all policies on meta_ads table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'meta_ads'
ORDER BY policyname;

-- Test: What can the current user see?
-- This will show how many leads the authenticated user can access
SELECT COUNT(*) as accessible_leads_count FROM leads;
SELECT COUNT(*) as accessible_meta_ads_count FROM meta_ads;

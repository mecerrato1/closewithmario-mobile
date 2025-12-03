-- ============================================
-- REMOVE ALL GENERIC "authenticated" POLICIES
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================
-- These policies allow ANY authenticated user to access ALL leads
-- They must be removed to enforce role-based access control
-- ============================================

-- Remove ALL generic authenticated policies from leads table
DROP POLICY IF EXISTS "Users can delete leads" ON leads;
DROP POLICY IF EXISTS "Users can read leads" ON leads;
DROP POLICY IF EXISTS "Users can update leads" ON leads;
DROP POLICY IF EXISTS "authenticated_delete_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_select_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_update_leads" ON leads;
DROP POLICY IF EXISTS "public_insert_leads" ON leads;
DROP POLICY IF EXISTS "Public and LOs can insert leads" ON leads;

-- Keep only ONE public insert policy (the properly named one)
-- The others are duplicates

-- Verify only secure role-based policies remain
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'leads'
  AND policyname NOT IN (
    -- These are the GOOD policies we want to keep:
    'Admins can delete leads',
    'Admins can read all leads',
    'Admins can update leads',
    'Loan officers can read their leads',
    'Loan officers can update their leads',
    'Realtors can read their leads',
    'Realtors can update their leads',
    'Public can submit leads'
  )
ORDER BY policyname;

-- This should return NO ROWS if cleanup was successful
-- If it returns rows, those are additional policies that need to be removed

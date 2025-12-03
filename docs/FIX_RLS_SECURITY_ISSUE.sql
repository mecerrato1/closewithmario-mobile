-- ============================================
-- CRITICAL SECURITY FIX: Proper RLS Policies for Leads and Meta Ads
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================
-- This fixes the security vulnerability where new authenticated users
-- can access all leads because there's no restrictive RLS policy.
--
-- The issue: The current policies only allow specific admin emails,
-- but don't explicitly DENY other authenticated users. In Supabase,
-- if no policy matches, authenticated users are blocked by default,
-- BUT if you have ANY policy that allows authenticated access without
-- proper filtering, it creates a security hole.
--
-- The fix: Implement role-based RLS policies that check:
-- 1. Super admins and admins can see all leads
-- 2. Loan officers can only see their assigned leads (lo_id = their ID)
-- 3. Realtors can only see their assigned leads (realtor_id = their ID)
-- 4. All other users (buyers) cannot see any leads
-- ============================================

-- ============================================
-- LEADS TABLE POLICIES
-- ============================================

-- Drop ALL existing leads policies
DROP POLICY IF EXISTS "Public can submit leads" ON leads;
DROP POLICY IF EXISTS "Admins can read leads" ON leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON leads;
DROP POLICY IF EXISTS "Admins can update leads" ON leads;
DROP POLICY IF EXISTS "Allow public inserts" ON leads;
DROP POLICY IF EXISTS "Allow admin reads" ON leads;
DROP POLICY IF EXISTS "Allow admin deletes" ON leads;
DROP POLICY IF EXISTS "Allow admin updates" ON leads;

-- Enable RLS on leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow anyone to submit a lead (public contact form)
CREATE POLICY "Public can submit leads" ON leads
FOR INSERT TO public
WITH CHECK (true);

-- Policy 2: Super admins and admins can read ALL leads
CREATE POLICY "Admins can read all leads" ON leads
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    -- Super Admins
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    -- Admins
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Policy 3: Loan officers can read ONLY their assigned leads
CREATE POLICY "Loan officers can read their leads" ON leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND leads.lo_id = lo.id
  )
);

-- Policy 4: Realtors can read ONLY their assigned leads
CREATE POLICY "Realtors can read their leads" ON leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND leads.realtor_id = r.id
  )
);

-- Policy 5: Super admins and admins can UPDATE leads
CREATE POLICY "Admins can update leads" ON leads
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Policy 6: Loan officers can UPDATE their assigned leads
CREATE POLICY "Loan officers can update their leads" ON leads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND leads.lo_id = lo.id
  )
);

-- Policy 7: Realtors can UPDATE their assigned leads
CREATE POLICY "Realtors can update their leads" ON leads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND leads.realtor_id = r.id
  )
);

-- Policy 8: Only super admins and admins can DELETE leads
CREATE POLICY "Admins can delete leads" ON leads
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- ============================================
-- META_ADS TABLE POLICIES
-- ============================================

-- Drop ALL existing meta_ads policies
DROP POLICY IF EXISTS "Service role can insert meta_ads" ON meta_ads;
DROP POLICY IF EXISTS "Service role can manage meta_ads" ON meta_ads;
DROP POLICY IF EXISTS "Admins can read meta_ads" ON meta_ads;
DROP POLICY IF EXISTS "Admins can update meta_ads" ON meta_ads;
DROP POLICY IF EXISTS "Admins can delete meta_ads" ON meta_ads;

-- Enable RLS on meta_ads table
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow service role to INSERT meta_ads (webhook creates leads)
CREATE POLICY "Service role can insert meta_ads" ON meta_ads
FOR INSERT TO service_role
WITH CHECK (true);

-- Policy 2: Super admins and admins can read ALL meta ads
CREATE POLICY "Admins can read all meta_ads" ON meta_ads
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    -- Super Admins
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    -- Admins
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Policy 3: Loan officers can read ONLY their assigned meta ads
CREATE POLICY "Loan officers can read their meta_ads" ON meta_ads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND meta_ads.lo_id = lo.id
  )
);

-- Policy 4: Realtors can read ONLY their assigned meta ads
CREATE POLICY "Realtors can read their meta_ads" ON meta_ads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND meta_ads.realtor_id = r.id
  )
);

-- Policy 5: Super admins and admins can UPDATE meta ads
CREATE POLICY "Admins can update meta_ads" ON meta_ads
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Policy 6: Loan officers can UPDATE their assigned meta ads
CREATE POLICY "Loan officers can update their meta_ads" ON meta_ads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND meta_ads.lo_id = lo.id
  )
);

-- Policy 7: Realtors can UPDATE their assigned meta ads
CREATE POLICY "Realtors can update their meta_ads" ON meta_ads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND meta_ads.realtor_id = r.id
  )
);

-- Policy 8: Only super admins and admins can DELETE meta ads
CREATE POLICY "Admins can delete meta_ads" ON meta_ads
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- ============================================
-- LEAD_ACTIVITIES TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can read activities" ON lead_activities;
DROP POLICY IF EXISTS "Admins can insert activities" ON lead_activities;
DROP POLICY IF EXISTS "Admins can delete activities" ON lead_activities;

-- Enable RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Admins can read all activities
CREATE POLICY "Admins can read all activities" ON lead_activities
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Loan officers can read activities for their leads
CREATE POLICY "Loan officers can read their lead activities" ON lead_activities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    JOIN leads l ON l.lo_id = lo.id
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND lead_activities.lead_id = l.id
  )
);

-- Realtors can read activities for their leads
CREATE POLICY "Realtors can read their lead activities" ON lead_activities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    JOIN leads l ON l.realtor_id = r.id
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND lead_activities.lead_id = l.id
  )
);

-- Admins can insert activities
CREATE POLICY "Admins can insert activities" ON lead_activities
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Loan officers can insert activities for their leads
CREATE POLICY "Loan officers can insert activities for their leads" ON lead_activities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    JOIN leads l ON l.lo_id = lo.id
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND lead_activities.lead_id = l.id
  )
);

-- Realtors can insert activities for their leads
CREATE POLICY "Realtors can insert activities for their leads" ON lead_activities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM realtors r
    JOIN leads l ON l.realtor_id = r.id
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND lead_activities.lead_id = l.id
  )
);

-- Only admins can delete activities
CREATE POLICY "Admins can delete activities" ON lead_activities
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- ============================================
-- META_AD_ACTIVITIES TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can read activities" ON meta_ad_activities;
DROP POLICY IF EXISTS "Admins can insert activities" ON meta_ad_activities;
DROP POLICY IF EXISTS "Admins can delete activities" ON meta_ad_activities;

-- Enable RLS
ALTER TABLE meta_ad_activities ENABLE ROW LEVEL SECURITY;

-- Admins can read all activities
CREATE POLICY "Admins can read all meta_ad_activities" ON meta_ad_activities
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Loan officers can read activities for their meta ads
CREATE POLICY "Loan officers can read their meta_ad_activities" ON meta_ad_activities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    JOIN meta_ads m ON m.lo_id = lo.id
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND meta_ad_activities.meta_ad_id = m.id
  )
);

-- Realtors can read activities for their meta ads
CREATE POLICY "Realtors can read their meta_ad_activities" ON meta_ad_activities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM realtors r
    JOIN meta_ads m ON m.realtor_id = r.id
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND meta_ad_activities.meta_ad_id = m.id
  )
);

-- Admins can insert activities
CREATE POLICY "Admins can insert meta_ad_activities" ON meta_ad_activities
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- Loan officers can insert activities for their meta ads
CREATE POLICY "Loan officers can insert meta_ad_activities for their leads" ON meta_ad_activities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM loan_officers lo
    JOIN meta_ads m ON m.lo_id = lo.id
    WHERE lo.user_id = auth.uid()
      AND lo.active = true
      AND meta_ad_activities.meta_ad_id = m.id
  )
);

-- Realtors can insert activities for their meta ads
CREATE POLICY "Realtors can insert meta_ad_activities for their leads" ON meta_ad_activities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM realtors r
    JOIN meta_ads m ON m.realtor_id = r.id
    WHERE r.user_id = auth.uid()
      AND r.active = true
      AND meta_ad_activities.meta_ad_id = m.id
  )
);

-- Only admins can delete activities
CREATE POLICY "Admins can delete meta_ad_activities" ON meta_ad_activities
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'mario@regallending.com',
    'dhruv@loandock.com',
    'arnav@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com',
    'robles.barnaby@gmail.com',
    'courtneym007@gmail.com',
    'vinit@closewithmario.com'
  )
);

-- ============================================
-- ✅ SECURITY FIX COMPLETE!
-- ============================================
-- What this fixes:
-- 1. New users who sign up can NO LONGER see all leads
-- 2. Only authorized admins can see all leads
-- 3. Loan officers can only see leads assigned to them (lo_id matches)
-- 4. Realtors can only see leads assigned to them (realtor_id matches)
-- 5. Buyers and unauthorized users see NO leads
--
-- Test by:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Create a test user with Google OAuth or email/password
-- 3. Try to access leads - should see ZERO leads
-- 4. Assign a lead to a loan officer, then test with their account
-- 5. They should ONLY see their assigned leads
-- ============================================

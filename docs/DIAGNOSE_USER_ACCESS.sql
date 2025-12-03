-- ============================================
-- DIAGNOSTIC: Check why mcbusiness3037@gmail.com sees all leads
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Find the user's auth ID
SELECT 
  id as user_id,
  email,
  created_at,
  confirmed_at
FROM auth.users
WHERE email = 'mcbusiness3037@gmail.com';

-- Step 2: Check if user is linked to a loan officer
SELECT 
  lo.id as loan_officer_id,
  lo.first_name,
  lo.last_name,
  lo.email,
  lo.active,
  lo.user_id,
  lo.lead_eligible
FROM loan_officers lo
WHERE lo.email = 'mcbusiness3037@gmail.com'
   OR lo.user_id = (SELECT id FROM auth.users WHERE email = 'mcbusiness3037@gmail.com');

-- Step 3: Check if user is linked to a realtor
SELECT 
  r.id as realtor_id,
  r.first_name,
  r.last_name,
  r.email,
  r.active,
  r.user_id
FROM realtors r
WHERE r.email = 'mcbusiness3037@gmail.com'
   OR r.user_id = (SELECT id FROM auth.users WHERE email = 'mcbusiness3037@gmail.com');

-- Step 4: Check how many leads are assigned to this user (if they're a LO)
SELECT 
  COUNT(*) as assigned_leads_count
FROM leads l
WHERE l.lo_id = (
  SELECT lo.id FROM loan_officers lo
  WHERE lo.user_id = (SELECT id FROM auth.users WHERE email = 'mcbusiness3037@gmail.com')
);

-- Step 5: Check how many leads have NO assignment (lo_id is NULL)
SELECT 
  COUNT(*) as unassigned_leads_count
FROM leads
WHERE lo_id IS NULL;

-- Step 6: Check total leads in database
SELECT 
  COUNT(*) as total_leads_count
FROM leads;

-- ============================================
-- INTERPRETATION:
-- ============================================
-- If Step 2 or 3 returns a row, the user IS a loan officer or realtor
-- If Step 4 shows a count > 0, they have assigned leads
-- If Step 5 shows many unassigned leads, that's the problem
-- If Step 4 count = Step 6 count, they're seeing ALL leads (BUG)
-- ============================================

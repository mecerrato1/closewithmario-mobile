-- Check if mcbusiness3037@gmail.com is linked to a loan officer
SELECT 
  lo.id,
  lo.first_name,
  lo.last_name,
  lo.email,
  lo.user_id,
  lo.active,
  lo.lead_eligible,
  lo.created_at,
  -- Count how many leads are assigned to this LO
  (SELECT COUNT(*) FROM leads WHERE lo_id = lo.id) as assigned_leads_count,
  -- Count total leads
  (SELECT COUNT(*) FROM leads) as total_leads_count
FROM loan_officers lo
WHERE lo.email = 'mcbusiness3037@gmail.com'
   OR lo.user_id IN (SELECT id FROM auth.users WHERE email = 'mcbusiness3037@gmail.com');

-- Also check if there are ANY unlinked loan officers with this email
SELECT 
  id,
  first_name,
  last_name,
  email,
  user_id,
  active
FROM loan_officers
WHERE email = 'mcbusiness3037@gmail.com'
  AND user_id IS NULL;
